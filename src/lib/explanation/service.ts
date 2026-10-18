/**
 * Authorized explanation workflow.
 *
 * Stage 4 changes the shape of what the model contributes. It no longer
 * receives financial values and no longer returns free-form prose with
 * amounts. It receives the five allow-listed field keys plus whether each is
 * available, and returns one short meaning per key. The server then:
 *
 *   1. validates the structured draft (exactly one section per field, no
 *      extra/unknown/duplicate fields, no digits/currency/date/coverage
 *      claims in the prose);
 *   2. reads every amount from the authoritative hospital record;
 *   3. re-checks that each value is associated with the right field;
 *   4. renders the final narrative and facts server-side.
 *
 * If the provider fails, times out, returns malformed JSON, or its draft fails
 * validation, the service returns a deterministic server template instead of
 * exposing the draft. The template still uses the authoritative record.
 *
 * Authorization is checked before any record reaches the provider:
 *   - live session and recorded outcome `verified`;
 *   - record resolved from the session's bill number, never from the request;
 *   - verification recomputed against the current record.
 */
import type { AccessSession } from "@/lib/access/store";
import type { HospitalRecord, HospitalRecordRepository } from "@/lib/records/mock-records";
import {
  languageCodeSchema,
  type ExplanationResponse,
  type FinancialFieldKey,
  type LanguageCode,
  type VerificationOutcome,
} from "@/lib/schemas";
import {
  baselineDiscrepancies,
  computeVerification,
  VERIFICATION_MESSAGES,
} from "@/lib/verification/service";
import type { ExplanationProvider } from "./provider";
import {
  buildExplanationResponse,
  buildProviderFields,
  buildServerTemplateResponse,
  validateProviderDraft,
} from "./validator";

/** One safe message per internal refusal. None contains an amount. */
export const EXPLANATION_MESSAGES = {
  unsupported_language:
    "Explanations are available in English, Hindi and Kannada only.",
  session_expired:
    "This access session has expired. Please unlock the bill again.",
  verification_required:
    "Verify this bill before requesting an explanation.",
  assembly_failed:
    "The explanation could not be prepared right now. Please try again later.",
} as const;

export type ExplanationServiceErrorCode =
  | "unsupported_language"
  | "session_expired"
  | "verification_required"
  | Exclude<VerificationOutcome, "verified">
  | "assembly_failed";

export interface ExplanationServiceError {
  code: ExplanationServiceErrorCode;
  message: string;
  /** Only for amounts_differ, and only field keys — never values. */
  discrepancyKeys?: FinancialFieldKey[];
}

export type ExplanationServiceResult =
  | { kind: "explanation"; response: ExplanationResponse }
  | { kind: "error"; error: ExplanationServiceError };

function failure(
  code: ExplanationServiceErrorCode,
  message: string,
  discrepancyKeys?: readonly FinancialFieldKey[],
): ExplanationServiceResult {
  return {
    kind: "error",
    error:
      discrepancyKeys && discrepancyKeys.length > 0
        ? { code, message, discrepancyKeys: [...discrepancyKeys] }
        : { code, message },
  };
}

/**
 * Deterministic fallback. It contains no model text; if even the server
 * template cannot be built and validated, the request fails closed.
 */
function serverTemplate(
  language: LanguageCode,
  record: HospitalRecord,
): ExplanationServiceResult {
  const built = buildServerTemplateResponse({ language, record });
  if (!built.ok) {
    return failure("assembly_failed", EXPLANATION_MESSAGES.assembly_failed);
  }
  return { kind: "explanation", response: built.response };
}

export interface ExplanationInput {
  /** The server-side session proven by the caller's bearer token. */
  session: AccessSession;
  /** Untrusted request value; validated against the language contract. */
  language: unknown;
  repository: HospitalRecordRepository;
  provider: ExplanationProvider;
  now?: Date;
}

export async function generateExplanation(
  input: ExplanationInput,
): Promise<ExplanationServiceResult> {
  const now = input.now ?? new Date();

  const language = languageCodeSchema.safeParse(input.language);
  if (!language.success) {
    return failure(
      "unsupported_language",
      EXPLANATION_MESSAGES.unsupported_language,
    );
  }

  if (input.session.expiresAt.getTime() <= now.getTime()) {
    return failure("session_expired", EXPLANATION_MESSAGES.session_expired);
  }

  if (input.session.outcome === null) {
    return failure(
      "verification_required",
      EXPLANATION_MESSAGES.verification_required,
    );
  }

  if (input.session.outcome !== "verified") {
    // A discrepancy refusal may name the differing fields, but never values.
    let discrepancyKeys;
    if (input.session.outcome === "amounts_differ") {
      const record = await input.repository.findByBillNumber(
        input.session.billNumber,
      );
      if (record) discrepancyKeys = baselineDiscrepancies(record);
    }
    return failure(
      input.session.outcome,
      VERIFICATION_MESSAGES[input.session.outcome],
      discrepancyKeys,
    );
  }

  // The bill comes from the server-side session, never from the caller.
  const record = await input.repository.findByBillNumber(input.session.billNumber);
  if (!record) {
    return failure("bill_not_found", VERIFICATION_MESSAGES.bill_not_found);
  }

  const recomputed = computeVerification({ record, hospitalName: null });
  if (recomputed.outcome !== "verified") {
    return failure(
      recomputed.outcome,
      recomputed.message,
      recomputed.discrepancyKeys,
    );
  }

  // Keys and availability only. The model never sees an amount.
  const fields = buildProviderFields(record);

  let raw: string;
  try {
    raw = await input.provider.generate({
      language: language.data,
      fields,
    });
  } catch {
    // Timeout, HTTP error, blocked prompt: fall back without exposing why.
    return serverTemplate(language.data, record);
  }

  const draft = validateProviderDraft(raw);
  if (!draft.ok) {
    return serverTemplate(language.data, record);
  }

  const assembled = buildExplanationResponse({
    language: language.data,
    record,
    sections: draft.sections,
    validation: "validated",
  });
  if (!assembled.ok) {
    // A validated draft that cannot be rendered safely is discarded entirely.
    return serverTemplate(language.data, record);
  }

  return { kind: "explanation", response: assembled.response };
}
