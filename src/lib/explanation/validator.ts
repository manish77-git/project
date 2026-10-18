/**
 * Stage 4 validator and renderer.
 *
 * The model is not asked for financial values. It receives field *keys* and
 * whether each value is available, and returns one short explanation per key.
 * Every amount in the final response is rendered here from the authoritative
 * hospital record. That is the primary safety property; the text checks below
 * are defence in depth.
 *
 * What this module guarantees:
 *
 *   - exactly one section for each of the five allow-listed fields;
 *   - an unknown, missing, duplicated or extra field fails the draft;
 *   - model prose contains no digit (ASCII or Unicode), currency, percentage,
 *     date word, number word, or common coverage/eligibility/waiver/payment
 *     claim;
 *   - a fact is valid only when its value equals the record's value for THAT
 *     field, compared as a normalized decimal (so `15,000.00` matches `15000`);
 *   - missing values stay null and are described as unknown, never as zero;
 *   - the final response is parsed by the additive response schema before it
 *     is returned.
 *
 * A deterministic server template exists for the case where the provider
 * fails or its draft fails validation. It contains no model text.
 */
import { z } from "zod";
import type { HospitalRecord } from "@/lib/records/mock-records";
import {
  EXPLANATION_NOTICE,
  explanationResponseSchema,
  financialFieldKeySchema,
  type Explanation,
  type ExplanationResponse,
  type ExplanationSection,
  type FinancialFact,
  type FinancialFieldKey,
  type LanguageCode,
} from "@/lib/schemas";
import type { ExplanationProviderField } from "./provider";

export interface ProviderDraftSection {
  fieldKey: FinancialFieldKey;
  explanation: string;
}

export interface ProviderDraft {
  sections: ProviderDraftSection[];
}

/** Loose enough to diagnose the shape, strict enough to reject extra fields. */
const rawDraftSchema = z
  .object({
    sections: z
      .array(
        z
          .object({
            fieldKey: z.string().trim().min(1).max(100),
            explanation: z.string().trim().min(1).max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();

export type DraftValidationFailure =
  | "invalid_json"
  | "invalid_shape"
  | "missing_field"
  | "unknown_field"
  | "duplicate_field"
  | "financial_claim"
  | "unsupported_claim";

export type ProviderDraftValidation =
  | { ok: true; sections: ProviderDraftSection[] }
  | { ok: false; reason: DraftValidationFailure };

const UNICODE_DIGIT = /\p{Nd}/u;
const CURRENCY_SYMBOL = /\p{Sc}/u;
const CURRENCY_WORD = /\b(?:INR|Rs\.?|rupees?)\b/iu;
const PERCENT = /[%٪％]|\bpercent(?:age)?\b|प्रतिशत|ಶೇಕಡಾ/iu;

/**
 * A month name is enough to treat the prose as a date claim. Numeric dates are
 * already caught by the digit rule, but "sometime in January" has no digit.
 */
const DATE_WORDS: readonly RegExp[] = [
  // Capitalised month names, including "May".
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/,
  // Lowercase month names except the modal verb "may".
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/iu,
  /\b(?:in|on|since|until|before|after|during)\s+may\b/iu,
  /\b(?:today|tomorrow|yesterday|next\s+(?:week|month)|last\s+(?:week|month))\b/iu,
  /जनवरी|फ़रवरी|फरवरी|मार्च|अप्रैल|मई|जून|जुलाई|अगस्त|सितंबर|अक्टूबर|नवंबर|दिसंबर|आज|कल|अगले सप्ताह|पिछले सप्ताह|अगले महीने|पिछले महीने/u,
  /ಜನವರಿ|ಫೆಬ್ರವರಿ|ಮಾರ್ಚ್|ಏಪ್ರಿಲ್|ಮೇ|ಜೂನ್|ಜುಲೈ|ಆಗಸ್ಟ್|ಸೆಪ್ಟೆಂಬರ್|ಅಕ್ಟೋಬರ್|ನವೆಂಬರ್|ಡಿಸೆಂಬರ್|ಇಂದು|ನಾಳೆ|ನಿನ್ನೆ|ಮುಂದಿನ ವಾರ|ಕಳೆದ ವಾರ|ಮುಂದಿನ ತಿಂಗಳು|ಕಳೆದ ತಿಂಗಳು/u,
];

/**
 * High-value number words. A model can invent "fifteen thousand" without ever
 * writing a digit; the structured contract means it has no reason to, but this
 * catches the obvious case without rejecting ordinary words like "one".
 */
const NUMBER_WORD_CLAIM =
  /\b(?:eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|lakh|lakhs|crore|crores)\b|हज़ार|हजार|लाख|करोड़|सौ|ಸಾವಿರ|ಲಕ್ಷ|ಕೋಟಿ|ನೂರು/iu;

/**
 * Claims the record cannot support. This list is a heuristic, not semantic
 * understanding; the structural contract above is what makes the response
 * safe. It covers the common English, Hindi and Kannada phrasings.
 */
const UNSUPPORTED_CLAIMS: readonly RegExp[] = [
  /\b(?:eligible|eligibility)\b/iu,
  /\bcover(?:ed|s|age)?\b/iu,
  /\bguarantee(?:d|s)?\b/iu,
  /\bwaiv(?:e|ed|er)\b/iu,
  /\bwrite[- ]?off\b/iu,
  /\b(?:must|should|need to|have to|has to)\s+pay\b/iu,
  /\b(?:you|the patient)\s+owe\b/iu,
  /\bpayment\s+is\s+required\b/iu,
  /\bpay\s+(?:now|immediately|today|by)\b/iu,
  /\b(?:insurance|insurer|policy)\b[^.]{0,40}\b(?:will|would|should|must|is going to)\s+pay\b/iu,
  /\b(?:extra|additional|special|loyalty)\s+discount\b/iu,
  /\bconfirmed\b/iu,
  /पात्र|कवरेज|कवर|गारंटी|माफ|भुगतान करना|चुकाना|अतिरिक्त छूट|विशेष छूट|बीमा[^।]{0,40}(?:भुगतान करेगा|भुगतान करेगी|देगा|देगी)/u,
  /ಅರ್ಹ|ಕವರೇಜ್|ಕವರ್|ಖಾತರಿ|ಮನ್ನಾ|ಪಾವತಿಸಬೇಕು|ತೆರಬೇಕು|ಹೆಚ್ಚುವರಿ ರಿಯಾಯಿತಿ|ವಿಶೇಷ ರಿಯಾಯಿತಿ|ವಿಮೆ[^.]{0,40}(?:ಪಾವತಿಸುತ್ತದೆ|ನೀಡುತ್ತದೆ)/u,
];

export type TextSafetyFailure = "financial_claim" | "unsupported_claim";

/** Returns why prose is unsafe, or null when it contains no financial claim. */
export function findTextSafetyFailure(text: string): TextSafetyFailure | null {
  if (UNICODE_DIGIT.test(text)) return "financial_claim";
  if (CURRENCY_SYMBOL.test(text) || CURRENCY_WORD.test(text)) {
    return "financial_claim";
  }
  if (PERCENT.test(text)) return "financial_claim";
  if (NUMBER_WORD_CLAIM.test(text)) return "financial_claim";
  if (DATE_WORDS.some((pattern) => pattern.test(text))) {
    return "financial_claim";
  }
  if (UNSUPPORTED_CLAIMS.some((pattern) => pattern.test(text))) {
    return "unsupported_claim";
  }
  return null;
}

/**
 * Validates a raw provider response.
 *
 * The field-key check is the structural guarantee: the model cannot introduce
 * a sixth field, omit one, duplicate one, or attach a value to one. The text
 * check is layered on top, so a leaked number is rejected even if it happens
 * to equal a record amount.
 */
export function validateProviderDraft(raw: string): ProviderDraftValidation {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "invalid_json" };
  }

  const parsed = rawDraftSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: "invalid_shape" };

  const allowed = new Set<string>(financialFieldKeySchema.options);
  const seen = new Set<string>();
  const sections: ProviderDraftSection[] = [];

  for (const section of parsed.data.sections) {
    if (!allowed.has(section.fieldKey)) {
      return { ok: false, reason: "unknown_field" };
    }
    if (seen.has(section.fieldKey)) {
      return { ok: false, reason: "duplicate_field" };
    }
    seen.add(section.fieldKey);

    const safety = findTextSafetyFailure(section.explanation);
    if (safety) return { ok: false, reason: safety };

    sections.push({
      fieldKey: section.fieldKey as FinancialFieldKey,
      explanation: section.explanation,
    });
  }

  if (sections.length !== allowed.size) {
    return { ok: false, reason: "missing_field" };
  }

  return { ok: true, sections };
}

/**
 * Canonical decimal form used to compare a claimed amount with the record.
 * Accepts thousands separators, a currency prefix and trailing fractional
 * zeros; rejects exponents, negative values and anything else.
 */
export function parseAmountToCanonical(value: string): string | null {
  const cleaned = value
    .trim()
    .replace(/\s+/g, "")
    .replace(/^(?:INR|Rs\.?|₹)/i, "")
    .replace(/,/g, "");

  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;

  const whole = (match[1] ?? "").replace(/^0+(?=\d)/, "");
  const fraction = (match[2] ?? "").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export type FactValidationFailure =
  | "unknown_field"
  | "amount_mismatch"
  | "missing_mismatch";

/**
 * Checks a value against the record's value for the SAME field.
 *
 * A correct number attached to another key is a mismatch: the association is
 * part of the fact, not just the number.
 */
export function validateFinancialFact(
  fieldKey: string,
  amountRupees: string | null,
  record: HospitalRecord,
): FactValidationFailure | null {
  if (!financialFieldKeySchema.safeParse(fieldKey).success) {
    return "unknown_field";
  }

  const key = fieldKey as FinancialFieldKey;
  const authoritative = record.recordAmounts[key] ?? null;

  if (authoritative === null) {
    return amountRupees === null ? null : "missing_mismatch";
  }
  if (amountRupees === null) return "amount_mismatch";

  const claimed = parseAmountToCanonical(amountRupees);
  const expected = parseAmountToCanonical(authoritative);
  if (claimed === null || expected === null) return "amount_mismatch";
  return claimed === expected ? null : "amount_mismatch";
}

/** Indian digit grouping, deterministic and independent of the host locale. */
export function formatInrAmount(amount: string): string {
  const [whole, fraction] = amount.split(".");
  if (!whole) return amount;

  let grouped: string;
  if (whole.length <= 3) {
    grouped = whole;
  } else {
    const lastThree = whole.slice(-3);
    const rest = whole.slice(0, -3);
    grouped = `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${lastThree}`;
  }

  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

const HEADINGS: Record<LanguageCode, Record<FinancialFieldKey, string>> = {
  en: {
    billTotalAfterDiscounts: "Bill total after discounts",
    insuranceApprovedButNotPaid: "Insurance approved but not paid",
    insurancePaidOrCredited: "Insurance paid or credited",
    patientPayments: "Amount you have paid",
    printedAmountDue: "Amount shown as due",
  },
  hi: {
    billTotalAfterDiscounts: "छूट के बाद कुल बिल",
    insuranceApprovedButNotPaid: "बीमा द्वारा स्वीकृत, भुगतान नहीं हुआ",
    insurancePaidOrCredited: "बीमा द्वारा भुगतान या जमा",
    patientPayments: "आपने जो भुगतान किया",
    printedAmountDue: "देय दिखाई गई राशि",
  },
  kn: {
    billTotalAfterDiscounts: "ರಿಯಾಯಿತಿಯ ನಂತರ ಒಟ್ಟು ಬಿಲ್",
    insuranceApprovedButNotPaid: "ವಿಮೆ ಅನುಮೋದಿಸಿದ, ಪಾವತಿಸದ ಮೊತ್ತ",
    insurancePaidOrCredited: "ವಿಮೆ ಪಾವತಿಸಿದ ಅಥವಾ ಜಮಾ ಮಾಡಿದ ಮೊತ್ತ",
    patientPayments: "ನೀವು ಪಾವತಿಸಿದ ಮೊತ್ತ",
    printedAmountDue: "ಬಾಕಿ ಎಂದು ತೋರಿಸಿರುವ ಮೊತ್ತ",
  },
};

const TEMPLATE_EXPLANATIONS: Record<
  LanguageCode,
  Record<FinancialFieldKey, string>
> = {
  en: {
    billTotalAfterDiscounts:
      "This is the total amount billed after any reductions have been applied.",
    insuranceApprovedButNotPaid:
      "This is the amount the insurer has approved but has not paid yet.",
    insurancePaidOrCredited:
      "This is the amount the insurer has already paid or credited.",
    patientPayments: "This is the amount you have already paid.",
    printedAmountDue: "This is the amount the bill shows as still due.",
  },
  hi: {
    billTotalAfterDiscounts:
      "यह कटौतियों के बाद कुल बिल की राशि है।",
    insuranceApprovedButNotPaid:
      "यह वह राशि है जिसे बीमाकर्ता ने स्वीकार किया है लेकिन अभी तक भुगतान नहीं किया है।",
    insurancePaidOrCredited:
      "यह वह राशि है जिसे बीमाकर्ता ने पहले ही भुगतान या जमा किया है।",
    patientPayments: "यह वह राशि है जिसे आपने पहले ही भुगतान किया है।",
    printedAmountDue: "यह वह राशि है जो बिल में अभी बाकी दिखाई गई है।",
  },
  kn: {
    billTotalAfterDiscounts:
      "ಇದು ಕಡಿತಗಳನ್ನು ಅನ್ವಯಿಸಿದ ನಂತರದ ಒಟ್ಟು ಬಿಲ್ ಮೊತ್ತ.",
    insuranceApprovedButNotPaid:
      "ಇದು ವಿಮಾದಾರರು ಅನುಮೋದಿಸಿದ ಆದರೆ ಇನ್ನೂ ಪಾವತಿಸದ ಮೊತ್ತ.",
    insurancePaidOrCredited:
      "ಇದು ವಿಮಾದಾರರು ಈಗಾಗಲೇ ಪಾವತಿಸಿದ ಅಥವಾ ಜಮಾ ಮಾಡಿದ ಮೊತ್ತ.",
    patientPayments: "ಇದು ನೀವು ಈಗಾಗಲೇ ಪಾವತಿಸಿದ ಮೊತ್ತ.",
    printedAmountDue: "ಇದು ಬಿಲ್‌ನಲ್ಲಿ ಇನ್ನೂ ಬಾಕಿ ಎಂದು ತೋರಿಸಿರುವ ಮೊತ್ತ.",
  },
};

const RECORD_PREFIX: Record<LanguageCode, string> = {
  en: "Hospital record: INR",
  hi: "अस्पताल रिकॉर्ड: INR",
  kn: "ಆಸ್ಪತ್ರೆ ದಾಖಲೆ: INR",
};

const SENTENCE_END: Record<LanguageCode, string> = {
  en: ".",
  hi: "।",
  kn: ".",
};

const MISSING_VALUE: Record<LanguageCode, string> = {
  en: "This amount is not available in the hospital record.",
  hi: "यह राशि अस्पताल रिकॉर्ड में उपलब्ध नहीं है।",
  kn: "ಈ ಮೊತ್ತವು ಆಸ್ಪತ್ರೆ ದಾಖಲೆಯಲ್ಲಿ ಲಭ್ಯವಿಲ್ಲ.",
};

const MISSING_WARNING: Record<LanguageCode, (heading: string) => string> = {
  en: (heading) =>
    `No amount is on file for "${heading}". It is shown as unknown, not as zero.`,
  hi: (heading) =>
    `"${heading}" के लिए कोई राशि दर्ज नहीं है। इसे अज्ञात माना गया है, शून्य नहीं।`,
  kn: (heading) =>
    `"${heading}" ಗಾಗಿ ಯಾವುದೇ ಮೊತ್ತ ದಾಖಲೆಯಲ್ಲಿಲ್ಲ. ಇದನ್ನು ಅಜ್ಞಾತ ಎಂದು ಪರಿಗಣಿಸಲಾಗಿದೆ, ಶೂನ್ಯವಲ್ಲ.`,
};

const NO_DATES_WARNING: Record<LanguageCode, string> = {
  en: "The hospital record supplied for this explanation contains no dates.",
  hi: "इस व्याख्या के लिए दिए गए अस्पताल रिकॉर्ड में कोई तारीख नहीं है।",
  kn: "ಈ ವಿವರಣೆಗೆ ಒದಗಿಸಿದ ಆಸ್ಪತ್ರೆ ದಾಖಲೆಯಲ್ಲಿ ಯಾವುದೇ ದಿನಾಂಕಗಳಿಲ್ಲ.",
};

const FALLBACK_WARNING: Record<LanguageCode, string> = {
  en: "A personalized explanation was unavailable, so this is a standard summary built directly from the hospital record.",
  hi: "व्यक्तिगत व्याख्या उपलब्ध नहीं थी, इसलिए यह अस्पताल रिकॉर्ड से सीधे तैयार किया गया सामान्य सारांश है।",
  kn: "ವೈಯಕ್ತಿಕ ವಿವರಣೆ ಲಭ್ಯವಿರಲಿಲ್ಲ, ಆದ್ದರಿಂದ ಇದು ಆಸ್ಪತ್ರೆ ದಾಖಲೆಯಿಂದ ನೇರವಾಗಿ ಸಿದ್ಧಪಡಿಸಿದ ಸಾಮಾನ್ಯ ಸಾರಾಂಶ.",
};

function renderValue(language: LanguageCode, amount: string | null): string {
  if (amount === null) return MISSING_VALUE[language];
  return `${RECORD_PREFIX[language]} ${formatInrAmount(amount)}${SENTENCE_END[language]}`;
}

/** Stable stand-in for the future stored record id; built only from the record. */
export function recordReferenceId(record: HospitalRecord): string {
  return `mock:${record.billNumber}`;
}

export interface BuildExplanationResponseInput {
  language: LanguageCode;
  record: HospitalRecord;
  sections: readonly ProviderDraftSection[];
  validation: "validated" | "server_template";
}

export type BuildExplanationResponseResult =
  | { ok: true; response: ExplanationResponse }
  | {
      ok: false;
      reason: "invalid_sections" | "fact_mismatch" | "schema_failure";
    };

export function buildExplanationResponse(
  input: BuildExplanationResponseInput,
): BuildExplanationResponseResult {
  if (input.sections.length !== 5) {
    return { ok: false, reason: "invalid_sections" };
  }

  const byKey = new Map<FinancialFieldKey, string>();
  for (const section of input.sections) {
    if (byKey.has(section.fieldKey)) {
      return { ok: false, reason: "invalid_sections" };
    }
    byKey.set(section.fieldKey, section.explanation);
  }
  if (byKey.size !== 5) return { ok: false, reason: "invalid_sections" };

  const narrative: string[] = [];
  const sections: ExplanationSection[] = [];
  const facts: FinancialFact[] = [];
  const warnings: string[] = [];

  for (const fieldKey of financialFieldKeySchema.options) {
    const explanation = byKey.get(fieldKey);
    if (!explanation) return { ok: false, reason: "invalid_sections" };

    // Read the value from THIS field, then re-check the association. A coding
    // mistake cannot render one field's number under another field's heading.
    const amountRupees = input.record.recordAmounts[fieldKey] ?? null;
    if (validateFinancialFact(fieldKey, amountRupees, input.record) !== null) {
      return { ok: false, reason: "fact_mismatch" };
    }

    const heading = HEADINGS[input.language][fieldKey];
    const status = amountRupees === null ? "missing" : "found";

    sections.push({
      fieldKey,
      heading,
      explanation,
      amountRupees,
      status,
    });
    facts.push({ fieldKey, amountRupees, pageNumber: null });

    if (amountRupees === null) {
      warnings.push(MISSING_WARNING[input.language](heading));
    }

    narrative.push(
      [heading, explanation, renderValue(input.language, amountRupees)].join("\n"),
    );
  }

  warnings.push(NO_DATES_WARNING[input.language]);
  if (input.validation === "server_template") {
    warnings.push(FALLBACK_WARNING[input.language]);
  }

  const explanation: Explanation = {
    language: input.language,
    explanationText: narrative.join("\n\n"),
    verifiedRecordReference: {
      recordId: recordReferenceId(input.record),
      billNumber: input.record.billNumber,
    },
    financialFactsUsed: facts,
    datesUsed: [],
    warnings,
    notice: EXPLANATION_NOTICE,
  };

  const parsed = explanationResponseSchema.safeParse({
    validation: input.validation,
    explanation,
    sections,
  });
  if (!parsed.success) return { ok: false, reason: "schema_failure" };

  return { ok: true, response: parsed.data };
}

export interface BuildTemplateInput {
  language: LanguageCode;
  record: HospitalRecord;
}

/**
 * Deterministic fallback, used when the provider fails or its draft fails
 * validation. It contains no model text and still renders the record's values
 * through the same association checks.
 */
export function buildServerTemplateResponse(
  input: BuildTemplateInput,
): BuildExplanationResponseResult {
  return buildExplanationResponse({
    language: input.language,
    record: input.record,
    validation: "server_template",
    sections: financialFieldKeySchema.options.map((fieldKey) => ({
      fieldKey,
      explanation: TEMPLATE_EXPLANATIONS[input.language][fieldKey],
    })),
  });
}

/** Builds the provider input: keys and availability only, never amounts. */
export function buildProviderFields(
  record: HospitalRecord,
): ExplanationProviderField[] {
  return financialFieldKeySchema.options.map((fieldKey) => ({
    fieldKey,
    status: record.recordAmounts[fieldKey] === undefined || record.recordAmounts[fieldKey] === null
      ? "missing"
      : "found",
  }));
}
