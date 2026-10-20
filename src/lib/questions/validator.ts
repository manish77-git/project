/**
 * The question-answering validator and the server-side answer renderer.
 *
 * Two jobs, kept in one module because they are the same guarantee seen from
 * two sides:
 *
 *   1. **What may leave the model.** A draft is parsed with a strict shape,
 *      then its prose is run through the explanation validator's text checks —
 *      the same functions, not a copy, so the two paths cannot drift apart.
 *      A draft that fails is discarded; it is never repaired and never
 *      returned.
 *   2. **What the server writes.** Every answer that states a fact —
 *      `record_fact`, `discrepancy`, `clarification`, `unsupported`,
 *      `unavailable` — is rendered here from the authoritative record and the
 *      verification outcome. The model contributes no part of it.
 *
 * The core rule this enforces:
 *
 *   THE SERVER DETERMINES FINANCIAL FACTS. GEMINI EXPLAINS THEM.
 *
 * A figure can therefore only appear in a `record_fact` answer, read from
 * `record.recordAmounts[fieldKey]`, and re-checked with the same
 * `validateFinancialFact` used by the explanation path — a value attached to
 * the wrong field is a mismatch, not a fact.
 */
import {
  formatInrAmount,
  HEADINGS,
  MISSING_WARNING,
  renderValue,
  validateFinancialFact,
} from "@/lib/explanation/validator";
import { findTextSafetyFailure } from "@/lib/explanation/validator";
import type { HospitalRecord } from "@/lib/records/mock-records";
import {
  questionDraftSchema,
  type QuestionDraft,
} from "./provider";
import {
  monetaryAmountSchema,
  type FinancialFieldKey,
  type LanguageCode,
} from "@/lib/schemas";

export type QuestionDraftFailure =
  | "invalid_json"
  | "invalid_shape"
  /** The model said `record_fact` without naming one field: ask, do not guess. */
  | "field_required"
  /** The model attached a field to an answer type that cannot carry one. */
  | "field_unexpected"
  | "financial_claim"
  | "unsupported_claim";

export type QuestionDraftValidation =
  | { ok: true; draft: QuestionDraft }
  | { ok: false; reason: QuestionDraftFailure };

/**
 * Validates a raw provider response.
 *
 * The type/field rules are structural: `record_fact` must name exactly one
 * tracked field, and no other type may name one at all. The text checks are the
 * explanation validator's, so a digit, a date word, a currency or a coverage
 * promise is rejected here exactly as it is there.
 */
export function validateQuestionDraft(raw: string): QuestionDraftValidation {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "invalid_json" };
  }

  const parsed = questionDraftSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: "invalid_shape" };

  if (parsed.data.type === "record_fact" && parsed.data.fieldKey === null) {
    // Not a failure to fall back on: the service answers with a clarification,
    // because guessing which field a patient meant is exactly what it must not
    // do. `field_required` tells the service to take that path.
    return { ok: false, reason: "field_required" };
  }

  if (parsed.data.type !== "record_fact" && parsed.data.fieldKey !== null) {
    return { ok: false, reason: "field_unexpected" };
  }

  const safety = findTextSafetyFailure(parsed.data.explanation);
  if (safety) return { ok: false, reason: safety };

  return {
    ok: true,
    draft: {
      type: parsed.data.type,
      fieldKey: parsed.data.fieldKey,
      explanation: parsed.data.explanation,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Deterministic answer text
 *
 * Every string below is written here, not generated. They are the answers a
 * patient gets when the model is unavailable, when a figure is requested for an
 * unverified bill, and when the check found a difference.
 * ------------------------------------------------------------------ */

const CLARIFICATION: Record<LanguageCode, (fieldList: string) => string> = {
  en: (fields) =>
    `Which amount do you mean? I can explain: ${fields}.`,
  hi: (fields) =>
    `आप किस राशि की बात कर रहे हैं? मैं ये समझा सकता हूँ: ${fields}।`,
  kn: (fields) =>
    `ನೀವು ಯಾವ ಮೊತ್ತದ ಬಗ್ಗೆ ಕೇಳುತ್ತಿದ್ದೀರಿ? ನಾನು ಇವುಗಳನ್ನು ವಿವರಿಸಬಲ್ಲೆ: ${fields}.`,
};

const FIGURES_NOT_VERIFIED: Record<LanguageCode, string> = {
  en: "A recorded amount can be shown only after this bill has been checked against the hospital's record. Please have the bill checked, then ask again.",
  hi: "दर्ज राशि तभी दिखाई जा सकती है जब इस बिल की तुलना अस्पताल के रिकॉर्ड से कर ली गई हो। कृपया पहले बिल की जाँच करवाएँ, फिर दोबारा पूछें।",
  kn: "ದಾಖಲಿತ ಮೊತ್ತವನ್ನು ಈ ಬಿಲ್ ಅನ್ನು ಆಸ್ಪತ್ರೆಯ ದಾಖಲೆಯೊಂದಿಗೆ ಪರಿಶೀಲಿಸಿದ ನಂತರವೇ ತೋರಿಸಬಹುದು. ದಯವಿಟ್ಟು ಮೊದಲು ಬಿಲ್ ಪರಿಶೀಲಿಸಿ, ನಂತರ ಮತ್ತೆ ಕೇಳಿ.",
};

const FIGURES_WITHHELD_DISCREPANCY: Record<LanguageCode, string> = {
  en: "The amounts on this bill do not match the hospital's record, so the recorded amounts are not shown yet. Please ask the hospital about the fields that differ.",
  hi: "इस बिल की राशियाँ अस्पताल के रिकॉर्ड से मेल नहीं खातीं, इसलिए दर्ज राशियाँ अभी नहीं दिखाई गई हैं। कृपया अस्पताल से उन क्षेत्रों के बारे में पूछें जिनमें अंतर है।",
  kn: "ಈ ಬಿಲ್‌ನ ಮೊತ್ತಗಳು ಆಸ್ಪತ್ರೆಯ ದಾಖಲೆಯೊಂದಿಗೆ ಹೊಂದಿಕೆಯಾಗುತ್ತಿಲ್ಲ, ಆದ್ದರಿಂದ ದಾಖಲಿತ ಮೊತ್ತಗಳನ್ನು ಇನ್ನೂ ತೋರಿಸಲಾಗಿಲ್ಲ. ದಯವಿಟ್ಟು ವ್ಯತ್ಯಾಸವಿರುವ ವಿಭಾಗಗಳ ಬಗ್ಗೆ ಆಸ್ಪತ್ರೆಯಲ್ಲಿ ಕೇಳಿ.",
};

const NO_DISCREPANCY: Record<LanguageCode, string> = {
  en: "The check did not find a difference between this bill and the hospital's record.",
  hi: "इस बिल और अस्पताल के रिकॉर्ड के बीच कोई अंतर नहीं मिला।",
  kn: "ಈ ಬಿಲ್ ಮತ್ತು ಆಸ್ಪತ್ರೆಯ ದಾಖಲೆಯ ನಡುವೆ ಯಾವುದೇ ವ್ಯತ್ಯಾಸ ಕಂಡುಬಂದಿಲ್ಲ.",
};

const NOT_CHECKED_YET: Record<LanguageCode, string> = {
  en: "This bill has not been checked against the hospital's record yet, so there is nothing to compare.",
  hi: "इस बिल की अभी अस्पताल के रिकॉर्ड से जाँच नहीं हुई है, इसलिए तुलना करने के लिए कुछ नहीं है।",
  kn: "ಈ ಬಿಲ್ ಅನ್ನು ಇನ್ನೂ ಆಸ್ಪತ್ರೆಯ ದಾಖಲೆಯೊಂದಿಗೆ ಪರಿಶೀಲಿಸಿಲ್ಲ, ಹಾಗಾಗಿ ಹೋಲಿಸಲು ಏನೂ ಇಲ್ಲ.",
};

const DISCREPANCY: Record<LanguageCode, (fieldList: string) => string> = {
  en: (fields) =>
    `The check found a difference between this bill and the hospital's record in these fields: ${fields}. Please ask the hospital about these fields.`,
  hi: (fields) =>
    `इस बिल और अस्पताल के रिकॉर्ड के बीच इन क्षेत्रों में अंतर मिला: ${fields}। कृपया अस्पताल से इन क्षेत्रों के बारे में पूछें।`,
  kn: (fields) =>
    `ಈ ಬಿಲ್ ಮತ್ತು ಆಸ್ಪತ್ರೆಯ ದಾಖಲೆಯ ನಡುವೆ ಈ ವಿಭಾಗಗಳಲ್ಲಿ ವ್ಯತ್ಯಾಸ ಕಂಡುಬಂದಿದೆ: ${fields}. ದಯವಿಟ್ಟು ಆಸ್ಪತ್ರೆಯಲ್ಲಿ ಈ ವಿಭಾಗಗಳ ಬಗ್ಗೆ ಕೇಳಿ.`,
};

const UNAVAILABLE: Record<LanguageCode, string> = {
  en: "I could not prepare an answer for that question. Please try again, or ask the hospital about this bill.",
  hi: "उस प्रश्न का उत्तर तैयार नहीं हो सका। कृपया दोबारा प्रयास करें, या अस्पताल से इस बिल के बारे में पूछें।",
  kn: "ಆ ಪ್ರಶ್ನೆಗೆ ಉತ್ತರ ಸಿದ್ಧಪಡಿಸಲಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ, ಅಥವಾ ಈ ಬಿಲ್ ಬಗ್ಗೆ ಆಸ್ಪತ್ರೆಯಲ್ಲಿ ಕೇಳಿ.",
};

/** The five field names, in the requested language, for a clarification. */
export function fieldList(language: LanguageCode): string {
  return Object.values(HEADINGS[language]).join(", ");
}

export function clarificationText(language: LanguageCode): string {
  return CLARIFICATION[language](fieldList(language));
}

export function figuresNotVerifiedText(language: LanguageCode): string {
  return FIGURES_NOT_VERIFIED[language];
}

/**
 * Figures are withheld because the check found a difference.
 *
 * Distinct from `figuresNotVerifiedText` on purpose: the bill WAS checked, and
 * telling a patient it was not checked would be false. It also does not say
 * which amount is right — the system has no basis for that.
 */
export function figuresWithheldDiscrepancyText(language: LanguageCode): string {
  return FIGURES_WITHHELD_DISCREPANCY[language];
}

/** A difference question when the check found none. */
export function noDiscrepancyText(
  language: LanguageCode,
  checked: boolean,
): string {
  return checked ? NO_DISCREPANCY[language] : NOT_CHECKED_YET[language];
}

/**
 * A difference question when the check DID find one.
 *
 * Only field NAMES are used: the verification result carries keys, not
 * figures, and this function has no access to the record's values at all. It
 * cannot name a reason for the difference, because nothing in the system
 * records one.
 */
export function discrepancyText(
  language: LanguageCode,
  discrepancyKeys: readonly FinancialFieldKey[],
): string {
  const names = discrepancyKeys.map((key) => HEADINGS[language][key]).join(", ");
  return DISCREPANCY[language](names);
}

export function unavailableText(language: LanguageCode): string {
  return UNAVAILABLE[language];
}

export interface RecordFactAnswer {
  text: string;
  amountRupees: string | null;
  fieldKey: FinancialFieldKey;
  warnings: string[];
}

/**
 * Renders one recorded value.
 *
 * Returns `ok: false` when the value does not validate against the record for
 * THIS field — the same check the explanation path uses, so a coding mistake
 * cannot render one field's number under another field's heading. A field with
 * no value renders as unknown (never as zero) and carries the "unknown, not
 * zero" warning.
 */
export function renderRecordFact(input: {
  language: LanguageCode;
  record: HospitalRecord;
  fieldKey: FinancialFieldKey;
}):
  | { ok: true; answer: RecordFactAnswer }
  | { ok: false; reason: "fact_mismatch" } {
  const amountRupees = input.record.recordAmounts[input.fieldKey] ?? null;
  if (validateFinancialFact(input.fieldKey, amountRupees, input.record) !== null) {
    return { ok: false, reason: "fact_mismatch" };
  }

  // The comparison above is numeric, so it accepts "10,000" as equal to
  // "10000". A figure that does not satisfy the money contract is not a fact
  // the server may publish, so it is refused here rather than formatted into
  // something that reads like a different number.
  if (amountRupees !== null && !monetaryAmountSchema.safeParse(amountRupees).success) {
    return { ok: false, reason: "fact_mismatch" };
  }

  const heading = HEADINGS[input.language][input.fieldKey];
  const warnings: string[] = [];
  if (amountRupees === null) {
    warnings.push(MISSING_WARNING[input.language](heading));
  }

  return {
    ok: true,
    answer: {
      fieldKey: input.fieldKey,
      amountRupees,
      text: [heading, renderValue(input.language, amountRupees)].join("\n"),
      warnings,
    },
  };
}

/** Re-exported so callers do not need two imports for one heading lookup. */
export { formatInrAmount };
