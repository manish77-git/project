/**
 * Bill identification service.
 *
 * Answers exactly one question: *what does this document appear to say?* It
 * never decides whether a bill is genuine — that is verification, which lives
 * in a separate stage and is not imported here.
 *
 * Every path ends by parsing the result with `billIdentificationSchema`, so the
 * published contract — not this module's internal shape — decides what may
 * leave the service. A result that does not satisfy the schema becomes an
 * `extraction_failed` error rather than a made-up success.
 */
import { z } from "zod";
import { billIdentificationSchema, type BillIdentification } from "@/lib/schemas";
import {
  applyManualBillNumber,
  buildIdentificationResult,
  extractBillCandidates,
  normalizeBillNumber,
  normalizeHospitalName,
} from "./extract";
import { validateBillImage } from "./image-input";
import { OcrEngineError, type OcrEngine, type OcrPageText } from "./ocr";

export const WARNING_MANUAL_ENTRY_ONLY =
  "This bill number was entered by hand and has not been read from the bill image.";

/**
 * The single rule for a hand-typed bill number.
 *
 * Shared deliberately: a typed number is client input whether it arrives as
 * JSON or as a fallback field beside an image, so both paths must accept and
 * reject exactly the same values. While this rule lived only in the JSON
 * request schema, the multipart fallback passed the field straight through — a
 * 150-character value was silently truncated to 100 instead of being rejected,
 * and a value containing markup was echoed back in `billNumberCandidate`.
 */
export const billNumberFieldSchema = z
  .string()
  .trim()
  .min(3, "A bill number needs at least 3 characters.")
  .max(100, "A bill number cannot be longer than 100 characters.")
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9/\-_. ]*$/,
    "A bill number may only contain letters, digits and the separators / - _ .",
  );

/** Patient-safe rejection message, identical whichever entry path was used. */
export const BILL_NUMBER_REJECTION_MESSAGE =
  "Provide a bill number of at least 3 characters, using only letters, digits and the separators / - _ .";

/** True when a hand-typed bill number satisfies {@link billNumberFieldSchema}. */
export function isValidBillNumber(value: string): boolean {
  return billNumberFieldSchema.safeParse(value).success;
}

/** Request body accepted by the manual-entry path. */
export const manualEntryRequestSchema = z
  .object({
    billNumber: billNumberFieldSchema,
    hospitalName: z.string().trim().min(2).max(300).optional(),
  })
  .strict();
export type ManualEntryRequest = z.infer<typeof manualEntryRequestSchema>;

export type IdentificationErrorCode =
  | "invalid_request"
  | "empty_image"
  | "unsupported_media_type"
  | "payload_too_large"
  | "ocr_unavailable"
  | "extraction_failed";

export interface IdentificationError {
  code: IdentificationErrorCode;
  /** Safe to show a patient: no paths, stack traces or engine internals. */
  message: string;
}

export type IdentificationOutcome =
  | { kind: "result"; result: BillIdentification }
  | { kind: "error"; error: IdentificationError };

function errorOutcome(code: IdentificationErrorCode, message: string): IdentificationOutcome {
  return { kind: "error", error: { code, message } };
}

/**
 * Last gate before a result leaves the service: the strict schema decides.
 *
 * Until an engine's output has been through here it is untrusted, so nothing
 * downstream needs to defend against a candidate shape carrying extra fields.
 */
function validateIdentification(raw: BillIdentification): IdentificationOutcome {
  const parsed = billIdentificationSchema.safeParse(raw);
  if (!parsed.success) {
    return errorOutcome(
      "extraction_failed",
      "The bill could not be read in a form we can use. Please try another photo.",
    );
  }
  return { kind: "result", result: parsed.data };
}

const GENERIC_OCR_FAILURE =
  "The image could not be processed right now. Please try again, or enter the bill number instead.";

/**
 * Identifies a bill from an uploaded image.
 *
 * `manualBillNumber` is optional and only a fallback: if the image yielded no
 * number, the typed one is used and the response says so.
 *
 * NOTE ON DIAGNOSTICS: a failed engine is reported to the caller as a plain
 * `ocr_unavailable` with no internal detail, so engine errors, file paths and
 * worker messages cannot leak through the response. Wiring these failures to a
 * server-side logger is a separate, later concern.
 */
export async function identifyBillFromImage(input: {
  bytes: Uint8Array;
  declaredMimeType?: string | null;
  engine: OcrEngine;
  manualBillNumber?: string | null;
}): Promise<IdentificationOutcome> {
  const validation = validateBillImage({
    bytes: input.bytes,
    declaredMimeType: input.declaredMimeType,
  });
  if (!validation.ok) {
    return errorOutcome(validation.code, validation.message);
  }

  let page: OcrPageText;
  try {
    page = await input.engine.recognizeImage({
      bytes: input.bytes,
      mimeType: validation.mimeType,
    });
  } catch (error) {
    if (error instanceof OcrEngineError) {
      return errorOutcome("ocr_unavailable", GENERIC_OCR_FAILURE);
    }
    return errorOutcome("extraction_failed", GENERIC_OCR_FAILURE);
  }

  let result = extractBillCandidates(page);

  const manualBillNumber = input.manualBillNumber?.trim();
  if (manualBillNumber) {
    result = applyManualBillNumber(result, manualBillNumber);
  }

  return validateIdentification(result);
}

/**
 * Identifies a bill from a hand-typed bill number.
 *
 * A hospital name may be supplied too; without it the status is `partial`,
 * because the hospital is still unknown. The result always carries a warning
 * saying the number was typed by hand, so nothing downstream can mistake a
 * typed value for something read off the document.
 */
export function identifyBillFromManualEntry(input: unknown): IdentificationOutcome {
  const parsed = manualEntryRequestSchema.safeParse(input);
  if (!parsed.success) {
    return errorOutcome("invalid_request", BILL_NUMBER_REJECTION_MESSAGE);
  }

  return validateIdentification(
    buildIdentificationResult({
      billNumber: normalizeBillNumber(parsed.data.billNumber),
      hospitalName: parsed.data.hospitalName
        ? normalizeHospitalName(parsed.data.hospitalName)
        : null,
      warnings: [WARNING_MANUAL_ENTRY_ONLY],
    }),
  );
}
