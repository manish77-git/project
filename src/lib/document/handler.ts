/**
 * HTTP layer for reading an uploaded bill.
 *
 * `POST /api/bills/extract` accepts one multipart image and returns the
 * document-extraction contract: values read off the bill, each with the line it
 * came from, and an explicit `notice` that none of it is verified.
 *
 * This endpoint is intentionally not an explanation endpoint and not a
 * verification endpoint. It cannot return a record amount, a verdict, or a
 * generated report, so a client cannot mistake "read from the photo" for
 * "checked with the hospital".
 */
import { NextResponse } from "next/server";
import { readMultipartFormData } from "@/lib/http/request-body";
import { MAX_IMAGE_BYTES, MAX_UPLOAD_BODY_BYTES } from "@/lib/identification/image-input";
import type { OcrEngine } from "@/lib/identification/ocr";
import {
  extractBillDocument,
  type DocumentExtractionErrorCode,
  type DocumentExtractionOutcome,
} from "./service";

/** Form field carrying the uploaded bill image. */
export const DOCUMENT_IMAGE_FIELD_NAME = "billImage";

const STATUS_BY_ERROR_CODE: Record<DocumentExtractionErrorCode, number> = {
  invalid_request: 400,
  empty_image: 400,
  unsupported_media_type: 415,
  payload_too_large: 413,
  ocr_unavailable: 503,
  extraction_failed: 500,
};

export interface ExtractHandlerDependencies {
  engine: OcrEngine;
}

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      // One upload, one result: never reused or cached.
      "cache-control": "no-store",
    },
  });
}

function errorResponse(
  code: DocumentExtractionErrorCode,
  message: string,
): NextResponse {
  return json({ error: { code, message } }, STATUS_BY_ERROR_CODE[code]);
}

function respond(outcome: DocumentExtractionOutcome): NextResponse {
  if (outcome.kind === "error") {
    return errorResponse(outcome.error.code, outcome.error.message);
  }
  return json(outcome.result, 200);
}

interface UploadedFileLike {
  size: number;
  type: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

function isUploadedFile(value: unknown): value is UploadedFileLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { arrayBuffer?: unknown }).arrayBuffer === "function"
  );
}

export async function handleExtractRequest(
  request: Request,
  dependencies: ExtractHandlerDependencies,
): Promise<NextResponse> {
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("multipart/form-data")) {
    return errorResponse(
      "unsupported_media_type",
      "Send the bill image as multipart/form-data.",
    );
  }

  const parsedForm = await readMultipartFormData(request, MAX_UPLOAD_BODY_BYTES);
  if (!parsedForm.ok) {
    if (parsedForm.reason === "too_large") {
      return errorResponse(
        "payload_too_large",
        `The upload is larger than the ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))} MB limit.`,
      );
    }
    return errorResponse("invalid_request", "The form data could not be read.");
  }

  const fileField = parsedForm.form.get(DOCUMENT_IMAGE_FIELD_NAME);
  if (fileField === null) {
    return errorResponse(
      "invalid_request",
      `Attach the bill image in the "${DOCUMENT_IMAGE_FIELD_NAME}" field.`,
    );
  }
  if (!isUploadedFile(fileField)) {
    return errorResponse(
      "invalid_request",
      `"${DOCUMENT_IMAGE_FIELD_NAME}" must be an uploaded file.`,
    );
  }
  if (fileField.size > MAX_IMAGE_BYTES) {
    return errorResponse(
      "payload_too_large",
      `The image is larger than the ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))} MB limit.`,
    );
  }

  const bytes = new Uint8Array(await fileField.arrayBuffer());
  return respond(
    await extractBillDocument({
      bytes,
      declaredMimeType: fileField.type || null,
      engine: dependencies.engine,
    }),
  );
}
