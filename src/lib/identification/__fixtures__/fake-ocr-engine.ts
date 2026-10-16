/**
 * Fake OCR engines for tests.
 *
 * The point of the `OcrEngine` port is that everything above it can be tested
 * without Tesseract: these return canned text (or fail on demand) so the suite
 * is fast, deterministic and completely offline.
 */
import { OcrEngineError, type OcrEngine, type OcrImageInput, type OcrPageText } from "../ocr";

export interface FakeOcrEngine extends OcrEngine {
  /** Every image handed to the engine, for assertions about MIME type etc. */
  readonly received: OcrImageInput[];
}

/** An engine that returns the given page text. */
export function fakeOcrEngine(page: {
  text: string;
  meanConfidence?: number;
}): FakeOcrEngine {
  const received: OcrImageInput[] = [];
  return {
    engineId: "fake",
    received,
    async recognizeImage(image: OcrImageInput): Promise<OcrPageText> {
      received.push(image);
      return { text: page.text, meanConfidence: page.meanConfidence ?? 92 };
    },
  };
}

/** An engine that cannot run at all — the "OCR unavailable" failure. */
export function unavailableOcrEngine(): FakeOcrEngine {
  const received: OcrImageInput[] = [];
  return {
    engineId: "fake-unavailable",
    received,
    async recognizeImage(image: OcrImageInput): Promise<OcrPageText> {
      received.push(image);
      throw new OcrEngineError("engine could not start");
    },
  };
}

/** An engine that fails in an unexpected way — the "extraction failed" path. */
export function crashingOcrEngine(): FakeOcrEngine {
  const received: OcrImageInput[] = [];
  return {
    engineId: "fake-crashing",
    received,
    async recognizeImage(image: OcrImageInput): Promise<OcrPageText> {
      received.push(image);
      throw new TypeError("unexpected internal failure");
    },
  };
}

/** Text a real bill would produce, kept synthetic. */
export const SYNTHETIC_BILL_TEXT = [
  "CITY GENERAL HOSPITAL",
  "Bengaluru",
  "Bill No: INV-2026-0042",
  "Bill Date: 2026-10-01",
  "Total Amount: Rs 15000",
].join("\n");
