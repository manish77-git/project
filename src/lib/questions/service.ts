/**
 * Authorized bill-question workflow.
 *
 * The shape of the answer is decided here, not by the model. The model
 * classifies the question and may contribute prose for answers that state no
 * figure (meaning, clarification, unsupported). Every answer that states a fact
 * is assembled by the server:
 *
 *   - `record_fact`  — the value is read from `record.recordAmounts[fieldKey]`,
 *                      re-checked against that same field, and rendered here.
 *                      The model's sentence is discarded entirely.
 *   - `discrepancy`  — built from the verification result's field keys. It
 *                      names no reason and no amount, because the system holds
 *                      neither.
 *   - `clarification` — built here when the model cannot tell which field the
 *                      question is about; the service never guesses.
 *   - `unavailable`  — built here when the provider fails or its draft is
 *                      rejected. Nothing is invented to fill the gap.
 *
 * Authorization is checked before the record is read and before the provider is
 * called:
 *   - live session, not expired;
 *   - verification has run for this session;
 *   - the record is resolved from the session's bill number, never from the
 *     request, and the verdict is recomputed against the current record;
 *   - a bill with an unresolved difference may be asked about (that is the
 *     point of discrepancy answers) but its figures are never released.
 */
import type { AccessSession } from "@/lib/access/store";
import type { HospitalRecord, HospitalRecordRepository } from "@/lib/records/mock-records";
import {
  questionAnswerResponseSchema,
  questionRequestSchema,
  QUESTION_ANSWER_NOTICE,
  type FinancialFieldKey,
  type LanguageCode,
  type QuestionAnswer,
  type QuestionAnswerResponse,
  type QuestionAnswerType,
  type VerificationOutcome,
} from "@/lib/schemas";
import {
  computeVerification,
  VERIFICATION_MESSAGES,
} from "@/lib/verification/service";
import {
  buildProviderFields,
  recordReferenceId,
} from "@/lib/explanation/validator";
import type { QuestionProvider } from "./provider";
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

/** One safe message per internal refusal. None contains an amount. */
export const QUESTION_MESSAGES = {
  invalid_request:
    "Send a question and one of the supported languages, and nothing else.",
  unsupported_language: "Answers are available in English, Hindi and Kannada only.",
  session_expired: "This access session has expired. Please unlock the bill again.",
  verification_required: "Verify this bill before asking about its amounts.",
  assembly_failed:
    "The answer could not be prepared right now. Please try again later.",
} as const;

export type QuestionServiceErrorCode =
  | "invalid_request"
  | "unsupported_language"
  | "session_expired"
  | "verification_required"
  /** Outcomes where there is no record to answer from at all. */
  | Extract<VerificationOutcome, "bill_not_found" | "hospital_not_registered">
  | "assembly_failed";

export interface QuestionServiceError {
  code: QuestionServiceErrorCode;
  message: string;
}

export type QuestionServiceResult =
  | { kind: "answer"; response: QuestionAnswerResponse }
  | { kind: "error"; error: QuestionServiceError };

function failure(
  code: QuestionServiceErrorCode,
  message: string,
): QuestionServiceResult {
  return { kind: "error", error: { code, message } };
}

/** Builds a server-rendered answer and puts it through the public contract. */
function renderAnswer(input: {
  language: LanguageCode;
  question: string;
  answerType: QuestionAnswerType;
  text: string;
  fieldKey?: FinancialFieldKey | null;
  amountRupees?: string | null;
  record?: HospitalRecord | null;
  facts?: QuestionAnswer["financialFactsUsed"];
  warnings?: readonly string[];
}): QuestionServiceResult {
  const citesRecord = input.answerType === "record_fact" && input.record;
  const answer: QuestionAnswer = {
    language: input.language,
    question: input.question,
    answerType: input.answerType,
    answerText: input.text,
    fieldKey: input.fieldKey ?? null,
    amountRupees: input.amountRupees ?? null,
    verifiedRecordReference: citesRecord
      ? {
          recordId: recordReferenceId(input.record as HospitalRecord),
          billNumber: (input.record as HospitalRecord).billNumber,
        }
      : null,
    financialFactsUsed: input.facts ? [...input.facts] : [],
    warnings: input.warnings ? [...input.warnings] : [],
    notice: QUESTION_ANSWER_NOTICE,
  };

  return validateAnswer(answer, "server_rendered");
}

/** Last gate before an answer leaves the service. */
function validateAnswer(
  answer: QuestionAnswer,
  validation: "validated" | "server_rendered",
): QuestionServiceResult {
  const parsed = questionAnswerResponseSchema.safeParse({ validation, answer });
  if (!parsed.success) {
    return failure("assembly_failed", QUESTION_MESSAGES.assembly_failed);
  }
  return { kind: "answer", response: parsed.data };
}

export interface QuestionInput {
  /** The server-side session proven by the caller's bearer token. */
  session: AccessSession;
  /** Untrusted request value; validated against the question contract. */
  request: unknown;
  repository: HospitalRecordRepository;
  provider: QuestionProvider;
  now?: Date;
}

export async function answerQuestion(
  input: QuestionInput,
): Promise<QuestionServiceResult> {
  const now = input.now ?? new Date();

  const request = questionRequestSchema.safeParse(input.request);
  if (!request.success) {
    return failure("invalid_request", QUESTION_MESSAGES.invalid_request);
  }
  const { question, language } = request.data;

  if (input.session.expiresAt.getTime() <= now.getTime()) {
    return failure("session_expired", QUESTION_MESSAGES.session_expired);
  }

  if (input.session.outcome === null) {
    return failure("verification_required", QUESTION_MESSAGES.verification_required);
  }

  // The bill comes from the server-side session, never from the caller.
  const record = await input.repository.findByBillNumber(input.session.billNumber);
  if (!record) {
    return failure("bill_not_found", VERIFICATION_MESSAGES.bill_not_found);
  }

  const recomputed = computeVerification({ record, hospitalName: null });
  if (recomputed.outcome === "hospital_not_registered") {
    return failure(
      "hospital_not_registered",
      VERIFICATION_MESSAGES.hospital_not_registered,
    );
  }
  if (recomputed.outcome === "bill_not_found") {
    return failure("bill_not_found", VERIFICATION_MESSAGES.bill_not_found);
  }

  const verified = recomputed.outcome === "verified";
  const discrepancyKeys = recomputed.discrepancyKeys;
  const fields = buildProviderFields(record);

  const fallback = (): QuestionServiceResult =>
    renderAnswer({
      language,
      question,
      answerType: "unavailable",
      text: unavailableText(language),
    });

  let raw: string;
  try {
    raw = await input.provider.generate({
      language,
      question,
      fields,
      figuresAllowed: verified,
    });
  } catch {
    // Timeout, HTTP error, blocked prompt: nothing is guessed to fill the gap.
    return fallback();
  }

  const draft = validateQuestionDraft(raw);

  if (!draft.ok) {
    if (draft.reason === "field_required") {
      // The question asks for a value but does not say which one. Ask.
      return renderAnswer({
        language,
        question,
        answerType: "clarification",
        text: clarificationText(language),
      });
    }
    return fallback();
  }

  switch (draft.draft.type) {
    case "meaning":
    case "ambiguous":
    case "unsupported": {
      // Model prose only. These answers carry no figure and cite no record,
      // which the response schema enforces.
      const answerType: QuestionAnswerType =
        draft.draft.type === "ambiguous" ? "clarification" : draft.draft.type;
      return validateAnswer(
        {
          language,
          question,
          answerType,
          answerText: draft.draft.explanation,
          fieldKey: null,
          amountRupees: null,
          verifiedRecordReference: null,
          financialFactsUsed: [],
          warnings: [],
          notice: QUESTION_ANSWER_NOTICE,
        },
        "validated",
      );
    }

    case "discrepancy": {
      if (discrepancyKeys.length > 0) {
        return renderAnswer({
          language,
          question,
          answerType: "discrepancy",
          text: discrepancyText(language, discrepancyKeys),
        });
      }
      // The patient expects a difference and there is none. Say so plainly
      // rather than labelling a no-difference answer as a discrepancy.
      return renderAnswer({
        language,
        question,
        answerType: "unsupported",
        text: noDiscrepancyText(language, verified),
      });
    }

    case "record_fact": {
      const fieldKey = draft.draft.fieldKey;
      if (fieldKey === null) {
        // Unreachable through validateQuestionDraft, kept as a structural guard.
        return renderAnswer({
          language,
          question,
          answerType: "clarification",
          text: clarificationText(language),
        });
      }

      if (!verified) {
        // The figures are not released to this session, so no figure is
        // written. Which refusal applies depends on WHY: a bill whose check
        // found a difference was checked, and telling the patient otherwise
        // would be false.
        return renderAnswer({
          language,
          question,
          answerType: "unsupported",
          text:
            discrepancyKeys.length > 0
              ? figuresWithheldDiscrepancyText(language)
              : figuresNotVerifiedText(language),
        });
      }

      const rendered = renderRecordFact({ language, record, fieldKey });
      if (!rendered.ok) {
        return fallback();
      }

      return renderAnswer({
        language,
        question,
        answerType: "record_fact",
        text: rendered.answer.text,
        fieldKey,
        amountRupees: rendered.answer.amountRupees,
        record,
        facts: [
          {
            fieldKey,
            amountRupees: rendered.answer.amountRupees,
            pageNumber: null,
          },
        ],
        warnings: rendered.answer.warnings,
      });
    }
  }
}
