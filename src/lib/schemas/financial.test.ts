import { describe, expect, it } from "vitest";
import {
  documentFinancialsSchema,
  financialFieldCandidateSchema,
  financialFieldConfirmationSchema,
  financialFieldSchema,
  financialFieldsSchema,
} from "./financial";

/**
 * Synthetic test data only. Helpers build a valid field so each test can
 * vary one thing at a time.
 */

function validField(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    amountRupees: "15000",
    status: "found",
    evidence: "Total after discounts printed at the bottom of page 3.",
    pageNumber: 3,
    confirmedByUser: false,
    ...overrides,
  };
}

function validFields(): Record<string, unknown> {
  return {
    billTotalAfterDiscounts: validField(),
    insuranceApprovedButNotPaid: validField({ amountRupees: "5000.50", pageNumber: 2 }),
    insurancePaidOrCredited: validField({ amountRupees: null, status: "missing", evidence: null, pageNumber: null }),
    patientPayments: validField({ amountRupees: "2500", status: "ambiguous", evidence: "Possibly Rs. 2500 received." }),
    printedAmountDue: validField({ amountRupees: "10000" }),
  };
}

describe("financialFieldSchema", () => {
  it("accepts an integer amount with status found (case 6)", () => {
    const result = financialFieldSchema.safeParse(validField({ amountRupees: "15000" }));
    expect(result.success).toBe(true);
  });

  it("accepts a fractional amount (case 6)", () => {
    const result = financialFieldSchema.safeParse(validField({ amountRupees: "15000.75" }));
    expect(result.success).toBe(true);
  });

  it("accepts the zero amount only when explicitly present and found (case 6)", () => {
    const result = financialFieldSchema.safeParse(validField({ amountRupees: "0" }));
    expect(result.success).toBe(true);
  });

  it("defaults confirmedByUser to false (rule 9)", () => {
    const { confirmedByUser: _omitted, ...withoutFlag } = validField();
    const result = financialFieldSchema.safeParse(withoutFlag);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.confirmedByUser).toBe(false);
    }
  });

  it("defaults evidence and pageNumber can be null (case 7)", () => {
    const result = financialFieldSchema.safeParse(
      validField({ evidence: null, pageNumber: null }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts status missing with a null amount (case 7)", () => {
    const result = financialFieldSchema.safeParse(
      validField({ amountRupees: null, status: "missing", evidence: null, pageNumber: null }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts ambiguous status with a candidate amount (case 8)", () => {
    const result = financialFieldSchema.safeParse(
      validField({ amountRupees: "4999.99", status: "ambiguous" }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts ambiguous status without an amount (case 8)", () => {
    const result = financialFieldSchema.safeParse(
      validField({ amountRupees: null, status: "ambiguous", evidence: "Amount partially torn." }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects invalid monetary strings (case 9)", () => {
    for (const bad of ["abc", "1.234", "1.", "1,000", "1e3", "Rs. 100", "", " 100"]) {
      const result = financialFieldSchema.safeParse(validField({ amountRupees: bad }));
      expect(result.success, `amount ${JSON.stringify(bad)}`).toBe(false);
    }
  });

  it("rejects negative amounts (case 9)", () => {
    const result = financialFieldSchema.safeParse(validField({ amountRupees: "-1" }));
    expect(result.success).toBe(false);
  });

  it("rejects amounts with more than two decimal places (case 9)", () => {
    const result = financialFieldSchema.safeParse(validField({ amountRupees: "10.123" }));
    expect(result.success).toBe(false);
  });

  it("rejects numeric amounts — strings only, no float coercion (rule 1)", () => {
    const result = financialFieldSchema.safeParse(validField({ amountRupees: 100 }));
    expect(result.success).toBe(false);
  });

  it("rejects invalid page numbers (case 9)", () => {
    for (const badPage of [0, -1, 1.5, "3"]) {
      const result = financialFieldSchema.safeParse(validField({ pageNumber: badPage }));
      expect(result.success, `pageNumber ${JSON.stringify(badPage)}`).toBe(false);
    }
  });

  it("rejects an invalid status (case 9)", () => {
    const result = financialFieldSchema.safeParse(validField({ status: "found_but_unsure" }));
    expect(result.success).toBe(false);
  });

  it("rejects status found with a null amount (case 10)", () => {
    const result = financialFieldSchema.safeParse(
      validField({ amountRupees: null, status: "found" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects status missing with a non-null amount — a missing amount is never zero (case 10, rule 11)", () => {
    for (const amount of ["0", "15000"]) {
      const result = financialFieldSchema.safeParse(
        validField({ amountRupees: amount, status: "missing" }),
      );
      expect(result.success, `amount ${amount}`).toBe(false);
    }
  });

  it("rejects unexpected extra properties", () => {
    const result = financialFieldSchema.safeParse(validField({ diagnosis: "D50" }));
    expect(result.success).toBe(false);
  });
});

describe("financialFieldCandidateSchema (model output)", () => {
  it("accepts a normal candidate and defaults confirmedByUser to false", () => {
    const { confirmedByUser: _omitted, ...withoutFlag } = validField();
    const result = financialFieldCandidateSchema.safeParse(withoutFlag);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.confirmedByUser).toBe(false);
    }
  });

  it("rejects confirmedByUser=true — AI output can never confirm (rule 12)", () => {
    const result = financialFieldCandidateSchema.safeParse(
      validField({ confirmedByUser: true }),
    );
    expect(result.success).toBe(false);
  });
});

describe("financialFieldConfirmationSchema", () => {
  it("accepts only an explicit true confirmation", () => {
    expect(financialFieldConfirmationSchema.safeParse({ confirmedByUser: true }).success).toBe(true);
    expect(financialFieldConfirmationSchema.safeParse({ confirmedByUser: false }).success).toBe(false);
    expect(financialFieldConfirmationSchema.safeParse({}).success).toBe(false);
  });
});

describe("financialFieldsSchema and documentFinancialsSchema", () => {
  it("accepts a complete set of the five fields (case 6/7/8 combined)", () => {
    expect(financialFieldsSchema.safeParse(validFields()).success).toBe(true);
  });

  it("accepts a full document with INR currency and warnings", () => {
    const result = documentFinancialsSchema.safeParse({
      ...validFields(),
      currency: "INR",
      warnings: ["Page 2 was creased."],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a document without the currency", () => {
    const result = documentFinancialsSchema.safeParse({
      ...validFields(),
      warnings: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a currency other than INR", () => {
    const result = documentFinancialsSchema.safeParse({
      ...validFields(),
      currency: "USD",
      warnings: [],
    });
    expect(result.success).toBe(false);
  });

  it("requires every one of the five named fields", () => {
    const { printedAmountDue: _missing, ...incomplete } = validFields();
    expect(financialFieldsSchema.safeParse(incomplete).success).toBe(false);
  });

  it("propagates field-level errors to the containing document", () => {
    const broken = validFields();
    broken.patientPayments = validField({ amountRupees: null, status: "found" });
    expect(
      documentFinancialsSchema.safeParse({ ...broken, currency: "INR", warnings: [] }).success,
    ).toBe(false);
  });
});
