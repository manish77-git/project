import { describe, expect, it } from "vitest";
import {
  MOCK_HOSPITAL_RECORDS,
  type HospitalRecord,
} from "@/lib/records/mock-records";
import { financialFieldKeySchema, type LanguageCode } from "@/lib/schemas";
import { promptAlignedSections } from "./__fixtures__/prompt-aligned-drafts";
import type { ProviderDraftSection } from "./validator";
import {
  buildExplanationResponse,
  buildProviderFields,
  buildServerTemplateResponse,
  findTextSafetyFailure,
  formatInrAmount,
  parseAmountToCanonical,
  validateFinancialFact,
  validateProviderDraft,
} from "./validator";

const VALID_BILL = "INV-2026-0042";

function recordFor(billNumber: string): HospitalRecord {
  const found = MOCK_HOSPITAL_RECORDS.find((entry) => entry.billNumber === billNumber);
  if (!found) throw new Error(`missing fixture ${billNumber}`);
  return found;
}

function sections(
  explanation = "This field is explained in simple words.",
): ProviderDraftSection[] {
  return financialFieldKeySchema.options.map((fieldKey) => ({
    fieldKey,
    explanation,
  }));
}

function draftFor(explanation: string): string {
  return JSON.stringify({ sections: sections(explanation) });
}

describe("formatInrAmount", () => {
  it("uses deterministic Indian grouping and preserves decimals", () => {
    const cases: [string, string][] = [
      ["0", "0"],
      ["999", "999"],
      ["15000", "15,000"],
      ["150000", "1,50,000"],
      ["1500000", "15,00,000"],
      ["15000.5", "15,000.5"],
      ["15000.00", "15,000.00"],
    ];

    for (const [input, expected] of cases) {
      expect(formatInrAmount(input), input).toBe(expected);
    }
  });
});

describe("parseAmountToCanonical", () => {
  it("normalizes INR formatting, separators and trailing zeros", () => {
    const cases: [string, string | null][] = [
      ["15000", "15000"],
      ["15,000", "15000"],
      ["₹15,000.00", "15000"],
      ["INR 1,50,000", "150000"],
      ["Rs. 5000.50", "5000.5"],
      ["0.50", "0.5"],
      ["007", "7"],
      ["1,50,000.999", null],
      ["1e3", null],
      ["-5", null],
      ["80%", null],
      ["१५०००", null],
      ["೧೫೦೦೦", null],
    ];

    for (const [input, expected] of cases) {
      expect(parseAmountToCanonical(input), input).toBe(expected);
    }
  });
});

describe("validateFinancialFact", () => {
  const record = recordFor(VALID_BILL);

  it("accepts a value only for the field it belongs to", () => {
    expect(validateFinancialFact("billTotalAfterDiscounts", "15000", record)).toBeNull();
    expect(validateFinancialFact("billTotalAfterDiscounts", "15,000.00", record)).toBeNull();
    expect(validateFinancialFact("billTotalAfterDiscounts", "₹ 15,000.00", record)).toBeNull();
    expect(validateFinancialFact("billTotalAfterDiscounts", "INR 15,000", record)).toBeNull();
    expect(validateFinancialFact("printedAmountDue", "10000", record)).toBeNull();
    expect(validateFinancialFact("printedAmountDue", "10,000.00", record)).toBeNull();
    expect(validateFinancialFact("printedAmountDue", "10,000.50", record)).toBe(
      "amount_mismatch",
    );

    // A correct total attached to the due field is still wrong.
    expect(validateFinancialFact("printedAmountDue", "15000", record)).toBe(
      "amount_mismatch",
    );
    expect(validateFinancialFact("billTotalAfterDiscounts", "15001", record)).toBe(
      "amount_mismatch",
    );
    expect(validateFinancialFact("notAField", "15000", record)).toBe(
      "unknown_field",
    );
  });

  it("treats a missing amount as unknown, never zero", () => {
    const missing: HospitalRecord = {
      ...record,
      recordAmounts: { ...record.recordAmounts, printedAmountDue: null },
    };

    expect(validateFinancialFact("printedAmountDue", null, missing)).toBeNull();
    expect(validateFinancialFact("printedAmountDue", "0", missing)).toBe(
      "missing_mismatch",
    );
  });
});

describe("validateProviderDraft", () => {
  it("accepts five sections with no financial claims", () => {
    const result = validateProviderDraft(draftFor("Simple explanation."));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sections).toHaveLength(5);
  });

  it("accepts prompt-aligned explanations in English, Hindi and Kannada", () => {
    for (const language of ["en", "hi", "kn"] as const) {
      const sections = promptAlignedSections(language);
      expect(
        validateProviderDraft(JSON.stringify({ sections })),
        language,
      ).toEqual({ ok: true, sections });
    }
  });

  it("reproduces the live false positive in the insurance-approved section", () => {
    // The original live draft was not persisted in the repository. This is the
    // natural sentence for insuranceApprovedButNotPaid that the old prompt
    // elicited; the validator rejects it because of "cover", before any
    // amount is ever involved.
    const explanation =
      "This is the amount your insurance company has approved to cover but has not yet paid.";
    expect(findTextSafetyFailure(explanation)).toBe("unsupported_claim");
    expect(validateProviderDraft(draftFor(explanation))).toEqual({
      ok: false,
      reason: "unsupported_claim",
    });
  });

  it("rejects missing, duplicate, unknown or extra fields", () => {
    const four = sections().slice(0, 4);
    const duplicate = [...sections(), sections()[0] as ProviderDraftSection];
    const unknown = [
      ...sections().slice(0, 4),
      { fieldKey: "someOtherField", explanation: "Simple explanation." },
    ];

    const cases: [string, string][] = [
      ["invalid json", "not json"],
      ["not an object", "[]"],
      ["empty", "{}"],
      ["four sections", JSON.stringify({ sections: four })],
      ["duplicate", JSON.stringify({ sections: duplicate })],
      ["unknown", JSON.stringify({ sections: unknown })],
      [
        "extra top-level key",
        JSON.stringify({ sections: sections(), verified: true }),
      ],
      [
        "extra section key",
        JSON.stringify({
          sections: sections().map((section) => ({
            ...section,
            amountRupees: "15000",
          })),
        }),
      ],
      [
        "confirmation flag",
        JSON.stringify({
          sections: sections().map((section) => ({
            ...section,
            confirmedByUser: true,
          })),
        }),
      ],
    ];

    for (const [label, raw] of cases) {
      const result = validateProviderDraft(raw);
      expect(result.ok, label).toBe(false);
    }
  });

  it("returns the specific structural failure", () => {
    const four = sections().slice(0, 4);
    const duplicate = [...sections(), sections()[0] as ProviderDraftSection];
    const unknown = [
      ...sections().slice(0, 4),
      { fieldKey: "someOtherField", explanation: "Simple explanation." },
    ];

    expect(validateProviderDraft("not json")).toEqual({
      ok: false,
      reason: "invalid_json",
    });
    expect(validateProviderDraft(JSON.stringify({ sections: four }))).toEqual({
      ok: false,
      reason: "missing_field",
    });
    expect(validateProviderDraft(JSON.stringify({ sections: duplicate }))).toEqual({
      ok: false,
      reason: "duplicate_field",
    });
    expect(validateProviderDraft(JSON.stringify({ sections: unknown }))).toEqual({
      ok: false,
      reason: "unknown_field",
    });
  });

  it("rejects ASCII and Unicode numeric claims, even correct-looking ones", () => {
    for (const text of [
      "The total is 15,000.",
      "The total is १५०००.",
      "The total is ೧೫೦೦೦.",
      "The total is INR 15000.",
      "The total is ₹15,000.",
      "This covers 80%.",
      "This applies from January.",
      "This applies from january.",
      "The amount is fifteen thousand.",
      "कुल पंद्रह हज़ार है।",
      "ಒಟ್ಟು ಹದಿನೈದು ಸಾವಿರ.",
      "You can pay next month.",
    ]) {
      expect(validateProviderDraft(draftFor(text)), text).toEqual({
        ok: false,
        reason: "financial_claim",
      });
    }
  });

  it("rejects each unsupported-claim pattern in all three languages", () => {
    const cases: [LanguageCode, string][] = [
      ["en", "This is covered by your insurer."],
      ["en", "This is your coverage."],
      ["en", "You are eligible for this."],
      ["en", "The hospital guaranteed the amount."],
      ["en", "This is a waiver."],
      ["en", "This is a write-off."],
      ["en", "This is a write off."],
      ["en", "This is an additional discount."],
      ["en", "This is confirmed."],
      ["en", "You owe this amount."],
      ["en", "You must pay now."],
      ["en", "You have to pay now."],
      ["en", "Payment is required."],
      ["en", "Your insurance will pay for this."],
      ["hi", "यह कवर है।"],
      ["hi", "यह कवरेज है।"],
      ["hi", "आप पात्र हैं।"],
      ["hi", "यह गारंटी है।"],
      ["hi", "यह माफ है।"],
      ["hi", "आपको भुगतान करना है।"],
      ["hi", "आपको चुकाना है।"],
      ["hi", "यह अतिरिक्त छूट है।"],
      ["hi", "यह विशेष छूट है।"],
      ["hi", "बीमा भुगतान करेगा।"],
      ["kn", "ಇದು ಕವರ್ ಆಗಿದೆ."],
      ["kn", "ಇದು ಕವರೇಜ್ ಆಗಿದೆ."],
      ["kn", "ನೀವು ಅರ್ಹರಾಗಿದ್ದೀರಿ."],
      ["kn", "ಇದು ಖಾತರಿ."],
      ["kn", "ಇದು ಮನ್ನಾ."],
      ["kn", "ನೀವು ಪಾವತಿಸಬೇಕು."],
      ["kn", "ನೀವು ತೆರಬೇಕು."],
      ["kn", "ಇದು ಹೆಚ್ಚುವರಿ ರಿಯಾಯಿತಿ."],
      ["kn", "ಇದು ವಿಶೇಷ ರಿಯಾಯಿತಿ."],
      ["kn", "ವಿಮೆ ಪಾವತಿಸುತ್ತದೆ."],
    ];

    for (const [language, text] of cases) {
      expect(validateProviderDraft(draftFor(text)), `${language}: ${text}`).toEqual({
        ok: false,
        reason: "unsupported_claim",
      });
    }
  });

  it("detects claim categories directly", () => {
    expect(findTextSafetyFailure("No figures here.")).toBeNull();
    expect(findTextSafetyFailure("15000")).toBe("financial_claim");
    expect(findTextSafetyFailure("you must pay")).toBe("unsupported_claim");
    expect(findTextSafetyFailure("The amount is fifteen thousand.")).toBe(
      "financial_claim",
    );
    expect(findTextSafetyFailure("This may be the total billed amount.")).toBeNull();
  });
});

describe("buildExplanationResponse", () => {
  const record = recordFor(VALID_BILL);

  it("renders facts and values from the record, with headings and no dates", () => {
    const built = buildExplanationResponse({
      language: "en",
      record,
      sections: sections(),
      validation: "validated",
    });

    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const { response } = built;
    expect(response.validation).toBe("validated");
    expect(response.sections.map((section) => section.fieldKey)).toEqual([
      ...financialFieldKeySchema.options,
    ]);
    expect(response.sections[0]?.amountRupees).toBe("15000");
    expect(response.sections[0]?.heading).toBe("Bill total after discounts");
    expect(response.explanation.explanationText).toContain("INR 15,000");
    expect(response.explanation.financialFactsUsed[0]?.amountRupees).toBe("15000");
    expect(response.explanation.datesUsed).toEqual([]);
    expect(response.explanation.warnings.some((warning) => warning.includes("no dates"))).toBe(
      true,
    );
  });

  it("keeps a missing amount null in both the section and the fact", () => {
    const missing: HospitalRecord = {
      ...record,
      recordAmounts: { ...record.recordAmounts, printedAmountDue: null },
    };
    const built = buildExplanationResponse({
      language: "en",
      record: missing,
      sections: sections(),
      validation: "validated",
    });

    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const section = built.response.sections.find(
      (entry) => entry.fieldKey === "printedAmountDue",
    );
    const fact = built.response.explanation.financialFactsUsed.find(
      (entry) => entry.fieldKey === "printedAmountDue",
    );
    expect(section?.amountRupees).toBeNull();
    expect(section?.status).toBe("missing");
    expect(fact?.amountRupees).toBeNull();
    expect(
      built.response.explanation.warnings.some((warning) =>
        warning.includes("unknown, not as zero"),
      ),
    ).toBe(true);
  });

  it("refuses ambiguous section sets", () => {
    expect(
      buildExplanationResponse({
        language: "en",
        record,
        sections: sections().slice(0, 4),
        validation: "validated",
      }),
    ).toEqual({ ok: false, reason: "invalid_sections" });

    const duplicate = [...sections(), sections()[0] as ProviderDraftSection];
    expect(
      buildExplanationResponse({
        language: "en",
        record,
        sections: duplicate,
        validation: "validated",
      }),
    ).toEqual({ ok: false, reason: "invalid_sections" });
  });

  it("builds a deterministic server template with the same association rules", () => {
    const built = buildServerTemplateResponse({ language: "en", record });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    expect(built.response.validation).toBe("server_template");
    expect(built.response.sections).toHaveLength(5);
    expect(built.response.sections[0]?.amountRupees).toBe("15000");
    expect(
      built.response.explanation.warnings.some((warning) =>
        warning.includes("standard summary"),
      ),
    ).toBe(true);
  });
});

describe("buildProviderFields", () => {
  it("sends availability only, never amounts", () => {
    const record = recordFor(VALID_BILL);
    const fields = buildProviderFields(record);

    expect(fields).toHaveLength(5);
    for (const field of fields) {
      expect(field.status).toBe("found");
      expect("amountRupees" in field).toBe(false);
    }
  });

  it("marks a null amount as missing", () => {
    const record: HospitalRecord = {
      ...recordFor(VALID_BILL),
      recordAmounts: {
        ...recordFor(VALID_BILL).recordAmounts,
        printedAmountDue: null,
      },
    };

    const field = buildProviderFields(record).find(
      (entry) => entry.fieldKey === "printedAmountDue",
    );
    expect(field?.status).toBe("missing");
  });
});
