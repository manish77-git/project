import { describe, expect, it } from "vitest";
import {
  EXPLANATION_NOTICE,
  explanationResponseSchema,
  financialFieldKeySchema,
} from "./index";

const AMOUNTS = {
  billTotalAfterDiscounts: "15000",
  insuranceApprovedButNotPaid: "5000",
  insurancePaidOrCredited: "0",
  patientPayments: "10000",
  printedAmountDue: "10000",
} as const;

function validResponse(): Record<string, unknown> {
  const keys = financialFieldKeySchema.options;

  return {
    validation: "validated",
    explanation: {
      language: "en",
      explanationText: "A simple explanation of the hospital record.",
      verifiedRecordReference: {
        recordId: "mock:INV-2026-0042",
        billNumber: "INV-2026-0042",
      },
      financialFactsUsed: keys.map((fieldKey) => ({
        fieldKey,
        amountRupees: AMOUNTS[fieldKey],
        pageNumber: null,
      })),
      datesUsed: [],
      warnings: [],
      notice: EXPLANATION_NOTICE,
    },
    sections: keys.map((fieldKey) => ({
      fieldKey,
      heading: "Field heading",
      explanation: "This field means something simple.",
      amountRupees: AMOUNTS[fieldKey],
      status: "found",
    })),
  };
}

describe("explanationResponseSchema", () => {
  it("accepts a complete validated response", () => {
    expect(explanationResponseSchema.safeParse(validResponse()).success).toBe(true);
  });

  it("accepts the server-template validation marker", () => {
    expect(
      explanationResponseSchema.safeParse({
        ...validResponse(),
        validation: "server_template",
      }).success,
    ).toBe(true);
  });

  it("requires exactly five sections, one per financial field", () => {
    const mismatch = validResponse();
    const sections = mismatch.sections as Record<string, unknown>[];
    expect(
      explanationResponseSchema.safeParse({
        ...mismatch,
        sections: sections.slice(0, 4),
      }).success,
    ).toBe(false);

    expect(
      explanationResponseSchema.safeParse({
        ...mismatch,
        sections: [...sections, sections[0]],
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown section field", () => {
    const response = validResponse();
    const sections = response.sections as Record<string, unknown>[];
    sections[0] = { ...sections[0], fieldKey: "someOtherField" };

    expect(explanationResponseSchema.safeParse(response).success).toBe(false);
  });

  it("requires sections and facts to name the same fields", () => {
    const missingFact = validResponse();
    const facts = (missingFact.explanation as Record<string, unknown>)
      .financialFactsUsed as Record<string, unknown>[];
    (missingFact.explanation as Record<string, unknown>).financialFactsUsed =
      facts.slice(1);
    expect(explanationResponseSchema.safeParse(missingFact).success).toBe(false);

    const missingSection = validResponse();
    const responseSections = missingSection.sections as Record<string, unknown>[];
    // Five sections, but one field is duplicated and another is missing. The
    // facts still name all five, so the cross-check must reject it.
    missingSection.sections = responseSections.map((section, index) =>
      index === 0
        ? { ...section, fieldKey: responseSections[1]?.fieldKey }
        : section,
    );
    expect(explanationResponseSchema.safeParse(missingSection).success).toBe(false);
  });

  it("enforces the status/amount pairing", () => {
    const foundNull = validResponse();
    const foundSections = foundNull.sections as Record<string, unknown>[];
    foundSections[0] = { ...foundSections[0], amountRupees: null };
    expect(explanationResponseSchema.safeParse(foundNull).success).toBe(false);

    const missingValue = validResponse();
    const missingSections = missingValue.sections as Record<string, unknown>[];
    missingSections[0] = {
      ...missingSections[0],
      status: "missing",
      amountRupees: "15000",
    };
    expect(explanationResponseSchema.safeParse(missingValue).success).toBe(false);
  });

  it("rejects numeric amounts and confirmation flags in a section", () => {
    const numeric = validResponse();
    const numericSections = numeric.sections as Record<string, unknown>[];
    numericSections[0] = { ...numericSections[0], amountRupees: 15000 };
    expect(explanationResponseSchema.safeParse(numeric).success).toBe(false);

    const confirmed = validResponse();
    const confirmedSections = confirmed.sections as Record<string, unknown>[];
    confirmedSections[0] = { ...confirmedSections[0], confirmedByUser: true };
    expect(explanationResponseSchema.safeParse(confirmed).success).toBe(false);
  });

  it("rejects extra top-level keys and unknown validation states", () => {
    expect(
      explanationResponseSchema.safeParse({
        ...validResponse(),
        verificationOutcome: "verified",
      }).success,
    ).toBe(false);

    expect(
      explanationResponseSchema.safeParse({
        ...validResponse(),
        validation: "unvalidated",
      }).success,
    ).toBe(false);
  });
});
