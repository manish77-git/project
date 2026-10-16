/**
 * Real OCR integration check — `npm run test:ocr`.
 *
 * These tests use the *real* Tesseract engine (no fake) against real image
 * files, so "the endpoint performs OCR" is backed by an actual engine run:
 *
 *   - `synthetic-bill.png` / `synthetic-bill.jpg` — synthetic bills (invented
 *     hospital, invented number, no patient data) containing the two fields to
 *     extract *and* amount/insurance lines that must never be returned;
 *   - generated blank/noise images for the failure paths.
 *
 * Excluded from `npm test` on purpose: the first run downloads traineddata
 * (~15 MB) into the OS temp directory, and `npm test` must stay hermetic.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { identifyBillFromImage } from "@/lib/identification/service";
import { createTesseractOcrEngine } from "@/lib/identification/tesseract-engine";
import { blankPng, unreadablePng } from "@/lib/identification/__fixtures__/synthetic-image";

const engine = createTesseractOcrEngine();

const HOSPITAL_NAME = "CITY GENERAL HOSPITAL";
const BILL_NUMBER = "INV-2026-0042";

function fixture(name: string): Uint8Array {
  return new Uint8Array(
    readFileSync(new URL(`../../src/lib/identification/__fixtures__/${name}`, import.meta.url)),
  );
}

const PNG_BILL = fixture("synthetic-bill.png");
const JPEG_BILL = fixture("synthetic-bill.jpg");

describe("real Tesseract OCR engine", () => {
  it("reports which engine ran, so a fake can never be mistaken for it", () => {
    expect(engine.engineId).toBe("tesseract.js");
  });

  it.each([
    ["PNG", PNG_BILL, "image/png"],
    ["JPEG", JPEG_BILL, "image/jpeg"],
  ])("reads the text off a synthetic bill image (%s)", async (_label, bytes, mimeType) => {
    const page = await engine.recognizeImage({ bytes, mimeType });

    // Diagnostics: the raw reading, useful when tuning extraction thresholds.
    console.log(`[real-ocr] ${_label} confidence=${page.meanConfidence.toFixed(1)}`);
    console.log(`[real-ocr] ${_label} text=${JSON.stringify(page.text)}`);

    expect(page.meanConfidence).toBeGreaterThan(80);
    expect(page.text).toContain(HOSPITAL_NAME);
    expect(page.text).toContain(BILL_NUMBER);
    // The page really does carry protected figures — which is the point of the
    // "nothing leaks" assertion below.
    expect(page.text).toContain("15000");
    expect(page.text).toContain("5000");
  });
});

describe("identification over real OCR", () => {
  it.each([
    ["PNG", PNG_BILL, "image/png"],
    ["JPEG", JPEG_BILL, "image/jpeg"],
  ])("identifies the hospital and bill number from a %s upload", async (_label, bytes, mimeType) => {
    // The declared type is what a browser would send; the service still decides
    // from the file's magic bytes.
    const outcome = await identifyBillFromImage({ bytes, declaredMimeType: mimeType, engine });

    expect(outcome.kind).toBe("result");
    if (outcome.kind !== "result") return;

    expect(outcome.result).toEqual({
      hospitalNameCandidate: HOSPITAL_NAME,
      hospitalIdentifierCandidate: null,
      billNumberCandidate: BILL_NUMBER,
      identificationStatus: "identified",
      warnings: [],
    });
  });

  it("returns no amount, insurance or other protected value (case 4, over real OCR)", async () => {
    const outcome = await identifyBillFromImage({ bytes: PNG_BILL, engine });
    if (outcome.kind !== "result") throw new Error("expected a result");

    const serialised = JSON.stringify(outcome.result).toLowerCase();
    for (const forbidden of ["15000", "5000", "insurance", "amount", "outcome"]) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it("never fabricates a value for a blank image", async () => {
    const outcome = await identifyBillFromImage({ bytes: blankPng(), engine });

    expect(outcome.kind).toBe("result");
    if (outcome.kind !== "result") return;

    expect(outcome.result.identificationStatus).not.toBe("identified");
    expect(outcome.result.billNumberCandidate).toBeNull();
    expect(outcome.result.hospitalNameCandidate).toBeNull();
  });

  it("treats image noise as unreadable rather than inventing a bill number", async () => {
    const outcome = await identifyBillFromImage({ bytes: unreadablePng(), engine });

    expect(outcome.kind).toBe("result");
    if (outcome.kind !== "result") return;

    console.log(`[real-ocr] noise status=${outcome.result.identificationStatus}`);
    expect(["unreadable_image", "invalid_input"]).toContain(outcome.result.identificationStatus);
    expect(outcome.result.billNumberCandidate).toBeNull();
    expect(outcome.result.hospitalNameCandidate).toBeNull();
  });
});
