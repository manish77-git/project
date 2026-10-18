/**
 * A fake provider for tests: deterministic, offline, and it records exactly
 * what the service was about to send to a model.
 *
 * Every value is synthetic. The fixture never performs network I/O.
 */
import { financialFieldKeySchema } from "@/lib/schemas";
import type {
  ExplanationProvider,
  ExplanationProviderInput,
} from "../provider";
import type { ProviderDraftSection } from "../validator";

export type FakeExplanationProvider = ExplanationProvider & {
  readonly calls: readonly ExplanationProviderInput[];
};

export function createFakeExplanationProvider(
  responder: (input: ExplanationProviderInput) => string | Promise<string>,
): FakeExplanationProvider {
  const calls: ExplanationProviderInput[] = [];

  return {
    name: "fake:explanation",
    calls,
    async generate(input: ExplanationProviderInput): Promise<string> {
      // Copy the input so a later mutation cannot rewrite the record.
      calls.push({
        language: input.language,
        fields: input.fields.map((field) => ({ ...field })),
      });
      return responder(input);
    },
  };
}

/** Five valid sections, one per allow-listed field, with no figures. */
export function validProviderSections(
  explanation = "This field is explained in simple words.",
): ProviderDraftSection[] {
  return financialFieldKeySchema.options.map((fieldKey) => ({
    fieldKey,
    explanation,
  }));
}

/** A well-formed structured provider response. */
export function structuredDraftResponse(
  explanation = "This field is explained in simple words.",
): string {
  return JSON.stringify({ sections: validProviderSections(explanation) });
}
