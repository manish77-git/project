/**
 * Upload validation for bill images.
 *
 * Two rules matter here:
 *
 * 1. **The client's Content-Type is not trusted.** The type is decided from the
 *    file's own magic bytes, so a renamed file cannot smuggle a non-image into
 *    the OCR engine.
 * 2. **Only formats the engine can actually decode are accepted.** Rejecting a
 *    format up front with a clear message beats handing it to OCR and reporting
 *    a vague failure.
 *
 * Nothing here touches the filesystem: an upload lives in memory for the
 * duration of one request and is dropped when the response is written.
 */

/** Formats the bundled OCR engine provably decodes (PNG/JPEG/BMP via Leptonica). */
export const ALLOWED_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/bmp"] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/** Maximum accepted upload size in bytes (8 MiB). */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Ceiling for the whole multipart body: the image plus form overhead.
 *
 * Enforced while the body is read (see `src/lib/http/request-body.ts`), so a
 * chunked upload cannot slip past an absent `content-length`.
 */
export const MAX_UPLOAD_BODY_BYTES = MAX_IMAGE_BYTES + 64 * 1024;

export type ImageRejectionCode =
  | "empty_image"
  | "payload_too_large"
  | "unsupported_media_type";

export type BillImageValidation =
  | { ok: true; mimeType: AllowedImageMimeType; byteLength: number }
  | { ok: false; code: ImageRejectionCode; message: string };

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const BMP_SIGNATURE = [0x42, 0x4d];

/** Identifies an image from its magic bytes; `null` when it is not one we accept. */
export function sniffImageMimeType(bytes: Uint8Array): AllowedImageMimeType | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return "image/png";
  if (startsWith(bytes, JPEG_SIGNATURE)) return "image/jpeg";
  if (startsWith(bytes, BMP_SIGNATURE)) return "image/bmp";
  return null;
}

/**
 * Validates raw upload bytes.
 *
 * `declaredMimeType` is used only to explain a rejection — it never decides
 * whether the file is accepted.
 */
export function validateBillImage(input: {
  bytes: Uint8Array;
  declaredMimeType?: string | null;
}): BillImageValidation {
  const { bytes, declaredMimeType } = input;

  if (bytes.byteLength === 0) {
    return {
      ok: false,
      code: "empty_image",
      message: "The uploaded file is empty.",
    };
  }

  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      code: "payload_too_large",
      message: `The image is larger than the ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))} MB limit.`,
    };
  }

  const sniffed = sniffImageMimeType(bytes);
  if (sniffed === null) {
    const declared = declaredMimeType?.trim();
    const suffix = declared ? ` The file was labelled "${declared}".` : "";
    return {
      ok: false,
      code: "unsupported_media_type",
      message: `Unsupported file. Please upload a PNG, JPEG or BMP image.${suffix}`,
    };
  }

  return { ok: true, mimeType: sniffed, byteLength: bytes.byteLength };
}
