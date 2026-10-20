import { describe, expect, it } from "vitest";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  MAX_UPLOAD_BODY_BYTES,
  sniffImageMimeType,
  validateBillImage,
} from "./image-input";
import { encodeBmp, encodePng, renderTextToRaster, syntheticBillPng } from "./__fixtures__/synthetic-image";

const encoder = new TextEncoder();

function oversizedBytes(): Uint8Array {
  // A real PNG header, then filler that pushes the file past the limit.
  const png = syntheticBillPng(["SYNTHETIC HOSPITAL"]);
  const bytes = new Uint8Array(MAX_IMAGE_BYTES + 1);
  bytes.set(png.subarray(0, 8), 0);
  return bytes;
}

describe("sniffImageMimeType", () => {
  it("recognises the three supported formats from their magic bytes", () => {
    const raster = renderTextToRaster(["SYNTHETIC HOSPITAL"]);
    expect(sniffImageMimeType(encodePng(raster))).toBe("image/png");
    expect(sniffImageMimeType(encodeBmp(raster))).toBe("image/bmp");
    expect(sniffImageMimeType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe("image/jpeg");
  });

  it("rejects content that is not an image", () => {
    expect(sniffImageMimeType(encoder.encode("this is a text file, not a bill"))).toBeNull();
    expect(sniffImageMimeType(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull(); // %PDF
  });

  it("rejects a truncated signature", () => {
    expect(sniffImageMimeType(new Uint8Array([0x89, 0x50]))).toBeNull();
    expect(sniffImageMimeType(new Uint8Array([]))).toBeNull();
  });
});

describe("validateBillImage", () => {
  it("accepts a supported image and reports the sniffed type", () => {
    const result = validateBillImage({ bytes: syntheticBillPng(["SYNTHETIC HOSPITAL"]) });
    expect(result).toEqual({
      ok: true,
      mimeType: "image/png",
      byteLength: expect.any(Number),
    });
  });

  it("trusts the file content over the client-declared type", () => {
    // A browser that mislabels the file must not change how we treat it.
    const result = validateBillImage({
      bytes: syntheticBillPng(["SYNTHETIC HOSPITAL"]),
      declaredMimeType: "text/plain",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mimeType).toBe("image/png");
  });

  it("rejects an empty upload", () => {
    const result = validateBillImage({ bytes: new Uint8Array(0) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("empty_image");
  });

  it("rejects a file over the size limit", () => {
    const result = validateBillImage({ bytes: oversizedBytes() });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("payload_too_large");
  });

  it("rejects a non-image file and mentions the label it came with", () => {
    const result = validateBillImage({
      bytes: encoder.encode("Patient: not a real bill"),
      declaredMimeType: "image/png",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unsupported_media_type");
      expect(result.message).toContain("image/png");
    }
  });

  it("only allows formats the OCR engine can decode", () => {
    expect(ALLOWED_IMAGE_MIME_TYPES).toEqual(["image/png", "image/jpeg", "image/bmp"]);
    expect(ALLOWED_IMAGE_MIME_TYPES).not.toContain("image/svg+xml");
    expect(ALLOWED_IMAGE_MIME_TYPES).not.toContain("application/pdf");
  });
});

describe("MAX_UPLOAD_BODY_BYTES", () => {
  it("leaves room for multipart framing on top of a maximum-size image", () => {
    expect(MAX_UPLOAD_BODY_BYTES).toBeGreaterThan(MAX_IMAGE_BYTES);
    expect(MAX_UPLOAD_BODY_BYTES - MAX_IMAGE_BYTES).toBe(64 * 1024);
  });
});
