/**
 * Document extraction service.
 *
 * Runs the existing OCR infrastructure over one uploaded image and returns the
 * values that were read off it, validated by the published document contract.
 * It never verifies, never looks up a record and never substitutes a sample:
 * an unreadable upload is an unreadable result.
 *
 * Failures keep the same vocabulary as identification so a caller cannot
 * confuse "we could not process the file" with "we read it and a field was
 * missing".
 */
import {
  billDocumentExtractionSchema,
  type BillDocumentExtraction,
} from "@/lib/schemas";
import { validateBillImage } from "@/lib/identification/image-input";
import { OcrEngineError, type OcrEngine } from "@/lib/identification/ocr";
import { extractDocumentFields } from "./extract";

export type DocumentExtractionErrorCode =
  | "invalid_request"
  | "empty_image"
  | "unsupported_media_type"
  | "payload_too_large"
  | "ocr_unavailable"
  | "extraction_failed";

export interface DocumentExtractionError {
  code: DocumentExtractionErrorCode;
  /** Safe to show a patient: no paths, stack traces or engine internals. */
  message: string;
}

export type DocumentExtractionOutcome =
  | { kind: "result"; result: BillDocumentExtraction }
  | { kind: "error"; error: DocumentExtractionError };

const GENERIC_OCR_FAILURE =
  "The document could not be processed right now. Please try again, or enter the bill number instead.";

function errorOutcome(
  code: DocumentExtractionErrorCode,
  message: string,
): DocumentExtractionOutcome {
  return { kind: "error", error: { code, message } };
}

/** Last gate: only the published contract may leave the service. */
function validate(raw: BillDocumentExtraction): DocumentExtractionOutcome {
  const parsed = billDocumentExtractionSchema.safeParse(raw);
  if (!parsed.success) {
    return errorOutcome(
      "extraction_failed",
      "The document could not be read in a form we can use. Please try another photo.",
    );
  }
  return { kind: "result", result: parsed.data };
}

export async function extractBillDocument(input: {
  bytes: Uint8Array;
  declaredMimeType?: string | null;
  engine: OcrEngine;
}): Promise<DocumentExtractionOutcome> {
  const validation = validateBillImage({
    bytes: input.bytes,
    declaredMimeType: input.declaredMimeType,
  });
  if (!validation.ok) {
    return errorOutcome(validation.code, validation.message);
  }

  let page;
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

  return validate(extractDocumentFields(page));
}
