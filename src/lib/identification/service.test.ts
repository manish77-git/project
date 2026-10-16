import { describe, expect, it } from "vitest";
import { billIdentificationSchema } from "@/lib/schemas";
import { MAX_IMAGE_BYTES } from "./image-input";
import { WARNING_MANUAL_BILL_NUMBER_USED, WARNING_NO_HOSPITAL_NAME } from "./extract";
import {
  WARNING_MANUAL_ENTRY_ONLY,
  identifyBillFromImage,
  identifyBillFromManualEntry,
  manualEntryRequestSchema,
} from "./service";
import {
  SYNTHETIC_BILL_TEXT,
  crashingOcrEngine,
  fakeOcrEngine,
  unavailableOcrEngine,
} from "./__fixtures__/fake-ocr-engine";
import { syntheticBillPng } from "./__fixtures__/synthetic-image";

const validPng = syntheticBillPng(["SYNTHETIC HOSPITAL"]);
const encoder = new TextEncoder();

/** The exact set of keys an identification response may ever have. */
const ALLOWED_RESULT_KEYS = [
  "billNumberCandidate",
  "hospitalIdentifierCandidate",
  "hospitalNameCandidate",
  "identificationStatus",
  "warnings",
];

function oversizedPng(): Uint8Array {
  const bytes = new Uint8Array(MAX_IMAGE_BYTES + 1);
  bytes.set(validPng.subarray(0, 8), 0);
  return bytes;
}

describe("identifyBillFromImage — success path", () => {
  it("identifies the bill from the image alone", async () => {
    const engine = fakeOcrEngine({ text: SYNTHETIC_BILL_TEXT });
    const outcome = await identifyBillFromImage({ bytes: validPng, engine });

    expect(outcome.kind).toBe("result");
    if (outcome.kind !== "result") return;
    expect(outcome.result).toEqual({
      hospitalNameCandidate: "CITY GENERAL HOSPITAL",
      hospitalIdentifierCandidate: null,
      billNumberCandidate: "INV-2026-0042",
      identificationStatus: "identified",
      warnings: [],
    });
    // The engine is handed the sniffed type, not the client's claim.
    expect(engine.received).toEqual([{ bytes: validPng, mimeType: "image/png" }]);
  });

  it("returns no protected field, ever (case 4)", async () => {
    const engine = fakeOcrEngine({
      text: [
        "CITY GENERAL HOSPITAL",
        "Bill No: INV-2026-0042",
        "Subtotal: Rs 16500",
        "Insurance approved: Rs 5000",
        "Patient paid: Rs 10000",
        "Diagnosis: Viral fever",
      ].join("\n"),
    });

    const outcome = await identifyBillFromImage({ bytes: validPng, engine });
    if (outcome.kind !== "result") throw new Error("expected a result");

    expect(Object.keys(outcome.result).sort()).toEqual(ALLOWED_RESULT_KEYS);
    const serialised = JSON.stringify(outcome.result);
    for (const forbidden of ["16500", "5000", "10000", "Insurance", "Diagnosis", "Viral"]) {
      expect(serialised).not.toContain(forbidden);
    }
    expect(billIdentificationSchema.safeParse(outcome.result).success).toBe(true);
  });
});

describe("identifyBillFromImage — input rejections", () => {
  it("rejects a non-image file without calling the engine (case: invalid file type)", async () => {
    const engine = fakeOcrEngine({ text: SYNTHETIC_BILL_TEXT });
    const outcome = await identifyBillFromImage({
      bytes: encoder.encode("definitely not an image"),
      declaredMimeType: "image/png",
      engine,
    });

    expect(outcome).toEqual({
      kind: "error",
      error: { code: "unsupported_media_type", message: expect.any(String) },
    });
    expect(engine.received).toHaveLength(0);
  });

  it("rejects an oversized image (case: oversized files)", async () => {
    const engine = fakeOcrEngine({ text: SYNTHETIC_BILL_TEXT });
    const outcome = await identifyBillFromImage({ bytes: oversizedPng(), engine });

    expect(outcome.kind).toBe("error");
    if (outcome.kind !== "error") return;
    expect(outcome.error.code).toBe("payload_too_large");
    expect(engine.received).toHaveLength(0);
  });

  it("rejects an empty upload", async () => {
    const engine = fakeOcrEngine({ text: SYNTHETIC_BILL_TEXT });
    const outcome = await identifyBillFromImage({ bytes: new Uint8Array(0), engine });

    expect(outcome.kind).toBe("error");
    if (outcome.kind !== "error") return;
    expect(outcome.error.code).toBe("empty_image");
  });
});

describe("identifyBillFromImage — unreadable images are results, not errors (case 6)", () => {
  it("reports unreadable_image when the engine reads nothing", async () => {
    const engine = fakeOcrEngine({ text: "", meanConfidence: 0 });
    const outcome = await identifyBillFromImage({ bytes: validPng, engine });

    expect(outcome.kind).toBe("result");
    if (outcome.kind !== "result") return;
    expect(outcome.result.identificationStatus).toBe("unreadable_image");
    expect(outcome.result.hospitalNameCandidate).toBeNull();
    expect(outcome.result.billNumberCandidate).toBeNull();
  });

  it("reports unreadable_image when the engine is only guessing", async () => {
    const engine = fakeOcrEngine({ text: SYNTHETIC_BILL_TEXT, meanConfidence: 12 });
    const outcome = await identifyBillFromImage({ bytes: validPng, engine });

    if (outcome.kind !== "result") throw new Error("expected a result");
    expect(outcome.result.identificationStatus).toBe("unreadable_image");
    expect(outcome.result.billNumberCandidate).toBeNull();
  });
});

describe("identifyBillFromImage — engine failures are reported as failures", () => {
  it("reports ocr_unavailable when the engine cannot run, without leaking its message", async () => {
    const outcome = await identifyBillFromImage({ bytes: validPng, engine: unavailableOcrEngine() });

    expect(outcome.kind).toBe("error");
    if (outcome.kind !== "error") return;
    expect(outcome.error.code).toBe("ocr_unavailable");
    expect(outcome.error.message).not.toContain("engine could not start");
  });

  it("reports extraction_failed for an unexpected engine error", async () => {
    const outcome = await identifyBillFromImage({ bytes: validPng, engine: crashingOcrEngine() });

    expect(outcome.kind).toBe("error");
    if (outcome.kind !== "error") return;
    expect(outcome.error.code).toBe("extraction_failed");
  });
});

describe("identifyBillFromImage — typed bill number as a fallback", () => {
  it("uses the typed number when the image yielded none, and says it did", async () => {
    const engine = fakeOcrEngine({ text: "CITY GENERAL HOSPITAL" });
    const outcome = await identifyBillFromImage({
      bytes: validPng,
      engine,
      manualBillNumber: "ab/1234/2026",
    });

    if (outcome.kind !== "result") throw new Error("expected a result");
    expect(outcome.result.billNumberCandidate).toBe("AB/1234/2026");
    expect(outcome.result.identificationStatus).toBe("identified");
    expect(outcome.result.warnings).toContain(WARNING_MANUAL_BILL_NUMBER_USED);
  });

  it("fills in the typed number even when the image itself was unreadable", async () => {
    const engine = fakeOcrEngine({ text: "", meanConfidence: 0 });
    const outcome = await identifyBillFromImage({
      bytes: validPng,
      engine,
      manualBillNumber: "AB/1234/2026",
    });

    if (outcome.kind !== "result") throw new Error("expected a result");
    expect(outcome.result.identificationStatus).toBe("partial");
    expect(outcome.result.billNumberCandidate).toBe("AB/1234/2026");
    expect(outcome.result.warnings).toContain(WARNING_NO_HOSPITAL_NAME);
    // The image still could not be read, and that stays visible.
    expect(outcome.result.warnings.join(" ")).toMatch(/no readable text/i);
  });
});

describe("identifyBillFromManualEntry", () => {
  it("accepts a typed bill number (case 1: manual entry)", () => {
    const outcome = identifyBillFromManualEntry({ billNumber: "inv-2026-0042" });

    if (outcome.kind !== "result") throw new Error("expected a result");
    expect(outcome.result).toEqual({
      hospitalNameCandidate: null,
      hospitalIdentifierCandidate: null,
      billNumberCandidate: "INV-2026-0042",
      identificationStatus: "partial",
      warnings: [WARNING_MANUAL_ENTRY_ONLY, WARNING_NO_HOSPITAL_NAME],
    });
    expect(Object.keys(outcome.result).sort()).toEqual(ALLOWED_RESULT_KEYS);
  });

  it("reaches identified when the hospital name is supplied too", () => {
    const outcome = identifyBillFromManualEntry({
      billNumber: "INV-2026-0042",
      hospitalName: " City General Hospital ",
    });

    if (outcome.kind !== "result") throw new Error("expected a result");
    expect(outcome.result.hospitalNameCandidate).toBe("City General Hospital");
    expect(outcome.result.identificationStatus).toBe("identified");
    expect(outcome.result.warnings).toEqual([WARNING_MANUAL_ENTRY_ONLY]);
  });

  it("keeps a typed value clearly marked as typed, never as read from the bill", () => {
    const outcome = identifyBillFromManualEntry({ billNumber: "INV-2026-0042" });
    if (outcome.kind !== "result") throw new Error("expected a result");
    expect(outcome.result.warnings.join(" ")).toMatch(/entered by hand/i);
  });

  it.each([
    ["a missing bill number", {}],
    ["an empty bill number", { billNumber: "   " }],
    ["a too-short bill number", { billNumber: "12" }],
    ["a bill number with unsupported characters", { billNumber: "INV#2026#0042" }],
    ["a non-string bill number", { billNumber: 20260042 }],
    ["a bill number longer than the limit", { billNumber: "A".repeat(101) }],
    ["an unexpected extra field", { billNumber: "INV-2026-0042", status: "verified" }],
  ])("rejects %s (case: missing bill numbers and malformed input)", (_label, body) => {
    const outcome = identifyBillFromManualEntry(body);
    expect(outcome.kind).toBe("error");
    if (outcome.kind !== "error") return;
    expect(outcome.error.code).toBe("invalid_request");
  });

  it("rejects a null body and a non-object body", () => {
    for (const body of [null, undefined, "INV-2026-0042", 42, []]) {
      const outcome = identifyBillFromManualEntry(body);
      expect(outcome.kind).toBe("error");
    }
  });

  it("does not accept a verification outcome as part of the manual request", () => {
    expect(manualEntryRequestSchema.safeParse({ billNumber: "INV-1", outcome: "verified" }).success).toBe(
      false,
    );
  });
});
