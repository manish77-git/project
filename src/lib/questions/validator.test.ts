import { describe, expect, it } from "vitest";
import { MOCK_HOSPITAL_RECORDS } from "@/lib/records/mock-records";
import {
  clarificationText,
  discrepancyText,
  figuresNotVerifiedText,
  figuresWithheldDiscrepancyText,
  noDiscrepancyText,
  renderRecordFact,
  unavailableText,
  validateQuestionDraft,
} from "./validator";

const [VALID_RECORD, DISCREPANT_RECORD] = MOCK_HOSPITAL_RECORDS;

const LANGUAGES = ["en", "hi", "kn"] as const;

describe("validateQuestionDraft", () => {
  it("accepts each draft type the prompt allows", () => {
    for (const type of ["meaning", "ambiguous", "unsupported", "discrepancy"] as const) {
      const result = validateQuestionDraft(
        JSON.stringify({ type, explanation: "A short and safe sentence." }),
      );
      expect(result.ok, type).toBe(true);
    }

    const fact = validateQuestionDraft(
      JSON.stringify({
        type: "record_fact",
        fieldKey: "printedAmountDue",
        explanation: "This is the amount the bill shows as outstanding.",
      }),
    );
    expect(fact.ok).toBe(true);
    if (fact.ok) expect(fact.draft.fieldKey).toBe("printedAmountDue");
  });

  it("rejects malformed JSON", () => {
    expect(validateQuestionDraft("{not json")).toEqual({
      ok: false,
      reason: "invalid_json",
    });
  });

  it("rejects an unexpected shape or extra key", () => {
    for (const raw of [
      JSON.stringify({ type: "meaning" }),
      JSON.stringify({ type: "meaning", explanation: "x", amountRupees: "15000" }),
      JSON.stringify({ type: "answer", explanation: "x" }),
      JSON.stringify({ explanation: "x" }),
    ]) {
      const result = validateQuestionDraft(raw);
      expect(result.ok, raw).toBe(false);
    }
  });

  it("asks for the field instead of guessing when record_fact names none", () => {
    expect(
      validateQuestionDraft(
        JSON.stringify({ type: "record_fact", explanation: "An amount." }),
      ),
    ).toEqual({ ok: false, reason: "field_required" });
  });

  it("rejects a field attached to an answer type that cannot carry one", () => {
    expect(
      validateQuestionDraft(
        JSON.stringify({
          type: "meaning",
          fieldKey: "printedAmountDue",
          explanation: "An amount.",
        }),
      ),
    ).toEqual({ ok: false, reason: "field_unexpected" });
  });

  it("rejects a hallucinated figure in any script", () => {
    for (const explanation of [
      "The amount is 15000.",
      "The amount is ₹15,000.",
      "The amount is fifteen thousand.",
      "The amount is १५०००.",
      "You paid 50% already.",
      "This was settled on 12 January.",
    ]) {
      const result = validateQuestionDraft(
        JSON.stringify({ type: "meaning", explanation }),
      );
      expect(result, explanation).toEqual({ ok: false, reason: "financial_claim" });
    }
  });

  it("rejects a coverage, eligibility, waiver or payment claim", () => {
    for (const explanation of [
      "Your insurance covers this treatment.",
      "You are eligible for a waiver.",
      "You must pay this amount now.",
      "This was confirmed by the insurer.",
      "This is an extra discount for you.",
      "आपको गारंटी है कि बीमा भुगतान करेगा।",
      "ನಿಮಗೆ ಖಾತರಿ ಇದೆ.",
    ]) {
      const result = validateQuestionDraft(
        JSON.stringify({ type: "meaning", explanation }),
      );
      expect(result, explanation).toEqual({
        ok: false,
        reason: "unsupported_claim",
      });
    }
  });
});

describe("renderRecordFact", () => {
  it("renders the record's exact value for the same field", () => {
    const rendered = renderRecordFact({
      language: "en",
      record: VALID_RECORD,
      fieldKey: "printedAmountDue",
    });

    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;
    expect(rendered.answer.amountRupees).toBe("10000");
    expect(rendered.answer.text).toContain("Hospital record: INR 10,000");
    expect(rendered.answer.warnings).toEqual([]);
  });

  it("renders a missing value as unknown, never as zero", () => {
    const rendered = renderRecordFact({
      language: "en",
      record: { ...VALID_RECORD, recordAmounts: { ...VALID_RECORD.recordAmounts, patientPayments: null } },
      fieldKey: "patientPayments",
    });

    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;
    expect(rendered.answer.amountRupees).toBeNull();
    expect(rendered.answer.text).toContain("not available");
    expect(rendered.answer.text).not.toContain("INR");
    expect(rendered.answer.warnings[0]).toContain("not as zero");
  });

  it("refuses a record whose value is not a valid decimal amount", () => {
    const rendered = renderRecordFact({
      language: "en",
      record: { ...VALID_RECORD, recordAmounts: { ...VALID_RECORD.recordAmounts, printedAmountDue: "10,000" } },
      fieldKey: "printedAmountDue",
    });

    expect(rendered).toEqual({ ok: false, reason: "fact_mismatch" });
  });

  it("uses the requested language", () => {
    for (const language of LANGUAGES) {
      const rendered = renderRecordFact({ language, record: VALID_RECORD, fieldKey: "printedAmountDue" });
      expect(rendered.ok, language).toBe(true);
      if (rendered.ok) expect(rendered.answer.text.length).toBeGreaterThan(0);
    }
  });
});

describe("deterministic answer text", () => {
  it("contains no digit, currency or date word in any language", () => {
    const texts: string[] = [];
    for (const language of LANGUAGES) {
      texts.push(
        clarificationText(language),
        figuresNotVerifiedText(language),
        figuresWithheldDiscrepancyText(language),
        noDiscrepancyText(language, true),
        noDiscrepancyText(language, false),
        discrepanciesText(language),
        unavailableText(language),
      );
    }

    for (const text of texts) {
      expect(text, text).not.toMatch(/\p{Nd}/u);
      expect(text, text).not.toMatch(/\p{Sc}/u);
      expect(text, text).not.toMatch(/\bINR\b|\bRs\b/i);
      expect(text, text).not.toMatch(/january|february|march|april|may|june|july|august|september|october|november|december/i);
    }
  });

  it("names the discrepant fields without quoting a value", () => {
    const text = discrepancyText("en", [
      "insuranceApprovedButNotPaid",
      "printedAmountDue",
    ]);

    expect(text).toContain("Insurance approved but not paid");
    expect(text).toContain("Amount shown as due");
    expect(text).not.toMatch(/\p{Nd}/u);
    expect(text).not.toContain("8000");
    expect(text).not.toContain("7000");
  });

  it("mentions field names when the question is too vague to place", () => {
    const text = clarificationText("en");
    expect(text).toContain("Bill total after discounts");
    expect(text).toContain("Amount shown as due");
  });
});

/** Two-field discrepancy text, shared by the digit-freedom assertion above. */
function discrepanciesText(language: (typeof LANGUAGES)[number]): string {
  return discrepancyText(language, [
    "insuranceApprovedButNotPaid",
    "patientPayments",
    "printedAmountDue",
  ]);
}

describe("fixture sanity", () => {
  it("the discrepant record really does differ", () => {
    expect(DISCREPANT_RECORD.recordAmounts.printedAmountDue).toBe("7000");
    expect(DISCREPANT_RECORD.printedAmounts.printedAmountDue).toBe("10000");
  });
});
