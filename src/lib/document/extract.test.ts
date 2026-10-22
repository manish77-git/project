import { describe, expect, it } from "vitest";
import { billDocumentExtractionSchema, DOCUMENT_EXTRACTION_NOTICE } from "@/lib/schemas";
import {
  WARNING_AMBIGUOUS_TOTAL,
  WARNING_NO_AMOUNTS,
  WARNING_NO_LINE_ITEMS,
  WARNING_UNREADABLE_DOCUMENT,
  extractDocumentFields,
} from "./extract";

/** A synthetic bill whose figures deliberately differ from the demo bill. */
const SYNTHETIC_UPLOAD = [
  "CITY GENERAL HOSPITAL",
  "12 MG Road, Bengaluru",
  "GSTIN: 29ABCDE1234F1Z5",
  "Bill No: INV-2026-0042",
  "Bill Date: 01/10/2026",
  "Consultation Fee 800",
  "CBC Blood Test 450.00",
  "Chest X-Ray 1200",
  "Pharmacy 650",
  "Total Amount: Rs 2,750.00",
  "Insurance Approved: Rs 500",
  "Patient Payable: Rs 2,250",
].join("\n");

function extract(text: string, meanConfidence = 92) {
  return extractDocumentFields({ text, meanConfidence });
}

describe("extractDocumentFields — reads the uploaded bill", () => {
  it("reads a five-digit amount without truncating it to three digits", () => {
    const result = extract([
      "CITY GENERAL HOSPITAL",
      "Total Amount: Rs 15000",
      "Insurance approved: Rs 5000",
    ].join("\n"));

    expect(result.totalAmount?.amountRupees).toBe("15000");
    expect(result.insuranceApprovedAmount?.amountRupees).toBe("5000");
  });

  it("reads the bill's own total instead of a demo figure", () => {
    const result = extract(SYNTHETIC_UPLOAD);

    expect(result.readStatus).toBe("readable");
    expect(result.totalAmount?.amountRupees).toBe("2750");
    expect(result.totalAmount?.evidence.text).toContain("Total Amount");
    // The ₹3,100 demo total is nowhere in this document.
    expect(JSON.stringify(result)).not.toContain("3100");
  });

  it("keeps the exact source line for every extracted value", () => {
    const result = extract(SYNTHETIC_UPLOAD);
    const lines = SYNTHETIC_UPLOAD.split("\n");

    const evidenceChecks = [
      result.hospitalName,
      result.billNumber,
      result.totalAmount,
      result.insuranceApprovedAmount,
      result.patientPayableAmount,
    ];
    for (const field of evidenceChecks) {
      expect(field).not.toBeNull();
      expect(lines[field!.evidence.lineNumber - 1]).toBe(field!.evidence.text);
    }
  });

  it("reads hospital, bill number, bill date, insurance and patient balances", () => {
    const result = extract(SYNTHETIC_UPLOAD);

    expect(result.hospitalName?.value).toBe("CITY GENERAL HOSPITAL");
    expect(result.billNumber?.value).toBe("INV-2026-0042");
    expect(result.billDate?.value).toBe("2026-10-01");
    expect(result.insuranceApprovedAmount?.amountRupees).toBe("500");
    expect(result.patientPayableAmount?.amountRupees).toBe("2250");
  });

  it("reads itemised charges without inventing a total from them", () => {
    const result = extract(SYNTHETIC_UPLOAD);

    expect(result.lineItems.map((item) => [item.description, item.amountRupees])).toEqual([
      ["Consultation Fee", "800"],
      ["CBC Blood Test", "450"],
      ["Chest X-Ray", "1200"],
      ["Pharmacy", "650"],
    ]);
    // 800 + 450 + 1200 + 650 = 3100, but that sum is not printed on the bill and
    // must never become the total.
    expect(result.totalAmount?.amountRupees).not.toBe("3100");
  });

  it("marks every result as unverified", () => {
    const result = extract(SYNTHETIC_UPLOAD);
    expect(result.notice).toBe(DOCUMENT_EXTRACTION_NOTICE);
    expect(DOCUMENT_EXTRACTION_NOTICE).toMatch(/not independently verified/i);
    expect(billDocumentExtractionSchema.safeParse(result).success).toBe(true);
  });
});

describe("extractDocumentFields — missing values stay missing", () => {
  it("returns null fields when the bill prints no amounts", () => {
    const result = extract(
      ["CITY GENERAL HOSPITAL", "Bill No: INV-2026-0042", "Thank you for visiting"].join("\n"),
    );

    expect(result.readStatus).toBe("readable");
    expect(result.totalAmount).toBeNull();
    expect(result.insuranceApprovedAmount).toBeNull();
    expect(result.patientPayableAmount).toBeNull();
    expect(result.lineItems).toEqual([]);
    expect(result.warnings).toContain(WARNING_NO_AMOUNTS);
    expect(result.warnings).toContain(WARNING_NO_LINE_ITEMS);
  });

  it("does not treat a bill number's digits as an amount", () => {
    const result = extract(
      ["CITY GENERAL HOSPITAL", "Invoice No: INV-2026-004299", "Consultation Fee 900"].join("\n"),
    );

    expect(result.totalAmount).toBeNull();
    expect(result.lineItems.map((item) => item.amountRupees)).toEqual(["900"]);
  });

  it("does not treat payments or phone numbers as charges", () => {
    const result = extract(
      [
        "CITY GENERAL HOSPITAL",
        "Bill No: INV-2026-0042",
        "Phone: 9876543210",
        "Amount paid: 500",
        "Consultation Fee 900",
      ].join("\n"),
    );

    expect(result.lineItems.map((item) => item.description)).toEqual(["Consultation Fee"]);
    expect(result.patientPayableAmount).toBeNull();
  });
});

describe("extractDocumentFields — ambiguity is refused, not guessed", () => {
  it("refuses a total printed twice with different figures", () => {
    const result = extract(
      [
        "CITY GENERAL HOSPITAL",
        "Bill No: INV-2026-0042",
        "Total Amount: Rs 1,000",
        "Grand Total: Rs 1,200",
      ].join("\n"),
    );

    expect(result.totalAmount).toBeNull();
    expect(result.warnings).toContain(WARNING_AMBIGUOUS_TOTAL);
  });

  it("accepts the same total repeated", () => {
    const result = extract(
      [
        "CITY GENERAL HOSPITAL",
        "Total Amount: Rs 1,000",
        "Grand Total: Rs 1,000.00",
      ].join("\n"),
    );

    expect(result.totalAmount?.amountRupees).toBe("1000");
  });

  it("refuses a labelled line carrying two amounts", () => {
    const result = extract(
      ["CITY GENERAL HOSPITAL", "Total Amount: Rs 1,000 (including Rs 200 tax)"].join("\n"),
    );

    expect(result.totalAmount).toBeNull();
    expect(result.warnings).toContain(WARNING_AMBIGUOUS_TOTAL);
  });
});

describe("extractDocumentFields — unreadable uploads", () => {
  it("returns no figures for an unreadable image", () => {
    const result = extract("", 0);

    expect(result.readStatus).toBe("unreadable");
    expect(result.hospitalName).toBeNull();
    expect(result.billNumber).toBeNull();
    expect(result.billDate).toBeNull();
    expect(result.lineItems).toEqual([]);
    expect(result.totalAmount).toBeNull();
    expect(result.insuranceApprovedAmount).toBeNull();
    expect(result.patientPayableAmount).toBeNull();
    expect(result.warnings).toContain(WARNING_UNREADABLE_DOCUMENT);
  });

  it("treats a low-confidence read as unreadable rather than trusting noise", () => {
    const result = extract(SYNTHETIC_UPLOAD, 10);
    expect(result.readStatus).toBe("unreadable");
    expect(result.totalAmount).toBeNull();
  });
});

describe("extractDocumentFields — date handling", () => {
  it("ignores a date that is not labelled as a bill date", () => {
    const result = extract(["CITY GENERAL HOSPITAL", "01/10/2026"].join("\n"));
    expect(result.billDate).toBeNull();
  });

  it("rejects an impossible calendar date", () => {
    const result = extract(
      ["CITY GENERAL HOSPITAL", "Bill Date: 31/02/2026"].join("\n"),
    );
    expect(result.billDate).toBeNull();
  });
});
