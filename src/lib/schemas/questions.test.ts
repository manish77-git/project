import { describe, expect, it } from "vitest";
import {
  MAX_QUESTION_LENGTH,
  QUESTION_ANSWER_NOTICE,
  questionAnswerResponseSchema,
  questionAnswerSchema,
  questionRequestSchema,
  type QuestionAnswer,
} from "./questions";

function recordFactAnswer(overrides: Partial<QuestionAnswer> = {}): QuestionAnswer {
  return {
    language: "en",
    question: "What amount is recorded as due?",
    answerType: "record_fact",
    answerText: "Amount shown as due\nHospital record: INR 10,000.",
    fieldKey: "printedAmountDue",
    amountRupees: "10000",
    verifiedRecordReference: {
      recordId: "mock:INV-2026-0042",
      billNumber: "INV-2026-0042",
    },
    financialFactsUsed: [
      { fieldKey: "printedAmountDue", amountRupees: "10000", pageNumber: null },
    ],
    warnings: [],
    notice: QUESTION_ANSWER_NOTICE,
    ...overrides,
  };
}

function meaningAnswer(overrides: Partial<QuestionAnswer> = {}): QuestionAnswer {
  return {
    language: "en",
    question: "What does insurance approved mean?",
    answerType: "meaning",
    answerText: "It is an amount the insurer has approved but not settled.",
    fieldKey: null,
    amountRupees: null,
    verifiedRecordReference: null,
    financialFactsUsed: [],
    warnings: [],
    notice: QUESTION_ANSWER_NOTICE,
    ...overrides,
  };
}

describe("questionRequestSchema", () => {
  it("accepts a question with a supported language", () => {
    for (const language of ["en", "hi", "kn"] as const) {
      expect(
        questionRequestSchema.safeParse({ question: "What is this?", language })
          .success,
      ).toBe(true);
    }
  });

  it("rejects an empty or whitespace-only question", () => {
    expect(questionRequestSchema.safeParse({ question: "", language: "en" }).success).toBe(
      false,
    );
    expect(
      questionRequestSchema.safeParse({ question: "   ", language: "en" }).success,
    ).toBe(false);
  });

  it("rejects a question longer than the documented maximum", () => {
    const long = "a".repeat(MAX_QUESTION_LENGTH + 1);
    expect(questionRequestSchema.safeParse({ question: long, language: "en" }).success).toBe(
      false,
    );
    expect(
      questionRequestSchema.safeParse({
        question: "a".repeat(MAX_QUESTION_LENGTH),
        language: "en",
      }).success,
    ).toBe(true);
  });

  it("rejects an unsupported language", () => {
    expect(questionRequestSchema.safeParse({ question: "Hi", language: "ta" }).success).toBe(
      false,
    );
  });

  it("rejects every client-supplied extra, including a bill number or verdict", () => {
    for (const extra of [
      { billNumber: "INV-2026-0043" },
      { isVerified: true },
      { amountRupees: "15000" },
      { outcome: "verified" },
    ]) {
      const parsed = questionRequestSchema.safeParse({
        question: "What is due?",
        language: "en",
        ...extra,
      });
      expect(parsed.success, JSON.stringify(extra)).toBe(false);
    }
  });
});

describe("questionAnswerSchema", () => {
  it("accepts a record_fact answer whose fact repeats its field and amount", () => {
    expect(questionAnswerSchema.safeParse(recordFactAnswer()).success).toBe(true);
  });

  it("accepts a meaning answer that carries no figure", () => {
    expect(questionAnswerSchema.safeParse(meaningAnswer()).success).toBe(true);
  });

  it("requires a record_fact answer to name its field", () => {
    const parsed = questionAnswerSchema.safeParse(
      recordFactAnswer({ fieldKey: null }),
    );
    expect(parsed.success).toBe(false);
  });

  it("requires the fact to name the same field as the answer", () => {
    const parsed = questionAnswerSchema.safeParse(
      recordFactAnswer({
        financialFactsUsed: [
          { fieldKey: "patientPayments", amountRupees: "10000", pageNumber: null },
        ],
      }),
    );
    expect(parsed.success).toBe(false);
  });

  it("requires the fact to repeat the exact decimal string", () => {
    const parsed = questionAnswerSchema.safeParse(
      recordFactAnswer({
        financialFactsUsed: [
          { fieldKey: "printedAmountDue", amountRupees: "9999", pageNumber: null },
        ],
      }),
    );
    expect(parsed.success).toBe(false);
  });

  it("requires exactly one fact for a record_fact answer", () => {
    expect(
      questionAnswerSchema.safeParse(
        recordFactAnswer({ financialFactsUsed: [] }),
      ).success,
    ).toBe(false);
  });

  it("forbids an amount on every non-fact answer type", () => {
    for (const answerType of [
      "meaning",
      "discrepancy",
      "clarification",
      "unsupported",
      "unavailable",
    ] as const) {
      expect(
        questionAnswerSchema.safeParse(meaningAnswer({ answerType })).success,
        `${answerType} without a figure should pass`,
      ).toBe(true);
      expect(
        questionAnswerSchema.safeParse(
          meaningAnswer({ answerType, amountRupees: "10000" }),
        ).success,
        `${answerType} with a figure must fail`,
      ).toBe(false);
      expect(
        questionAnswerSchema.safeParse(
          meaningAnswer({ answerType, fieldKey: "printedAmountDue" }),
        ).success,
        `${answerType} naming a field must fail`,
      ).toBe(false);
      expect(
        questionAnswerSchema.safeParse(
          meaningAnswer({
            answerType,
            financialFactsUsed: [
              { fieldKey: "printedAmountDue", amountRupees: null, pageNumber: null },
            ],
          }),
        ).success,
        `${answerType} carrying a fact must fail`,
      ).toBe(false);
    }
  });

  it("enforces the fixed notice", () => {
    const parsed = questionAnswerSchema.safeParse({
      ...meaningAnswer(),
      notice: "Something else.",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an amount that is not a decimal string", () => {
    const parsed = questionAnswerSchema.safeParse(
      recordFactAnswer({ amountRupees: "10,000" }),
    );
    expect(parsed.success).toBe(false);
  });
});

describe("questionAnswerResponseSchema", () => {
  it("accepts both provenance labels", () => {
    for (const validation of ["validated", "server_rendered"] as const) {
      expect(
        questionAnswerResponseSchema.safeParse({
          validation,
          answer: meaningAnswer(),
        }).success,
      ).toBe(true);
    }
  });

  it("rejects any other provenance label", () => {
    expect(
      questionAnswerResponseSchema.safeParse({
        validation: "rejected",
        answer: meaningAnswer(),
      }).success,
    ).toBe(false);
  });
});
