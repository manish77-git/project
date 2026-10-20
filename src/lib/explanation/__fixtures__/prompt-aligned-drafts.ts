/**
 * Field-level explanations written to the repaired prompt's guidance.
 *
 * They contain no amounts, digits, dates, percentages, currency, coverage or
 * eligibility claims, waiver claims or payment obligations. They exist to prove
 * that a legitimate model-style draft passes the existing validator unchanged;
 * no real provider is called.
 */
import {
  financialFieldKeySchema,
  type FinancialFieldKey,
  type LanguageCode,
} from "@/lib/schemas";
import type { ProviderDraftSection } from "../validator";

export const PROMPT_ALIGNED_EXPLANATIONS: Record<
  LanguageCode,
  Record<FinancialFieldKey, string>
> = {
  en: {
    billTotalAfterDiscounts:
      "This is the overall amount billed after reductions were applied.",
    insuranceApprovedButNotPaid:
      "This is an amount the insurer has approved that is still awaiting settlement.",
    insurancePaidOrCredited:
      "This is an amount the insurer has already settled or credited.",
    patientPayments: "This is a payment you have already made.",
    printedAmountDue:
      "This is the amount the bill currently shows as outstanding.",
  },
  hi: {
    billTotalAfterDiscounts:
      "यह कटौतियों के बाद बिल की कुल राशि है।",
    insuranceApprovedButNotPaid:
      "यह वह राशि है जिसे बीमाकर्ता ने स्वीकृत किया है और जिसका निपटान अभी बाकी है।",
    insurancePaidOrCredited:
      "यह वह राशि है जिसे बीमाकर्ता पहले ही निपटा या जमा कर चुका है।",
    patientPayments: "यह वह राशि है जो आप पहले ही दे चुके हैं।",
    printedAmountDue:
      "यह वह राशि है जो बिल में अभी बाकी दिखाई गई है।",
  },
  kn: {
    billTotalAfterDiscounts:
      "ಇದು ಕಡಿತಗಳ ನಂತರದ ಒಟ್ಟು ಬಿಲ್ ಮೊತ್ತ.",
    insuranceApprovedButNotPaid:
      "ಇದು ವಿಮಾದಾರರು ಅನುಮೋದಿಸಿದ ಆದರೆ ಇನ್ನೂ ಇತ್ಯರ್ಥವಾಗದ ಮೊತ್ತ.",
    insurancePaidOrCredited:
      "ಇದು ವಿಮಾದಾರರು ಈಗಾಗಲೇ ಇತ್ಯರ್ಥಪಡಿಸಿದ ಅಥವಾ ಜಮಾ ಮಾಡಿದ ಮೊತ್ತ.",
    patientPayments: "ಇದು ನೀವು ಈಗಾಗಲೇ ಪಾವತಿಸಿದ ಮೊತ್ತ.",
    printedAmountDue:
      "ಇದು ಬಿಲ್‌ನಲ್ಲಿ ಇನ್ನೂ ಬಾಕಿ ಎಂದು ತೋರಿಸಿರುವ ಮೊತ್ತ.",
  },
};

export function promptAlignedSections(
  language: LanguageCode,
): ProviderDraftSection[] {
  return financialFieldKeySchema.options.map((fieldKey) => ({
    fieldKey,
    explanation: PROMPT_ALIGNED_EXPLANATIONS[language][fieldKey],
  }));
}
