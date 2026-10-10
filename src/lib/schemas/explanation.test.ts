import { describe, expect, it } from "vitest";
import { EXPLANATION_NOTICE, explanationSchema } from "./explanation";

/** Synthetic data only, referencing a fake verified record. */
function validExplanation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    language: "en",
    explanationText:
      "Your total bill after discounts was Rs. 15000. The insurance company approved Rs. 5000 but has not paid it yet.",
    verifiedRecordReference: {
      recordId: "rec_0001",
      billNumber: "INV-2026-0042",
    },
    financialFactsUsed: [
      { fieldKey: "billTotalAfterDiscounts", amountRupees: "15000", pageNumber: 3 },
      { fieldKey: "insuranceApprovedButNotPaid", amountRupees: "5000", pageNumber: 2 },
    ],
    datesUsed: [{ label: "Bill date", dateIso: "2026-10-01", pageNumber: 1 }],
    warnings: ["Insurance payment is still pending."],
    notice: EXPLANATION_NOTICE,
    ...overrides,
  };
}

describe("explanationSchema", () => {
  it("accepts a valid explanation with traceable facts and the required notice (case 15)", () => {
    expect(explanationSchema.safeParse(validExplanation()).success).toBe(true);
  });

  it("accepts the three supported languages", () => {
    for (const language of ["en", "hi", "kn"] as const) {
      const result = explanationSchema.safeParse(validExplanation({ language }));
      expect(result.success, language).toBe(true);
    }
  });

  it("rejects invalid language codes (case 15)", () => {
    for (const bad of ["English", "hn", "ta", ""]) {
      const result = explanationSchema.safeParse(validExplanation({ language: bad }));
      expect(result.success, `language ${JSON.stringify(bad)}`).toBe(false);
    }
  });

  it("rejects an explanation without the required notice (case 15)", () => {
    const { notice: _omitted, ...withoutNotice } = validExplanation();
    expect(explanationSchema.safeParse(withoutNotice).success).toBe(false);

    const wrongNotice = validExplanation({ notice: "AI generated." });
    expect(explanationSchema.safeParse(wrongNotice).success).toBe(false);
  });

  it("rejects missing explanation text or empty text (case 15)", () => {
    const { explanationText: _omitted, ...withoutText } = validExplanation();
    expect(explanationSchema.safeParse(withoutText).success).toBe(false);
    expect(explanationSchema.safeParse(validExplanation({ explanationText: "   " })).success).toBe(false);
  });

  it("rejects a missing or malformed verified record reference (case 15)", () => {
    const { verifiedRecordReference: _omitted, ...withoutRef } = validExplanation();
    expect(explanationSchema.safeParse(withoutRef).success).toBe(false);

    const emptyRef = validExplanation({
      verifiedRecordReference: { recordId: "", billNumber: "INV-2026-0042" },
    });
    expect(explanationSchema.safeParse(emptyRef).success).toBe(false);
  });

  it("rejects facts that reference an unknown field key (traceability)", () => {
    const badFact = validExplanation({
      financialFactsUsed: [
        { fieldKey: "someOtherField", amountRupees: "10", pageNumber: 1 },
      ],
    });
    expect(explanationSchema.safeParse(badFact).success).toBe(false);
  });

  it("rejects facts with malformed amounts (traceability)", () => {
    const badAmount = validExplanation({
      financialFactsUsed: [
        { fieldKey: "billTotalAfterDiscounts", amountRupees: "10.123", pageNumber: 1 },
      ],
    });
    expect(explanationSchema.safeParse(badAmount).success).toBe(false);
  });

  it("requires at least one financial fact", () => {
    expect(explanationSchema.safeParse(validExplanation({ financialFactsUsed: [] })).success).toBe(false);
  });

  it("rejects an invalid date (case 15)", () => {
    const badDate = validExplanation({
      datesUsed: [{ label: "Bill date", dateIso: "01-10-2026", pageNumber: 1 }],
    });
    expect(explanationSchema.safeParse(badDate).success).toBe(false);
  });

  it("rejects a missing warnings array", () => {
    const { warnings: _omitted, ...withoutWarnings } = validExplanation();
    expect(explanationSchema.safeParse(withoutWarnings).success).toBe(false);
  });

  it("rejects extra properties that would imply the explanation verifies the bill", () => {
    const impliesVerified = validExplanation({ verificationOutcome: "verified" });
    expect(explanationSchema.safeParse(impliesVerified).success).toBe(false);
  });
});
