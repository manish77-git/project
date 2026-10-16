/**
 * HTTP layer for bill identification.
 *
 * Kept out of the route file so the whole HTTP contract — status codes, field
 * names, cache headers, error phrasing — can be tested by calling it directly
 * with a Request, injecting a fake OCR engine. The route file is then only the
 * wiring that supplies the real engine.
 *
 * Two inputs are accepted:
 *   - `multipart/form-data` with a `billImage` file (optionally a typed
 *     `billNumber` used as a fallback when the image cannot be read);
 *   - `application/json` with `{ billNumber, hospitalName? }` for manual entry.
 *
 * Success responses are exactly `billIdentificationSchema` — no engine name, no
 * timing, no internal detail. Failures are `{ error: { code, message } }` with a
 * message safe to show a patient.
 */
import { NextResponse } from "next/server";
import { exceedsUploadContentLength, MAX_IMAGE_BYTES } from "./image-input";
import type { OcrEngine } from "./ocr";
import {
  BILL_NUMBER_REJECTION_MESSAGE,
  identifyBillFromImage,
  identifyBillFromManualEntry,
  isValidBillNumber,
  type IdentificationErrorCode,
  type IdentificationOutcome,
} from "./service";

/** Form field carrying the uploaded bill image. */
export const IMAGE_FIELD_NAME = "billImage";
/** Form field carrying an optional hand-typed bill number. */
export const BILL_NUMBER_FIELD_NAME = "billNumber";

const STATUS_BY_ERROR_CODE: Record<IdentificationErrorCode, number> = {
  invalid_request: 400,
  empty_image: 400,
  unsupported_media_type: 415,
  payload_too_large: 413,
  ocr_unavailable: 503,
  extraction_failed: 500,
};

export interface IdentifyHandlerDependencies {
  engine: OcrEngine;
}

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      // A result is derived from a specific upload and must never be reused.
      "cache-control": "no-store",
    },
  });
}

function respond(outcome: IdentificationOutcome): NextResponse {
  if (outcome.kind === "error") {
    return json({ error: outcome.error }, STATUS_BY_ERROR_CODE[outcome.error.code]);
  }
  return json(outcome.result, 200);
}

function errorResponse(code: IdentificationErrorCode, message: string): NextResponse {
  return json({ error: { code, message } }, STATUS_BY_ERROR_CODE[code]);
}

interface UploadedFileLike {
  size: number;
  type: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

/** Duck-typed so it works with the runtime's own File/Blob implementation. */
function isUploadedFile(value: unknown): value is UploadedFileLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { arrayBuffer?: unknown }).arrayBuffer === "function"
  );
}

async function handleMultipart(
  request: Request,
  dependencies: IdentifyHandlerDependencies,
): Promise<NextResponse> {
  if (exceedsUploadContentLength(request.headers.get("content-length"))) {
    return errorResponse(
      "payload_too_large",
      `The upload is larger than the ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))} MB limit.`,
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse("invalid_request", "The form data could not be read.");
  }

  const numberField = form.get(BILL_NUMBER_FIELD_NAME);
  if (numberField !== null && typeof numberField !== "string") {
    return errorResponse("invalid_request", `"${BILL_NUMBER_FIELD_NAME}" must be text.`);
  }
  const manualBillNumber = typeof numberField === "string" ? numberField : null;
  const typedBillNumber = manualBillNumber?.trim() ?? "";

  // A typed number is client input on this path too, so it is held to the same
  // rule as the JSON entry path. It must never reach a response unvalidated,
  // and must never be quietly truncated to fit — a caller that sends a bad
  // number should be told, not handed back something that looks accepted.
  // Checked before the image is touched, so a bad request costs no OCR work.
  if (typedBillNumber.length > 0 && !isValidBillNumber(typedBillNumber)) {
    return errorResponse("invalid_request", BILL_NUMBER_REJECTION_MESSAGE);
  }

  const fileField = form.get(IMAGE_FIELD_NAME);

  if (fileField === null) {
    // An empty file input with a typed number is a manual-entry request.
    if (typedBillNumber.length > 0) {
      return respond(identifyBillFromManualEntry({ billNumber: typedBillNumber }));
    }
    return errorResponse(
      "invalid_request",
      `Attach the bill image in the "${IMAGE_FIELD_NAME}" field, or send a bill number as JSON.`,
    );
  }

  if (!isUploadedFile(fileField)) {
    return errorResponse("invalid_request", `"${IMAGE_FIELD_NAME}" must be an uploaded file.`);
  }

  if (fileField.size > MAX_IMAGE_BYTES) {
    return errorResponse(
      "payload_too_large",
      `The image is larger than the ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))} MB limit.`,
    );
  }

  const bytes = new Uint8Array(await fileField.arrayBuffer());

  return respond(
    await identifyBillFromImage({
      bytes,
      declaredMimeType: fileField.type || null,
      engine: dependencies.engine,
      manualBillNumber,
    }),
  );
}

async function handleJson(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_request", "The request body must be valid JSON.");
  }
  return respond(identifyBillFromManualEntry(body));
}

/** Entry point used by `POST /api/bills/identify`. */
export async function handleIdentifyRequest(
  request: Request,
  dependencies: IdentifyHandlerDependencies,
): Promise<NextResponse> {
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();

  if (contentType.includes("multipart/form-data")) {
    return handleMultipart(request, dependencies);
  }

  if (contentType.includes("application/json")) {
    return handleJson(request);
  }

  return errorResponse(
    "unsupported_media_type",
    "Send the bill image as multipart/form-data, or a bill number as application/json.",
  );
}
