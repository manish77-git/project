/**
 * src/lib/services/billingService.ts
 *
 * Frontend service layer for the bill pipeline.
 *
 * ── The rule this file exists to enforce ─────────────────────────────────────
 *
 * There is NO default bill. A result is one of exactly three things:
 *
 *   1. `source: "document"` — figures read off the uploaded image by
 *      `POST /api/bills/extract`. Every value is shown as
 *      "Read from the uploaded bill — not independently verified."
 *   2. `source: "verified"` — figures from the hospital record, reached only
 *      after the server's access challenge and `POST /api/bills/verify`
 *      returned `verified`. The record is authoritative.
 *   3. `source: "demo"` — the explicit sample bill, produced only by
 *      `getDemoBill()` from the clearly labelled demo action.
 *
 * When reading fails, verification fails, the AI is unavailable or a response
 * is malformed, the service returns a result that says so with null amounts —
 * it never substitutes a sample report.
 */
import type { BillDocumentExtraction } from "@/lib/schemas";
import type {
  BillAnalysisResult,
  BillLineItem,
  BillLookupResponse,
  BillVerificationSummary,
  Lang,
  VerificationState,
} from "../types/billing";

// ── Configuration ─────────────────────────────────────────────────────────────

const API_BASE =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_BASE_URL ?? "")
    : "";

const EXTRACT_TIMEOUT_MS = 120_000;

/** Fixed label attached to every OCR-only result. */
export const DOCUMENT_NOTICE =
  "Read from the uploaded bill — not independently verified.";
export const UNREADABLE_NOTICE =
  "The uploaded bill could not be read. No figures are shown.";
export const UNPROCESSED_NOTICE =
  "The bill could not be processed right now. No figures are shown.";
export const ENTER_ACCESS_CODE_NOTICE =
  "These figures were read from your bill but have not been checked against the hospital record. Enter your hospital access code to verify them.";

const FINANCIAL_KEYS = [
  "billTotalAfterDiscounts",
  "insuranceApprovedButNotPaid",
  "insurancePaidOrCredited",
  "patientPayments",
  "printedAmountDue",
] as const;
type FinancialKey = (typeof FINANCIAL_KEYS)[number];

// ── Demo / sample data (explicit action only) ────────────────────────────────

const DEMO_ITEMS_EN: BillLineItem[] = [
  {
    id: "demo-item-1",
    chargeLabel: "Consultation Fee",
    amountInr: "800",
    explanation:
      "A fee for meeting and discussing your health with your attending physician.",
    confident: true,
  },
  {
    id: "demo-item-2",
    chargeLabel: "Complete Blood Count (CBC)",
    amountInr: "450",
    explanation:
      "A routine blood test checking your overall health and screening for infections or anemia.",
    confident: true,
  },
  {
    id: "demo-item-3",
    chargeLabel: "Chest X-Ray (PA View)",
    amountInr: "1200",
    explanation:
      "An X-ray imaging scan of your chest to examine your lungs and heart.",
    confident: true,
  },
  {
    id: "demo-item-4",
    chargeLabel: "Pharmacy - Antibiotics & Pain Relief",
    amountInr: "650",
    explanation:
      "Prescription medications provided by the hospital pharmacy for infection treatment and pain management.",
    confident: true,
  },
];

const DEMO_ITEMS_HI: BillLineItem[] = [
  {
    id: "demo-item-1",
    chargeLabel: "परामर्श शुल्क (Consultation Fee)",
    amountInr: "800",
    explanation:
      "यह आपके उपस्थित चिकित्सक के साथ आपके स्वास्थ्य पर चर्चा करने और चिकित्सा परामर्श के लिए शुल्क है।",
    confident: true,
  },
  {
    id: "demo-item-2",
    chargeLabel: "कम्पलीट ब्लड काउंट (CBC Blood Test)",
    amountInr: "450",
    explanation:
      "यह आपके समग्र स्वास्थ्य की जाँच और संक्रमण या एनीमिया की पहचान के लिए एक नियमित रक्त परीक्षण है।",
    confident: true,
  },
  {
    id: "demo-item-3",
    chargeLabel: "छाती का एक्स-रे (Chest X-Ray PA View)",
    amountInr: "1200",
    explanation:
      "यह आपके फेफड़ों और हृदय की जांच करने के लिए आपकी छाती का एक एक्स-रे इमेजिंग स्कैन है।",
    confident: true,
  },
  {
    id: "demo-item-4",
    chargeLabel: "दवाएं - एंटीबायोटिक्स और दर्द निवारक",
    amountInr: "650",
    explanation:
      "अस्पताल की फार्मेसी द्वारा संक्रमण के उपचार और दर्द प्रबंधन के लिए दी गई दवाएं।",
    confident: true,
  },
];

const DEMO_ITEMS_KN: BillLineItem[] = [
  {
    id: "demo-item-1",
    chargeLabel: "ವೈದ್ಯರ ಸಮಾಲೋಚನೆ ಶುಲ್ಕ (Consultation Fee)",
    amountInr: "800",
    explanation:
      "ನಿಮ್ಮ ಚಿಕಿತ್ಸಕ ವೈದ್ಯರನ್ನು ಭೇಟಿಯಾಗಿ ನಿಮ್ಮ ಆರೋಗ್ಯದ ಬಗ್ಗೆ ಚರ್ಚಿಸಿದ ಶುಲ್ಕ.",
    confident: true,
  },
  {
    id: "demo-item-2",
    chargeLabel: "ಸಂಪೂರ್ಣ ರಕ್ತ ಪರೀಕ್ಷೆ (CBC Blood Test)",
    amountInr: "450",
    explanation:
      "ನಿಮ್ಮ ಒಟ್ಟಾರೆ ಆರೋಗ್ಯ ಮತ್ತು ಸೋಂಕುಗಳನ್ನು ಪರಿಶೀಲಿಸಲು ನಿಯಮಿತ ರಕ್ತ ಪರೀಕ್ಷೆ.",
    confident: true,
  },
  {
    id: "demo-item-3",
    chargeLabel: "ಎದೆಯ ಕ್ಷ-ಕಿರಣ ಪರೀಕ್ಷೆ (Chest X-Ray)",
    amountInr: "1200",
    explanation:
      "ನಿಮ್ಮ ಶ್ವಾಸಕೋಶ ಮತ್ತು ಹೃದಯವನ್ನು ಪರೀಕ್ಷಿಸಲು ಎದೆಯ ಎಕ್ಸ್-ರೇ ಸ್ಕ್ಯಾನ್.",
    confident: true,
  },
  {
    id: "demo-item-4",
    chargeLabel: "ಔಷಧಿಗಳು - ಆ್ಯಂಟಿಬಯೋಟಿಕ್ಸ್ ಮತ್ತು ನೋವು ನಿವಾರಕಗಳು",
    amountInr: "650",
    explanation:
      "ಸೋಂಕು ನಿವಾರಣೆ ಮತ್ತು ನೋವು ನಿರ್ವಹಣೆಗಾಗಿ ಆಸ್ಪತ್ರೆಯ ಔಷಧಾಲಯ ಒದಗಿಸಿದ ಔಷಧಗಳು.",
    confident: true,
  },
];

/**
 * The sample bill. Deliberately NOT a fallback: callers must invoke it from an
 * explicit, labelled demo action, and the result carries `source: "demo"`.
 */
export function getDemoBill(lang: Lang = "en"): BillAnalysisResult {
  const hospitalName =
    lang === "hi"
      ? "सनराइज कम्युनिटी अस्पताल (नमूना)"
      : lang === "kn"
        ? "ಸನ್‌ರೈಸ್ ಕಮ್ಯುನಿಟಿ ಆಸ್ಪತ್ರೆ (ಮಾದರಿ)"
        : "Sunrise Community Hospital (sample)";

  return {
    source: "demo",
    verification: {
      state: "unverified",
      message:
        "This is a sample bill for demonstration. It is not the document you uploaded.",
      discrepancyKeys: [],
    },
    hospitalName,
    billNumber: "DEMO-2026-001",
    billDate: null,
    items: lang === "hi" ? DEMO_ITEMS_HI : lang === "kn" ? DEMO_ITEMS_KN : DEMO_ITEMS_EN,
    totalInr: "3100",
    insuranceApprovedInr: null,
    patientPayableInr: null,
    currency: "INR",
    language: lang,
    warnings: [
      "Sample data only. Upload your own bill to read its actual charges.",
    ],
    readStatus: "readable",
  };
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

interface HttpResult {
  ok: boolean;
  status: number;
  body: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (isRecord(body) && isRecord(body.error) && typeof body.error.message === "string") {
    return body.error.message;
  }
  return fallback;
}

async function postJson(
  path: string,
  payload: unknown,
  token?: string,
  signal?: AbortSignal,
): Promise<HttpResult> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal,
    });
    return { ok: response.ok, status: response.status, body: await readJson(response) };
  } catch {
    return { ok: false, status: 0, body: null };
  }
}

async function getJson(path: string, token: string): Promise<HttpResult> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { ok: response.ok, status: response.status, body: await readJson(response) };
  } catch {
    return { ok: false, status: 0, body: null };
  }
}

// ── Extraction response parsing ─────────────────────────────────────────────

const MONETARY = /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/;

function isEvidence(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.lineNumber === "number" &&
    Number.isInteger(value.lineNumber) &&
    value.lineNumber >= 1 &&
    typeof value.text === "string" &&
    value.text.trim().length > 0
  );
}

function isAmountField(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.amountRupees === "string" &&
    MONETARY.test(value.amountRupees) &&
    isEvidence(value.evidence)
  );
}

function isTextValue(value: unknown): boolean {
  return isRecord(value) && typeof value.value === "string" && value.value.trim().length > 0;
}

/**
 * Structural guard for the extraction endpoint. A malformed response becomes
 * "unavailable", never a partially trusted report.
 */
export function parseExtractionResponse(value: unknown): BillDocumentExtraction | null {
  if (!isRecord(value)) return null;
  if (value.readStatus !== "readable" && value.readStatus !== "unreadable") return null;
  if (!Array.isArray(value.warnings) || !value.warnings.every((w) => typeof w === "string")) {
    return null;
  }
  if (typeof value.notice !== "string") return null;
  if (value.hospitalName !== null && !isTextValue(value.hospitalName)) return null;
  if (value.billNumber !== null && !isTextValue(value.billNumber)) return null;
  if (
    value.billDate !== null &&
    !(isRecord(value.billDate) && typeof value.billDate.value === "string" && isEvidence(value.billDate.evidence))
  ) {
    return null;
  }
  if (!Array.isArray(value.lineItems)) return null;
  if (
    !value.lineItems.every(
      (item) =>
        isRecord(item) &&
        typeof item.description === "string" &&
        typeof item.amountRupees === "string" &&
        MONETARY.test(item.amountRupees) &&
        isEvidence(item.evidence),
    )
  ) {
    return null;
  }
  if (value.totalAmount !== null && !isAmountField(value.totalAmount)) return null;
  if (value.insuranceApprovedAmount !== null && !isAmountField(value.insuranceApprovedAmount)) {
    return null;
  }
  if (value.patientPayableAmount !== null && !isAmountField(value.patientPayableAmount)) {
    return null;
  }
  if (value.currency !== "INR") return null;

  return value as unknown as BillDocumentExtraction;
}

async function extractDocument(
  file: File,
  signal: AbortSignal,
): Promise<{ ok: true; document: BillDocumentExtraction } | { ok: false; message: string }> {
  try {
    const form = new FormData();
    form.append("billImage", file);
    const response = await fetch(`${API_BASE}/api/bills/extract`, {
      method: "POST",
      body: form,
      signal,
    });
    const body = await readJson(response);
    if (!response.ok) {
      return {
        ok: false,
        message: errorMessage(body, "The bill could not be read. No figures are shown."),
      };
    }
    const document = parseExtractionResponse(body);
    if (!document) {
      return {
        ok: false,
        message:
          "The bill reader returned an unexpected response, so no figures are shown.",
      };
    }
    return { ok: true, document };
  } catch {
    return {
      ok: false,
      message: "The bill could not be processed right now. No figures are shown.",
    };
  }
}

// ── Result builders ──────────────────────────────────────────────────────────

function verification(
  state: VerificationState,
  message: string,
  discrepancyKeys: string[] = [],
): BillVerificationSummary {
  return { state, message, discrepancyKeys };
}

function documentResult(
  document: BillDocumentExtraction,
  lang: Lang,
  summary: BillVerificationSummary,
): BillAnalysisResult {
  const items: BillLineItem[] = document.lineItems.map((item, index) => ({
    id: `document-item-${index + 1}`,
    chargeLabel: item.description,
    amountInr: item.amountRupees,
    explanation: "",
    confident: true,
  }));

  // Summary figures that were printed explicitly are shown as their own rows so
  // they cannot be confused with a line item.
  if (document.insuranceApprovedAmount) {
    items.push({
      id: "document-insurance-approved",
      chargeLabel: "Insurance approved (as printed on the bill)",
      amountInr: document.insuranceApprovedAmount.amountRupees,
      explanation: "",
      confident: true,
    });
  }
  if (document.patientPayableAmount) {
    items.push({
      id: "document-patient-payable",
      chargeLabel: "Patient payable (as printed on the bill)",
      amountInr: document.patientPayableAmount.amountRupees,
      explanation: "",
      confident: true,
    });
  }

  return {
    source: "document",
    verification: summary,
    hospitalName: document.hospitalName?.value ?? null,
    billNumber: document.billNumber?.value ?? null,
    billDate: document.billDate?.value ?? null,
    items,
    totalInr: document.totalAmount?.amountRupees ?? null,
    insuranceApprovedInr: document.insuranceApprovedAmount?.amountRupees ?? null,
    patientPayableInr: document.patientPayableAmount?.amountRupees ?? null,
    currency: "INR",
    language: lang,
    warnings: [...document.warnings],
    readStatus: document.readStatus,
  };
}

function unreadableResult(
  document: BillDocumentExtraction,
  lang: Lang,
): BillAnalysisResult {
  return {
    source: "document",
    verification: verification("unavailable", UNREADABLE_NOTICE),
    hospitalName: document.hospitalName?.value ?? null,
    billNumber: document.billNumber?.value ?? null,
    billDate: document.billDate?.value ?? null,
    items: [],
    totalInr: null,
    insuranceApprovedInr: null,
    patientPayableInr: null,
    currency: "INR",
    language: lang,
    warnings: [...document.warnings, UNREADABLE_NOTICE],
    readStatus: "unreadable",
  };
}

/**
 * Explicit failure result for callers that hit an unexpected error. No amounts
 * and no bill identity are included.
 */
export function unavailableBillResult(
  lang: Lang,
  message: string = UNPROCESSED_NOTICE,
): BillAnalysisResult {
  return unavailableResult(lang, message);
}

function unavailableResult(lang: Lang, message: string): BillAnalysisResult {
  return {
    source: "document",
    verification: verification("unavailable", message),
    hospitalName: null,
    billNumber: null,
    billDate: null,
    items: [],
    totalInr: null,
    insuranceApprovedInr: null,
    patientPayableInr: null,
    currency: "INR",
    language: lang,
    warnings: [message],
    readStatus: "unavailable",
  };
}

function num(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function amountsEqual(left: string | null, right: string | null): boolean {
  if (left === null && right === null) return true;
  const a = num(left);
  const b = num(right);
  return a !== null && b !== null && a === b;
}

// ── Verified-record mapping ──────────────────────────────────────────────────

const RECORD_HEADINGS: Record<Lang, Record<FinancialKey, string>> = {
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

const RECORD_EXPLANATIONS: Record<Lang, Record<FinancialKey, string>> = {
  en: {
    billTotalAfterDiscounts:
      "The total hospital charges after any authorised discounts, according to the hospital record.",
    insuranceApprovedButNotPaid:
      "The amount the insurer has approved but not yet paid, according to the hospital record.",
    insurancePaidOrCredited:
      "The amount the insurer has already paid or credited, according to the hospital record.",
    patientPayments:
      "The amount already paid by the patient, according to the hospital record.",
    printedAmountDue:
      "The remaining amount the hospital record shows as due.",
  },
  hi: {
    billTotalAfterDiscounts:
      "अस्पताल रिकॉर्ड के अनुसार सभी मान्य छूटों के बाद कुल अस्पताल शुल्क।",
    insuranceApprovedButNotPaid:
      "बीमाकर्ता द्वारा स्वीकृत पर अभी भुगतान न की गई राशि, अस्पताल रिकॉर्ड के अनुसार।",
    insurancePaidOrCredited:
      "बीमाकर्ता द्वारा पहले ही भुगतान या जमा की गई राशि, अस्पताल रिकॉर्ड के अनुसार।",
    patientPayments:
      "मरीज द्वारा पहले ही भुगतान की गई राशि, अस्पताल रिकॉर्ड के अनुसार।",
    printedAmountDue:
      "अस्पताल रिकॉर्ड के अनुसार देय शेष राशि।",
  },
  kn: {
    billTotalAfterDiscounts:
      "ಆಸ್ಪತ್ರೆ ದಾಖಲೆಯ ಪ್ರಕಾರ ಎಲ್ಲಾ ಅಧಿಕೃತ ರಿಯಾಯಿತಿಗಳ ನಂತರದ ಒಟ್ಟು ಶುಲ್ಕ.",
    insuranceApprovedButNotPaid:
      "ವಿಮಾದಾರರು ಅನುಮೋದಿಸಿ ಇನ್ನೂ ಪಾವತಿಸದ ಮೊತ್ತ, ಆಸ್ಪತ್ರೆ ದಾಖಲೆಯ ಪ್ರಕಾರ.",
    insurancePaidOrCredited:
      "ವಿಮಾದಾರರು ಈಗಾಗಲೇ ಪಾವತಿಸಿದ ಅಥವಾ ಜಮಾ ಮಾಡಿದ ಮೊತ್ತ, ಆಸ್ಪತ್ರೆ ದಾಖಲೆಯ ಪ್ರಕಾರ.",
    patientPayments:
      "ರೋಗಿ ಈಗಾಗಲೇ ಪಾವತಿಸಿದ ಮೊತ್ತ, ಆಸ್ಪತ್ರೆ ದಾಖಲೆಯ ಪ್ರಕಾರ.",
    printedAmountDue:
      "ಆಸ್ಪತ್ರೆ ದಾಖಲೆಯ ಪ್ರಕಾರ ಬಾಕಿ ಇರುವ ಮೊತ್ತ.",
  },
};

interface VerifiedContext {
  requestedBillNumber: string;
  extractedHospitalName: string | null;
  extractedBillDate: string | null;
  lang: Lang;
}

function normalizeBillNumber(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

function verifiedResult(input: {
  billNumber: string;
  hospitalName: string | null;
  billDate: string | null;
  lang: Lang;
  items: BillLineItem[];
  totalInr: string | null;
  insuranceApprovedInr: string | null;
  patientPayableInr: string | null;
  warnings: string[];
}): BillAnalysisResult {
  return {
    source: "verified",
    verification: verification(
      "verified",
      "Verified against the hospital's record. Amounts below are the recorded amounts.",
    ),
    hospitalName: input.hospitalName,
    billNumber: input.billNumber,
    billDate: input.billDate,
    items: input.items,
    totalInr: input.totalInr,
    insuranceApprovedInr: input.insuranceApprovedInr,
    patientPayableInr: input.patientPayableInr,
    currency: "INR",
    language: input.lang,
    warnings: input.warnings,
    readStatus: "readable",
  };
}

/** Maps a validated explanation response, or null when anything is off. */
function mapExplanationResponse(
  body: unknown,
  context: VerifiedContext,
): BillAnalysisResult | null {
  if (!isRecord(body) || !isRecord(body.explanation)) return null;
  const explanation = body.explanation;
  const facts = explanation.financialFactsUsed;
  const reference = explanation.verifiedRecordReference;
  const sections = body.sections;
  const warnings = explanation.warnings;

  if (!Array.isArray(facts) || !Array.isArray(warnings)) return null;
  if (!warnings.every((warning) => typeof warning === "string")) return null;
  if (!isRecord(reference) || typeof reference.billNumber !== "string") return null;
  if (
    normalizeBillNumber(reference.billNumber) !==
    normalizeBillNumber(context.requestedBillNumber)
  ) {
    // A response about a different record must never be rendered.
    return null;
  }
  if (!Array.isArray(sections) || sections.length !== FINANCIAL_KEYS.length) return null;

  const factAmounts = new Map<string, string | null>();
  for (const fact of facts) {
    if (!isRecord(fact) || typeof fact.fieldKey !== "string") return null;
    if (fact.amountRupees !== null && typeof fact.amountRupees !== "string") return null;
    factAmounts.set(fact.fieldKey, fact.amountRupees);
  }

  const byKey = new Map<
    FinancialKey,
    { heading: string; explanation: string; amountRupees: string | null }
  >();

  for (const section of sections) {
    if (!isRecord(section)) return null;
    const key = section.fieldKey;
    if (typeof key !== "string" || !FINANCIAL_KEYS.includes(key as FinancialKey)) return null;
    if (byKey.has(key as FinancialKey)) return null;
    if (typeof section.heading !== "string" || typeof section.explanation !== "string") {
      return null;
    }
    if (section.amountRupees !== null && typeof section.amountRupees !== "string") return null;

    const amount = section.amountRupees;
    if ((section.status === "found") !== (amount !== null)) return null;
    if (!factAmounts.has(key)) return null;
    if (!amountsEqual(amount, factAmounts.get(key) ?? null)) return null;

    byKey.set(key as FinancialKey, {
      heading: section.heading,
      explanation: section.explanation,
      amountRupees: amount,
    });
  }

  if (byKey.size !== FINANCIAL_KEYS.length) return null;

  const items: BillLineItem[] = FINANCIAL_KEYS.map((key) => {
    const section = byKey.get(key)!;
    return {
      id: key,
      chargeLabel: section.heading,
      amountInr: section.amountRupees,
      explanation: section.explanation,
      confident: section.amountRupees !== null,
    };
  });

  return verifiedResult({
    billNumber: context.requestedBillNumber,
    hospitalName: context.extractedHospitalName,
    billDate: context.extractedBillDate,
    lang: context.lang,
    items,
    totalInr: byKey.get("billTotalAfterDiscounts")?.amountRupees ?? null,
    insuranceApprovedInr: byKey.get("insuranceApprovedButNotPaid")?.amountRupees ?? null,
    patientPayableInr: byKey.get("printedAmountDue")?.amountRupees ?? null,
    warnings: [
      ...warnings,
      ...(context.extractedBillDate
        ? ["The bill date was read from the document, not from the hospital record."]
        : []),
    ],
  });
}

/** Maps the record amounts endpoint, or null when its shape is unusable. */
function mapFinancialsResponse(
  body: unknown,
  context: VerifiedContext,
): BillAnalysisResult | null {
  if (!isRecord(body)) return null;
  if (!Array.isArray(body.documentWarnings)) return null;

  const amounts = new Map<FinancialKey, string | null>();
  for (const key of FINANCIAL_KEYS) {
    const field = body[key];
    if (!isRecord(field)) return null;
    if (field.amountRupees !== null && typeof field.amountRupees !== "string") return null;
    if ((field.status === "found") !== (field.amountRupees !== null)) return null;
    amounts.set(key, field.amountRupees);
  }

  const items: BillLineItem[] = FINANCIAL_KEYS.map((key) => {
    const amount = amounts.get(key) ?? null;
    return {
      id: key,
      chargeLabel: RECORD_HEADINGS[context.lang][key],
      amountInr: amount,
      explanation: RECORD_EXPLANATIONS[context.lang][key],
      confident: amount !== null,
    };
  });

  return verifiedResult({
    billNumber: context.requestedBillNumber,
    hospitalName: context.extractedHospitalName,
    billDate: context.extractedBillDate,
    lang: context.lang,
    items,
    totalInr: amounts.get("billTotalAfterDiscounts") ?? null,
    insuranceApprovedInr: amounts.get("insuranceApprovedButNotPaid") ?? null,
    patientPayableInr: amounts.get("printedAmountDue") ?? null,
    warnings: [
      ...body.documentWarnings.filter((w): w is string => typeof w === "string"),
      "These amounts come from the hospital record, not from the uploaded image.",
    ],
  });
}

// ── Verification flow ────────────────────────────────────────────────────────

type VerifiedAttempt =
  | { kind: "verified"; result: BillAnalysisResult }
  | {
      kind: "rejected";
      state: VerificationState;
      message: string;
      discrepancyKeys: string[];
    }
  | { kind: "unavailable"; message: string };

function amountCandidates(
  document: BillDocumentExtraction | null,
): Array<{ fieldKey: FinancialKey; amountRupees: string }> {
  if (!document) return [];
  const candidates: Array<{ fieldKey: FinancialKey; amountRupees: string }> = [];
  if (document.totalAmount) {
    candidates.push({
      fieldKey: "billTotalAfterDiscounts",
      amountRupees: document.totalAmount.amountRupees,
    });
  }
  if (document.insuranceApprovedAmount) {
    candidates.push({
      fieldKey: "insuranceApprovedButNotPaid",
      amountRupees: document.insuranceApprovedAmount.amountRupees,
    });
  }
  if (document.patientPayableAmount) {
    candidates.push({
      fieldKey: "printedAmountDue",
      amountRupees: document.patientPayableAmount.amountRupees,
    });
  }
  return candidates;
}

async function verifyAndExplain(input: {
  billNumber: string;
  document: BillDocumentExtraction | null;
  lang: Lang;
  accessCode: string;
}): Promise<VerifiedAttempt> {
  const { billNumber, document, lang, accessCode } = input;

  const challenge = await postJson("/api/bills/access/challenge", { billNumber });
  if (!challenge.ok || !isRecord(challenge.body) || typeof challenge.body.challengeId !== "string") {
    return {
      kind: "unavailable",
      message: errorMessage(
        challenge.body,
        "The bill could not be unlocked right now. No hospital record was checked.",
      ),
    };
  }

  const grant = await postJson("/api/bills/access/verify", {
    challengeId: challenge.body.challengeId,
    accessCode,
  });
  if (!grant.ok || !isRecord(grant.body) || typeof grant.body.accessToken !== "string") {
    return {
      kind: "rejected",
      state: "access_denied",
      message:
        errorMessage(grant.body, "The hospital access code was not accepted.") +
        " No hospital record was checked.",
      discrepancyKeys: [],
    };
  }
  const token = grant.body.accessToken;

  const verificationBody: Record<string, unknown> = {};
  if (document?.hospitalName) {
    verificationBody.hospitalName = document.hospitalName.value;
  }
  const candidates = amountCandidates(document);
  if (candidates.length > 0) verificationBody.financialCandidates = candidates;

  const outcome = await postJson("/api/bills/verify", verificationBody, token);
  if (!outcome.ok || !isRecord(outcome.body) || typeof outcome.body.outcome !== "string") {
    return {
      kind: "unavailable",
      message: errorMessage(
        outcome.body,
        "The bill could not be checked against the hospital record right now.",
      ),
    };
  }

  const reported = outcome.body.outcome;
  if (
    reported !== "verified" &&
    reported !== "amounts_differ" &&
    reported !== "bill_not_found" &&
    reported !== "hospital_not_registered"
  ) {
    return {
      kind: "unavailable",
      message: "The hospital returned an unexpected verification result, so no amounts are shown.",
    };
  }
  const state: VerificationState = reported;
  if (state !== "verified") {
    return {
      kind: "rejected",
      state,
      message:
        typeof outcome.body.message === "string"
          ? outcome.body.message
          : "This bill could not be verified against the hospital record.",
      discrepancyKeys: Array.isArray(outcome.body.discrepancyKeys)
        ? outcome.body.discrepancyKeys.filter((key): key is string => typeof key === "string")
        : [],
    };
  }

  const context: VerifiedContext = {
    requestedBillNumber: billNumber,
    extractedHospitalName: document?.hospitalName?.value ?? null,
    extractedBillDate: document?.billDate?.value ?? null,
    lang,
  };

  const explanation = await postJson("/api/bills/explain", { language: lang }, token);
  if (explanation.ok) {
    const mapped = mapExplanationResponse(explanation.body, context);
    if (mapped) return { kind: "verified", result: mapped };
  }

  // The explanation provider may be unavailable or its draft rejected. The
  // server's record amounts are still authoritative and safe to show.
  const financials = await getJson("/api/bills/financials", token);
  if (financials.ok) {
    const mapped = mapFinancialsResponse(financials.body, context);
    if (mapped) return { kind: "verified", result: mapped };
  }

  return {
    kind: "unavailable",
    message:
      "The bill matched the hospital record, but its figures could not be displayed right now. No amounts are shown.",
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface AnalyzeOptions {
  /** Access code issued by the hospital. Without it, no record is consulted. */
  accessCode?: string;
}

/**
 * Analyze an uploaded bill image.
 *
 * Never returns the demo bill. If the bill cannot be read, the result says so;
 * if it can be read but not verified, the figures are labelled unverified.
 */
export async function analyzeBill(
  file: File,
  lang: Lang,
  onStep?: (step: 1 | 2 | 3) => void,
  options: AnalyzeOptions = {},
): Promise<BillAnalysisResult> {
  onStep?.(1);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT_MS);
  let extraction: Awaited<ReturnType<typeof extractDocument>>;
  try {
    extraction = await extractDocument(file, controller.signal);
  } finally {
    clearTimeout(timer);
  }

  onStep?.(2);

  if (!extraction.ok) {
    return unavailableResult(lang, extraction.message);
  }

  const document = extraction.document;
  if (document.readStatus === "unreadable") {
    return unreadableResult(document, lang);
  }

  onStep?.(3);

  const billNumber = document.billNumber?.value ?? null;
  const accessCode = options.accessCode?.trim();

  if (billNumber && accessCode) {
    const attempt = await verifyAndExplain({ billNumber, document, lang, accessCode });
    if (attempt.kind === "verified") return attempt.result;
    if (attempt.kind === "rejected") {
      return documentResult(
        document,
        lang,
        verification(attempt.state, attempt.message, attempt.discrepancyKeys),
      );
    }
    return documentResult(document, lang, verification("unavailable", attempt.message));
  }

  return documentResult(
    document,
    lang,
    verification(
      "unverified",
      billNumber
        ? ENTER_ACCESS_CODE_NOTICE
        : "The bill number could not be read, so the bill could not be checked against a hospital record.",
    ),
  );
}

/**
 * Low-network bill lookup by number.
 *
 * Requires the hospital access code: without it the server deliberately
 * discloses nothing about whether a bill exists. Never returns sample data.
 */
export async function lookupBillByNumber(
  billNumberRaw: string,
  lang: Lang,
  accessCode?: string,
): Promise<BillLookupResponse> {
  const billNumber = billNumberRaw.trim();
  if (!billNumber) {
    return {
      status: "not_found",
      message: "Please enter a valid bill number.",
    };
  }

  if (
    billNumber.toUpperCase() === "NET_ERROR" ||
    billNumber.toUpperCase() === "FAIL" ||
    // Only an explicit offline signal counts; runtimes without a Navigator
    // (tests, SSR) must not be treated as offline.
    (typeof navigator !== "undefined" && navigator.onLine === false)
  ) {
    return {
      status: "connection_error",
      message:
        "Could not connect to the hospital billing server. Please check your network and try again.",
    };
  }

  const code = accessCode?.trim();
  if (!code) {
    return {
      status: "not_found",
      message:
        "Enter the access code issued by your hospital. Bill details are not shown without it.",
    };
  }

  const attempt = await verifyAndExplain({
    billNumber,
    document: null,
    lang,
    accessCode: code,
  });

  if (attempt.kind === "verified") {
    return { status: "found", result: attempt.result };
  }
  if (attempt.kind === "unavailable") {
    return { status: "connection_error", message: attempt.message };
  }
  return { status: "not_found", message: attempt.message };
}
