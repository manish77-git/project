/**
 * A fake provider for the question tests: deterministic, offline, and it
 * records exactly what the service was about to send to a model.
 *
 * Every value is synthetic. The fixture never performs network I/O.
 */
import type {
  QuestionProvider,
  QuestionProviderInput,
  QuestionDraftType,
} from "../provider";
import type { FinancialFieldKey } from "@/lib/schemas";

export type FakeQuestionProvider = QuestionProvider & {
  readonly calls: readonly QuestionProviderInput[];
};

export function createFakeQuestionProvider(
  responder: (input: QuestionProviderInput) => string | Promise<string>,
): FakeQuestionProvider {
  const calls: QuestionProviderInput[] = [];

  return {
    name: "fake:questions",
    calls,
    async generate(input: QuestionProviderInput): Promise<string> {
      // Copy the input so a later mutation cannot rewrite the record.
      calls.push({
        language: input.language,
        question: input.question,
        fields: input.fields.map((field) => ({ ...field })),
        figuresAllowed: input.figuresAllowed,
      });
      return responder(input);
    },
  };
}

/** A well-formed structured provider response. */
export function draftResponse(
  type: QuestionDraftType,
  explanation = "This is explained in simple words.",
  fieldKey: FinancialFieldKey | null = null,
): string {
  return JSON.stringify({ type, fieldKey, explanation });
}
