import { describe, expect, it } from "vitest";
import { billDocumentExtractionSchema } from "@/lib/schemas";
import { MAX_IMAGE_BYTES } from "@/lib/identification/image-input";
import {
  crashingOcrEngine,
  fakeOcrEngine,
  unavailableOcrEngine,
} from "@/lib/identification/__fixtures__/fake-ocr-engine";
import { syntheticBillPng } from "@/lib/identification/__fixtures__/synthetic-image";
import { extractBillDocument } from "./service";

const validPng = syntheticBillPng(["SYNTHETIC HOSPITAL"]);

function oversizedPng(): Uint8Array {
  const bytes = new Uint8Array(MAX_IMAGE_BYTES + 1);
  bytes.set(validPng.subarray(0, 8), 0);
  return bytes;
}

describe("extractBillDocument", () => {
  it("returns a contract-valid extraction for a readable bill", async () => {
    const outcome = await extractBillDocument({
      bytes: validPng,
      engine: fakeOcrEngine({
        text: [
          "CITY GENERAL HOSPITAL",
          "Bill No: INV-2026-0042",
          "Total Amount: Rs 4,321",
        ].join("\n"),
      }),
    });

    expect(outcome.kind).toBe("result");
    if (outcome.kind !== "result") return;
    expect(outcome.result.totalAmount?.amountRupees).toBe("4321");
    expect(billDocumentExtractionSchema.safeParse(outcome.result).success).toBe(true);
  });

  it("returns an unreadable result instead of an error when nothing was read", async () => {
    const outcome = await extractBillDocument({
      bytes: validPng,
      engine: fakeOcrEngine({ text: "", meanConfidence: 0 }),
    });

    expect(outcome.kind).toBe("result");
    if (outcome.kind !== "result") return;
    expect(outcome.result.readStatus).toBe("unreadable");
    expect(outcome.result.totalAmount).toBeNull();
    expect(outcome.result.lineItems).toEqual([]);
  });

  it("rejects a non-image before any OCR work", async () => {
    const engine = fakeOcrEngine({ text: "CITY GENERAL HOSPITAL" });
    const outcome = await extractBillDocument({
      bytes: new TextEncoder().encode("not an image"),
      declaredMimeType: "image/png",
      engine,
    });

    expect(outcome.kind).toBe("error");
    if (outcome.kind !== "error") return;
    expect(outcome.error.code).toBe("unsupported_media_type");
    expect(engine.received).toHaveLength(0);
  });

  it("rejects an oversized upload", async () => {
    const outcome = await extractBillDocument({
      bytes: oversizedPng(),
      engine: fakeOcrEngine({ text: "CITY GENERAL HOSPITAL" }),
    });

    expect(outcome.kind).toBe("error");
    if (outcome.kind !== "error") return;
    expect(outcome.error.code).toBe("payload_too_large");
  });

  it("reports an unavailable engine as a failure, not as empty bill data", async () => {
    const outcome = await extractBillDocument({
      bytes: validPng,
      engine: unavailableOcrEngine(),
    });

    expect(outcome.kind).toBe("error");
    if (outcome.kind !== "error") return;
    expect(outcome.error.code).toBe("ocr_unavailable");
    expect(outcome.error.message).not.toContain("engine could not start");
  });

  it("reports an unexpected engine crash as a failure", async () => {
    const outcome = await extractBillDocument({
      bytes: validPng,
      engine: crashingOcrEngine(),
    });

    expect(outcome.kind).toBe("error");
    if (outcome.kind !== "error") return;
    expect(outcome.error.code).toBe("extraction_failed");
  });
});
