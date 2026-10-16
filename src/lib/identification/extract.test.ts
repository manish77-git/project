import { describe, expect, it } from "vitest";
import { billIdentificationSchema } from "@/lib/schemas";
import {
  HOSPITAL_NAME_SEARCH_LINES,
  MIN_MEAN_CONFIDENCE,
  MIN_READABLE_CHARACTERS,
  WARNING_MANUAL_BILL_NUMBER_MISMATCH,
  WARNING_MANUAL_BILL_NUMBER_USED,
  WARNING_NOT_A_BILL,
  WARNING_NO_BILL_NUMBER,
  WARNING_NO_HOSPITAL_NAME,
  WARNING_UNLABELLED_BILL_NUMBER,
  applyManualBillNumber,
  countMeaningfulCharacters,
  extractBillCandidates,
  normalizeBillNumber,
  normalizeHospitalName,
  normalizeOcrText,
} from "./extract";
import { SYNTHETIC_BILL_TEXT } from "./__fixtures__/fake-ocr-engine";

function extract(text: string, meanConfidence = 92) {
  const result = extractBillCandidates({ text, meanConfidence });
  // Every result this module produces must satisfy the published contract.
  expect(billIdentificationSchema.safeParse(result).success, JSON.stringify(result)).toBe(true);
  return result;
}

describe("normalizeOcrText", () => {
  it("collapses whitespace, strips form feeds and trims lines", () => {
    expect(normalizeOcrText("  CITY   GENERAL\r\n\f  HOSPITAL  \t")).toBe(
      "CITY GENERAL\n\nHOSPITAL",
    );
    // Lines are trimmed, so a blank line becomes truly empty.
    expect(normalizeOcrText("   \n  \nCITY").split("\n")).toEqual(["", "", "CITY"]);
  });
});

describe("normalizeBillNumber / normalizeHospitalName / countMeaningfulCharacters", () => {
  it("trims separators and uppercases a bill number", () => {
    expect(normalizeBillNumber("  inv-2026-0042. ")).toBe("INV-2026-0042");
    expect(normalizeBillNumber("ab/1234/2026,")).toBe("AB/1234/2026");
  });

  it("keeps a long bill number inside the schema limit", () => {
    expect(normalizeBillNumber("A".repeat(120)).length).toBe(100);
  });

  it("strips edge punctuation from a hospital name", () => {
    expect(normalizeHospitalName(" , City General Hospital - ")).toBe("City General Hospital");
  });

  it("counts only letters and digits", () => {
    expect(countMeaningfulCharacters("A-1 : 2/3")).toBe(4);
    expect(countMeaningfulCharacters(" --- :/ ")).toBe(0);
  });
});

describe("extractBillCandidates — successful identification", () => {
  it("reads the hospital name and the labelled bill number (case 1)", () => {
    const result = extract(SYNTHETIC_BILL_TEXT);
    expect(result).toEqual({
      hospitalNameCandidate: "CITY GENERAL HOSPITAL",
      hospitalIdentifierCandidate: null,
      billNumberCandidate: "INV-2026-0042",
      identificationStatus: "identified",
      warnings: [],
    });
  });

  it("never returns a hospital identifier — this stage extracts the name only", () => {
    const text = ["CITY GENERAL HOSPITAL", "Reg No: KA-REG-12345", "Bill No: 4455"].join("\n");
    expect(extract(text).hospitalIdentifierCandidate).toBeNull();
  });

  it("finds the hospital above other bill-like lines", () => {
    const text = ["TAX INVOICE", "Sunrise Medical Centre", "Bill Number : AB/1234/2026"].join("\n");
    const result = extract(text);
    expect(result.hospitalNameCandidate).toBe("Sunrise Medical Centre");
    expect(result.billNumberCandidate).toBe("AB/1234/2026");
    expect(result.identificationStatus).toBe("identified");
  });

  it("accepts an unlabelled bill-like token but says so", () => {
    const text = ["CITY GENERAL HOSPITAL", "INV-2026-0042"].join("\n");
    const result = extract(text);
    expect(result.billNumberCandidate).toBe("INV-2026-0042");
    expect(result.warnings).toContain(WARNING_UNLABELLED_BILL_NUMBER);
  });

  it("does not require a reported confidence (0 means not reported)", () => {
    const result = extractBillCandidates({ text: SYNTHETIC_BILL_TEXT, meanConfidence: 0 });
    expect(result.identificationStatus).toBe("identified");
  });
});

describe("extractBillCandidates — missing fields", () => {
  it("reports partial when the bill number cannot be read (case 2)", () => {
    const result = extract("CITY GENERAL HOSPITAL\nBengaluru");
    expect(result.identificationStatus).toBe("partial");
    expect(result.billNumberCandidate).toBeNull();
    expect(result.hospitalNameCandidate).toBe("CITY GENERAL HOSPITAL");
    expect(result.warnings).toContain(WARNING_NO_BILL_NUMBER);
  });

  it("reports partial when the hospital name cannot be read", () => {
    const result = extract("Bill No: INV-2026-0042\nTotal: Rs 15000");
    expect(result.identificationStatus).toBe("partial");
    expect(result.hospitalNameCandidate).toBeNull();
    expect(result.billNumberCandidate).toBe("INV-2026-0042");
    expect(result.warnings).toContain(WARNING_NO_HOSPITAL_NAME);
  });

  it("does not mistake a label-only line for a hospital name", () => {
    const result = extract("Hospital Name:\nBill No: 4455");
    expect(result.hospitalNameCandidate).toBeNull();
    expect(result.identificationStatus).toBe("partial");
  });

  it("does not mistake a date, phone number, amount or GSTIN for a bill number", () => {
    const text = [
      "CITY GENERAL HOSPITAL",
      "Bill Date: 2026-10-01",
      "Ph: 9876543210",
      "GSTIN: 29ABCDE1234F1Z5",
      "Total Amount: Rs 15000",
    ].join("\n");
    const result = extract(text);
    expect(result.billNumberCandidate).toBeNull();
    expect(result.identificationStatus).toBe("partial");
  });

  it("only looks at the top of the page for the hospital name", () => {
    const filler = Array.from(
      { length: HOSPITAL_NAME_SEARCH_LINES + 3 },
      (_, index) => `Line ${index}`,
    );

    // Below the search window: not used, and nothing else was read either.
    const belowTheWindow = extract([...filler, "Hidden Valley Hospital"].join("\n"));
    expect(belowTheWindow.hospitalNameCandidate).toBeNull();
    expect(belowTheWindow.identificationStatus).toBe("invalid_input");

    // The same line inside the window is picked up, so the limit is the only
    // reason the case above fails.
    const insideTheWindow = extract(["Hidden Valley Hospital", ...filler].join("\n"));
    expect(insideTheWindow.hospitalNameCandidate).toBe("Hidden Valley Hospital");
  });
});

describe("extractBillCandidates — unreadable and non-bill input (case 6)", () => {
  it("reports unreadable_image with no candidates for empty text", () => {
    const result = extract("");
    expect(result.identificationStatus).toBe("unreadable_image");
    expect(result.hospitalNameCandidate).toBeNull();
    expect(result.billNumberCandidate).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("reports unreadable_image when too little text was found", () => {
    const text = "abc";
    expect(countMeaningfulCharacters(text)).toBeLessThan(MIN_READABLE_CHARACTERS);
    expect(extract(text).identificationStatus).toBe("unreadable_image");
  });

  it("reports unreadable_image when confidence is too low to trust", () => {
    const result = extract(SYNTHETIC_BILL_TEXT, MIN_MEAN_CONFIDENCE - 1);
    expect(result.identificationStatus).toBe("unreadable_image");
    expect(result.billNumberCandidate).toBeNull();
  });

  it("reports invalid_input — not a fabricated value — for readable non-bill text", () => {
    const result = extract("INVOICE TERMS AND CONDITIONS\nThank you for your visit today.");
    expect(result.identificationStatus).toBe("invalid_input");
    expect(result.hospitalNameCandidate).toBeNull();
    expect(result.billNumberCandidate).toBeNull();
    expect(result.warnings).toContain(WARNING_NOT_A_BILL);
  });

  it("never uses an identification status that belongs to verification", () => {
    const outcomes = ["", "abc", "CITY GENERAL HOSPITAL", SYNTHETIC_BILL_TEXT].map(
      (text) => extract(text).identificationStatus,
    );
    for (const outcome of outcomes) {
      expect(["verified", "amounts_differ", "bill_not_found", "hospital_not_registered"]).not.toContain(
        outcome,
      );
    }
  });
});

describe("applyManualBillNumber", () => {
  it("fills in a number the image could not read", () => {
    const partial = extract("CITY GENERAL HOSPITAL");
    const result = applyManualBillNumber(partial, "inv-2026-0042");
    expect(result.identificationStatus).toBe("identified");
    expect(result.billNumberCandidate).toBe("INV-2026-0042");
    expect(result.warnings).toContain(WARNING_MANUAL_BILL_NUMBER_USED);
    // The now-outdated "could not be read" warning must not survive.
    expect(result.warnings).not.toContain(WARNING_NO_BILL_NUMBER);
    expect(billIdentificationSchema.safeParse(result).success).toBe(true);
  });

  it("leaves the result untouched when the typed number matches", () => {
    const identified = extract(SYNTHETIC_BILL_TEXT);
    const result = applyManualBillNumber(identified, "inv-2026-0042");
    expect(result).toEqual(identified);
  });

  it("keeps the number read from the image and warns about the disagreement", () => {
    const identified = extract(SYNTHETIC_BILL_TEXT);
    const result = applyManualBillNumber(identified, "INV-9999-0001");
    expect(result.billNumberCandidate).toBe("INV-2026-0042");
    expect(result.warnings).toContain(WARNING_MANUAL_BILL_NUMBER_MISMATCH);
  });

  it("ignores an empty typed number", () => {
    const identified = extract(SYNTHETIC_BILL_TEXT);
    expect(applyManualBillNumber(identified, "   ")).toEqual(identified);
  });
});
