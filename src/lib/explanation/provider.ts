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

const LANGUAGE_INSTRUCTIONS: Record<LanguageCode, string> = {
  en: "Use plain English, short sentences and the Latin script.",
  hi: "Use plain, everyday Hindi in Devanagari script. Prefer the simple words a patient would use, and avoid formal legal or insurance jargon.",
  kn: "Use plain, everyday Kannada in Kannada script. Prefer the simple words a patient would use, and avoid formal legal or insurance jargon.",
};

/**
 * Words and phrases the validator treats as claims the record cannot support.
 *
 * The prompt repeats them so the model does not have to guess what "no
 * insurance promises" means. They are forbidden even in a denial: "not
 * covered" still tells the patient something the record does not establish.
 */
const BANNED_CLAIM_TERMS: Record<LanguageCode, string> = {
  en: "cover, covers, covered, coverage, eligible, eligibility, guarantee, guaranteed, waive, waived, waiver, write-off, confirmed, owe, payment is required",
  hi: "कवर, कवरेज, पात्र, गारंटी, माफ, माफी, भुगतान करना, चुकाना, अतिरिक्त छूट, विशेष छूट, बीमा भुगतान करेगा, बीमा भुगतान करेगी, बीमा देगा, बीमा देगी",
  kn: "ಕವರ್, ಕವರೇಜ್, ಅರ್ಹ, ಖಾತರಿ, ಮನ್ನಾ, ಪಾವತಿಸಬೇಕು, ತೆರಬೇಕು, ಹೆಚ್ಚುವರಿ ರಿಯಾಯಿತಿ, ವಿಶೇಷ ರಿಯಾಯಿತಿ, ವಿಮೆ ಪಾವತಿಸುತ್ತದೆ, ವಿಮೆ ನೀಡುತ್ತದೆ",
};

interface FieldGuidance {
  meaning: string;
  guidance: string;
}

/**
 * Per-field wording. The model is told what the field means and how to phrase
 * it without the claims the validator rejects. The guidance deliberately
 * avoids "cover" for the insurance fields, because that word is the most
 * common reason a neutral explanation fails the safety guard.
 */
const FIELD_GUIDANCE: Record<FinancialFieldKey, FieldGuidance> = {
  billTotalAfterDiscounts: {
    meaning: "the total charge on the bill after reductions",
    guidance:
      "Say it is the overall amount billed after reductions. Do not explain why a reduction was given, and never call a reduction extra, additional, special or loyalty.",
  },
  insuranceApprovedButNotPaid: {
    meaning: "an amount the insurer has approved but not yet settled",
    guidance:
      "Say it is an amount approved by the insurer that is still awaiting settlement. Never say it is covered, guaranteed, or will be paid.",
  },
  insurancePaidOrCredited: {
    meaning: "an amount the insurer has already settled or credited",
    guidance:
      "Say it is an amount the insurer has already settled or credited. Do not promise any further payment.",
  },
  patientPayments: {
    meaning: "an amount the patient has already paid",
    guidance:
      "Say it is a payment already made. Do not ask for another payment and do not say what remains to be paid.",
  },
  printedAmountDue: {
    meaning: "the amount the bill shows as remaining",
    guidance:
      "Say it is the amount the bill currently shows as outstanding. Never say the patient owes it or must pay it.",
  },
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
  const languageName = LANGUAGE_NAMES[input.language];

  const system = [
    "You explain what hospital-bill fields mean to a patient in plain, calm and respectful language.",
    `Write the entire explanation in ${languageName} (${input.language}). ${LANGUAGE_INSTRUCTIONS[input.language]}`,
    "The server displays every amount separately from the verified hospital record. Never write an amount, digit (in any script), number word (such as thousand, lakh or crore, or the equivalent in the target language), date, percentage, currency symbol, currency code or currency word, bill number, hospital name or patient name. Never infer, calculate, repeat or confirm a value.",
    "Explain only the general meaning of each supplied field. Do not say whether a value is correct, complete, final, or approved for the patient.",
    `Never use these words, in English or in ${languageName}, even in a denial: ${BANNED_CLAIM_TERMS[input.language]}. Never say that insurance covers or will pay for something, that a waiver or write-off applies, that a discount is extra or special, that the patient is eligible for anything, or that the patient owes an amount or must, should, needs to or has to pay. Never tell the patient to pay now, immediately, today or by a deadline.`,
    "For insurance fields, use approved, settled or credited rather than covered or paid by insurance. For the amount shown as due, say what the bill shows, not what the patient must do.",
    "A field marked missing is unknown. Say the information is not available; never say or imply zero, and never guess.",
    "Do not claim that any value is confirmed by the patient.",
    "Explain all five supplied fields exactly once each, in the order given, and no other fields.",
    'Return only JSON shaped exactly as {"sections":[{"fieldKey":"...","explanation":"..."}]}. Each explanation must be one short sentence of general meaning, with no markdown, no list, no extra keys.',
  ].join("\n");

  const fieldLines = input.fields.map((field) => {
    const guidance = FIELD_GUIDANCE[field.fieldKey];
    const value = field.status === "missing" ? "missing from the record" : "available";
    return `- ${field.fieldKey} (${guidance.meaning}): ${value}. ${guidance.guidance}`;
  });

  const user = [
    "Verified hospital record fields (values are not shown to you and are rendered by the server):",
    ...fieldLines,
    "",
    "Explain the general meaning of each field for the patient. For a missing field, say the information is not available.",
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
                description:
                  "Exactly five sections, one for each supplied field, in the supplied order. No other fields.",
                minItems: 5,
                maxItems: 5,
                items: {
                  type: "OBJECT",
                  properties: {
                    fieldKey: {
                      type: "STRING",
                      enum: [...financialFieldKeySchema.options],
                      description:
                        "The supplied field this section explains. Use each field key exactly once.",
                    },
                    explanation: {
                      type: "STRING",
                      description:
                        "One short sentence in the requested language explaining only the general meaning. No amounts, digits, dates, percentages, currency, insurance promises, eligibility, waivers, payment obligations, or the word confirmed.",
                    },
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
