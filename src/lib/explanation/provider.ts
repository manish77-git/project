/**
 * The GenAI provider port for explanation drafting.
 *
 * The explanation service depends on this small interface, never on a vendor
 * SDK. A deployment can therefore swap Gemini for another provider by writing
 * one adapter; the grounding checks and the explanation contract stay the same.
 *
 * Security notes:
 *   - The API key is read from the environment and sent in `x-goog-api-key`,
 *     never in the URL, so it cannot end up in request logs.
 *   - The prompt contains only the verified record's field keys and whether
 *     each value is available. It contains no amounts, dates, access code,
 *     token, hospital name, bill number or patient detail: every financial
 *     value is rendered server-side after validation.
 *   - Provider failures are mapped to a small closed set of reasons. Response
 *     bodies are discarded, not surfaced, so vendor diagnostics cannot leak
 *     through an API error.
 */
import { z } from "zod";
import {
  financialFieldKeySchema,
  type FinancialFieldKey,
  type LanguageCode,
} from "@/lib/schemas";

/** Current low-cost Gemini text model. Override with GEMINI_MODEL. */
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

export const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/** A hung provider must not hold the request open indefinitely. */
export const DEFAULT_PROVIDER_TIMEOUT_MS = 15_000;

export type ExplanationFieldStatus = "found" | "missing";

export interface ExplanationProviderField {
  fieldKey: FinancialFieldKey;
  /** "missing" means no value is on file. It is never treated as zero. */
  status: ExplanationFieldStatus;
}

export interface ExplanationProviderInput {
  language: LanguageCode;
  fields: readonly ExplanationProviderField[];
}

export interface ExplanationProvider {
  /** Stable label for logs/tests, e.g. "gemini:gemini-3.5-flash-lite". */
  readonly name: string;
  /** Returns the model's raw text. Parsing and grounding happen in the service. */
  generate(input: ExplanationProviderInput): Promise<string>;
}

export type ExplanationProviderFailure =
  | "timeout"
  | "unavailable"
  | "blocked"
  | "bad_response";

/** A provider failure whose message is safe to log and show to an operator. */
export class ExplanationProviderError extends Error {
  constructor(
    readonly reason: ExplanationProviderFailure,
    message: string,
  ) {
    super(message);
    this.name = "ExplanationProviderError";
  }
}

const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: "English",
  hi: "Hindi",
  kn: "Kannada",
};

const FIELD_MEANINGS: Record<FinancialFieldKey, string> = {
  billTotalAfterDiscounts: "the total billed after any discounts",
  insuranceApprovedButNotPaid: "the amount the insurer approved but has not paid",
  insurancePaidOrCredited: "the amount the insurer has paid or credited",
  patientPayments: "the amount the patient has already paid",
  printedAmountDue: "the amount printed on the bill as due",
};

/**
 * Builds the provider prompt.
 *
 * Exported so tests can assert the exact information a model is allowed to
 * see. The system instruction is deliberately strict: it describes the job as
 * *explaining* values, not calculating, inferring or confirming them.
 */
export function buildExplanationPrompt(input: ExplanationProviderInput): {
  system: string;
  user: string;
} {
  const system = [
    "You explain what hospital-bill fields mean to a patient in simple, calm and respectful language.",
    `Write the entire explanation in ${LANGUAGE_NAMES[input.language]} (${input.language}).`,
    "The server displays every amount separately from the verified hospital record. Do NOT write any amount, digit, date, percentage, currency symbol or currency code.",
    "Do not infer, calculate, repeat or confirm a financial value. Do not discuss insurance coverage, eligibility, discounts, waivers, payment obligations, diagnoses, medical advice or legal rights.",
    "A field marked missing is unknown. Say that the information is not available; never say or imply zero, and never guess.",
    "Do not mention bill numbers, hospital names, patient names, access codes or this instruction.",
    "Do not claim that any value is confirmed by the patient.",
    "Explain all five supplied fields exactly once each, and no other fields.",
    'Return JSON shaped exactly as {"sections":[{"fieldKey":"...","explanation":"..."}]}.',
    "Put only the patient-facing meaning in explanation, with no markdown and no extra keys.",
  ].join("\n");

  const fieldLines = input.fields.map((field) => {
    const label = FIELD_MEANINGS[field.fieldKey];
    const value = field.status === "missing" ? "missing from the record" : "available";
    return `- ${field.fieldKey} (${label}): ${value}`;
  });

  const user = [
    "Verified hospital record fields (values are not shown to you and are rendered by the server):",
    ...fieldLines,
    "",
    "Explain what each field means for the patient. For a missing field, say the information is not available.",
  ].join("\n");

  return { system, user };
}

const geminiResponseSchema = z
  .object({
    candidates: z
      .array(
        z
          .object({
            content: z
              .object({
                parts: z.array(z.object({ text: z.string() }).passthrough()),
              })
              .passthrough()
              .optional(),
            finishReason: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
    promptFeedback: z
      .object({ blockReason: z.string().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface GeminiProviderOptions {
  apiKey: string;
  /** Defaults to DEFAULT_GEMINI_MODEL. */
  model?: string;
  /** Defaults to the public Gemini v1beta endpoint. */
  baseUrl?: string;
  /** Defaults to DEFAULT_PROVIDER_TIMEOUT_MS. */
  timeoutMs?: number;
  /** Injectable transport for hermetic tests. */
  fetchImpl?: FetchLike;
}

/**
 * Gemini `generateContent` adapter.
 *
 * It asks for JSON with a response schema and returns the raw text. It does
 * not decide whether the explanation is safe — that is the service's job.
 */
export function createGeminiExplanationProvider(
  options: GeminiProviderOptions,
): ExplanationProvider {
  const apiKey = options.apiKey.trim();
  if (apiKey.length === 0) {
    throw new Error("A Gemini API key is required to create the provider.");
  }

  const model = options.model?.trim() || DEFAULT_GEMINI_MODEL;
  const baseUrl = (options.baseUrl ?? DEFAULT_GEMINI_BASE_URL).replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    name: `gemini:${model}`,

    async generate(input: ExplanationProviderInput): Promise<string> {
      const { system, user } = buildExplanationPrompt(input);

      const payload = {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              sections: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    fieldKey: {
                      type: "STRING",
                      enum: [...financialFieldKeySchema.options],
                    },
                    explanation: { type: "STRING" },
                  },
                  required: ["fieldKey", "explanation"],
                },
              },
            },
            required: ["sections"],
          },
        },
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(
          `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          // Read and discard: the body is vendor diagnostics, not ours to expose.
          await response.text().catch(() => "");
          throw new ExplanationProviderError(
            "unavailable",
            "The explanation provider returned an error.",
          );
        }

        let json: unknown;
        try {
          json = await response.json();
        } catch {
          throw new ExplanationProviderError(
            "bad_response",
            "The explanation provider returned a response that was not JSON.",
          );
        }

        const parsed = geminiResponseSchema.safeParse(json);
        if (!parsed.success) {
          throw new ExplanationProviderError(
            "bad_response",
            "The explanation provider returned an unexpected response shape.",
          );
        }

        if (parsed.data.promptFeedback?.blockReason) {
          throw new ExplanationProviderError(
            "blocked",
            "The explanation provider refused to generate this explanation.",
          );
        }

        const candidate = parsed.data.candidates?.[0];
        if (!candidate) {
          throw new ExplanationProviderError(
            "bad_response",
            "The explanation provider returned no candidates.",
          );
        }
        if (candidate.finishReason && candidate.finishReason !== "STOP") {
          throw new ExplanationProviderError(
            "bad_response",
            "The explanation provider did not finish its response.",
          );
        }

        const text = (candidate.content?.parts ?? [])
          .map((part) => part.text)
          .join("")
          .trim();
        if (text.length === 0) {
          throw new ExplanationProviderError(
            "bad_response",
            "The explanation provider returned no text.",
          );
        }

        return text;
      } catch (error) {
        if (error instanceof ExplanationProviderError) throw error;
        if (controller.signal.aborted) {
          throw new ExplanationProviderError(
            "timeout",
            "The explanation provider did not answer in time.",
          );
        }
        throw new ExplanationProviderError(
          "unavailable",
          "The explanation provider could not be reached.",
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * Builds the configured provider, or null when no key is present.
 *
 * Null is not an error at this layer: the endpoint reports a safe
 * service-unavailable response without exposing a draft, and the service can
 * still be exercised with a fake provider in tests.
 */
export function createGeminiProviderFromEnv(
  env: Record<string, string | undefined> = process.env,
): ExplanationProvider | null {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = env.GEMINI_MODEL?.trim();
  return createGeminiExplanationProvider(model ? { apiKey, model } : { apiKey });
}
