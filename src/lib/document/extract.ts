/**
 * OCR text → values read from the document (pure, no I/O, no OCR, no records).
 *
 * This module answers "what is printed on the bill the patient uploaded?" — it
 * never consults a hospital record, never falls back to a sample bill and never
 * guesses a value that is not legible:
 *
 *   - each field is `null` unless a labelled value was actually read;
 *   - a value printed twice with different figures is refused (null) and a
 *     warning explains why, rather than picking one;
 *   - every extracted value keeps the exact line it came from, so the patient
 *     can check it against the paper bill;
 *   - a number that cannot be tied to a meaningful label is not a total, an
 *     insurance approval or a patient balance.
 *
 * Text extraction is independent of verification by construction: this module
 * imports nothing from `@/lib/verification` or `@/lib/records`.
 */
import {
  DOCUMENT_EXTRACTION_NOTICE,
  type BillDocumentExtraction,
  type DocumentFieldEvidence,
  type ExtractedAmountField,
  type ExtractedDateField,
  type ExtractedLineItem,
  type ExtractedTextField,
} from "@/lib/schemas";
import { extractBillCandidates, normalizeOcrText } from "@/lib/identification/extract";

export const WARNING_UNREADABLE_DOCUMENT =
  "No readable text was found in the uploaded bill, so no figures are shown.";
export const WARNING_NO_AMOUNTS =
  "No bill total, insurance-approved amount or patient-payable amount could be read from this document.";
export const WARNING_NO_LINE_ITEMS =
  "No itemised charges could be read from this document.";
export const WARNING_AMBIGUOUS_TOTAL =
  "More than one different total was printed on this bill, so no total is shown. Please check the bill yourself.";
export const WARNING_AMBIGUOUS_INSURANCE =
  "More than one different insurance-approved amount was printed, so no insurance figure is shown.";
export const WARNING_AMBIGUOUS_PATIENT =
  "More than one different patient-payable amount was printed, so no patient balance is shown.";
export const WARNING_AMBIGUOUS_DATE =
  "More than one different bill date was printed, so no date is shown.";

const MAX_LINE_ITEMS = 50;
const MAX_DESCRIPTION_LENGTH = 300;

/** Words on a bill that are not a charge description. */
const NON_ITEM_LINE =
  /\b(?:date|bill\s*(?:no|number|num)|invoice\s*(?:no|number|num)|receipt\s*(?:no|number)|phone|mobile|tel|contact|email|gstin|gst\s*no|reg(?:istration)?\s*(?:no|number)|uhid|mrn|aadhaar|address|patient\s*(?:name|id)|paid|payment|payments|deposit|advance|refund|credited)\b/i;

const SUMMARY_LINE = /\b(?:total|subtotal|balance|amount\s+(?:due|payable)|payable|insurance|discount)\b/i;

const INSURANCE_WORD = /\b(?:insurance|insurer|tpa|mediclaim)\b/i;
const APPROVED_WORD = /\b(?:approved|sanctioned|admissible|approval)\b/i;
const PATIENT_WORD = /\b(?:patient|you|self)\b/i;
const PAYABLE_WORD = /\b(?:payable|to\s+pay|share|due|balance)\b/i;
const TOTAL_WORD =
  /\b(?:grand\s+total|total\b|bill\s+total|amount\s+(?:due|payable)|net\s+(?:amount|total|payable)|balance\s+due|payable\s+amount)\b/i;

const DATE_LABEL = /\b(?:bill|invoice|receipt|admission|discharge)?\s*date\b/i;
const DATE_TOKEN =
  /(\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/g;

/** Any monetary-looking token on a line, with its raw spelling. */
const AMOUNT_TOKEN =
  /(?:₹|Rs\.?|INR)?\s*((?:\d{1,3}(?:,\d{2,3})*|\d+)(?:\.\d{1,2})?)(?![0-9])(?:\s*\/-)?/gi;

/** A description followed by the line's final amount. */
const TRAILING_AMOUNT =
  /^(.*?)(?:₹|Rs\.?|INR)?\s*((?:\d{1,3}(?:,\d{2,3})*|\d+)(?:\.\d{1,2})?)(?![0-9])\s*(?:\/-)?$/i;

const CANONICAL_AMOUNT = /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/;

/** Digits with separators → the shared monetary decimal string, or null. */
export function normalizeAmountToken(raw: string): string | null {
  const cleaned = raw.replace(/,/g, "").trim();
  if (!CANONICAL_AMOUNT.test(cleaned)) return null;

  // "1,000" and "1,000.00" are the same amount. Compare and display one form,
  // so the same figure printed twice is not mistaken for a disagreement.
  const [whole, fraction] = cleaned.split(".");
  const trimmed = (fraction ?? "").replace(/0+$/, "");
  return trimmed.length > 0 ? `${whole}.${trimmed}` : whole;
}

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function evidenceOf(lines: readonly string[], index: number): DocumentFieldEvidence {
  return { lineNumber: index + 1, text: lines[index] ?? "" };
}

/** Finds the line a candidate value was read from, without inventing one. */
function locateValueLine(
  lines: readonly string[],
  value: string,
): { index: number; evidence: DocumentFieldEvidence } | null {
  const needle = compact(value);
  if (needle.length < 3) return null;
  const index = lines.findIndex((line) => compact(line).includes(needle));
  if (index < 0) return null;
  return { index, evidence: evidenceOf(lines, index) };
}

/** Every monetary token on a line, canonicalised; malformed tokens dropped. */
function amountsOnLine(line: string): Array<{ raw: string; canonical: string }> {
  const found: Array<{ raw: string; canonical: string }> = [];
  for (const match of line.matchAll(AMOUNT_TOKEN)) {
    const raw = match[1] ?? "";
    const canonical = normalizeAmountToken(raw);
    if (canonical !== null) found.push({ raw, canonical });
  }
  return found;
}

type AmountLabel = "total" | "insurance" | "patient" | "ignore";

/**
 * Classifies a line before its amounts are read.
 *
 * `ignore` means the line belongs to some other labelled thing (patient name,
 * bill number, date, phone) and must not become a charge line or a total.
 */
function classifyAmountLine(line: string): AmountLabel | null {
  if (INSURANCE_WORD.test(line)) {
    return APPROVED_WORD.test(line) ? "insurance" : "ignore";
  }
  if (PATIENT_WORD.test(line)) {
    return PAYABLE_WORD.test(line) ? "patient" : "ignore";
  }
  if (TOTAL_WORD.test(line)) return "total";
  if (DATE_LABEL.test(line)) return "ignore";
  if (NON_ITEM_LINE.test(line)) return "ignore";
  return null;
}

interface CollectedAmount {
  values: Map<string, DocumentFieldEvidence>;
  ambiguous: boolean;
}

function collect(collection: CollectedAmount, line: string, index: number): void {
  const amounts = amountsOnLine(line);
  // A labelled line carrying several different figures is not a reading we can
  // safely attribute to one field.
  if (amounts.length !== 1) {
    if (amounts.length > 1) collection.ambiguous = true;
    return;
  }
  const amount = amounts[0];
  collection.values.set(amount.canonical, { lineNumber: index + 1, text: line });
}

function toAmountField(
  collection: CollectedAmount,
  warning: string,
  warnings: string[],
): ExtractedAmountField | null {
  if (collection.ambiguous || collection.values.size > 1) {
    warnings.push(warning);
    return null;
  }
  const entries = [...collection.values.entries()];
  if (entries.length !== 1) return null;
  const [amountRupees, evidence] = entries[0];
  return { amountRupees, evidence };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  if (year < 1900 || year > 2100) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function parseDateToken(token: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(token);
  if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // Indian bills print day before month. A 4-digit year is required, so an
  // ambiguous 2-digit year is never expanded into a guess.
  const numeric = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(token);
  if (numeric) {
    return isoDate(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));
  }

  const dayMonth = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/.exec(token);
  if (dayMonth) {
    const month = MONTH_NAMES[dayMonth[2]?.toLowerCase() ?? ""];
    if (!month) return null;
    return isoDate(Number(dayMonth[3]), month, Number(dayMonth[1]));
  }

  const monthDay = /^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/.exec(token);
  if (monthDay) {
    const month = MONTH_NAMES[monthDay[1]?.toLowerCase() ?? ""];
    if (!month) return null;
    return isoDate(Number(monthDay[3]), month, Number(monthDay[2]));
  }

  return null;
}

function extractBillDate(
  lines: readonly string[],
  warnings: string[],
): { field: ExtractedDateField | null; lineIndex: number | null } {
  const dates = new Map<string, { evidence: DocumentFieldEvidence; index: number }>();

  lines.forEach((line, index) => {
    if (!DATE_LABEL.test(line)) return;
    const tokens = [...line.matchAll(DATE_TOKEN)].map((match) => match[1] ?? "");
    const parsed = [...new Set(tokens.map(parseDateToken).filter((value): value is string => value !== null))];
    if (parsed.length === 0) return;
    if (parsed.length > 1) {
      warnings.push(WARNING_AMBIGUOUS_DATE);
      return;
    }
    dates.set(parsed[0], { evidence: evidenceOf(lines, index), index });
  });

  if (dates.size === 0) return { field: null, lineIndex: null };
  if (dates.size > 1) {
    warnings.push(WARNING_AMBIGUOUS_DATE);
    return { field: null, lineIndex: null };
  }

  const [value, entry] = dates.entries().next().value as [string, { evidence: DocumentFieldEvidence; index: number }];
  return { field: { value, evidence: entry.evidence }, lineIndex: entry.index };
}

function extractLineItems(
  lines: readonly string[],
  skipLines: ReadonlySet<number>,
  warnings: string[],
): ExtractedLineItem[] {
  const items: ExtractedLineItem[] = [];

  for (const [index, line] of lines.entries()) {
    if (items.length >= MAX_LINE_ITEMS) break;
    if (skipLines.has(index)) continue;
    if (classifyAmountLine(line) !== null) continue;
    if (SUMMARY_LINE.test(line) || NON_ITEM_LINE.test(line)) continue;

    const match = TRAILING_AMOUNT.exec(line);
    if (!match) continue;

    const description = (match[1] ?? "")
      .replace(/[₹]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[\s:;\-–—_]+$/, "")
      .trim();
    const amount = normalizeAmountToken(match[2] ?? "");

    // A description needs actual words: "2026" or "01/10/" is not a charge.
    if (description.replace(/[^A-Za-z]/g, "").length < 2) continue;
    if (description.length > MAX_DESCRIPTION_LENGTH) continue;
    if (amount === null) continue;

    items.push({
      description,
      amountRupees: amount,
      evidence: evidenceOf(lines, index),
    });
  }

  if (items.length === 0) warnings.push(WARNING_NO_LINE_ITEMS);
  return items;
}

/**
 * Turns recognised page text into the document-extraction contract.
 *
 * Callers MUST still parse the result with `billDocumentExtractionSchema`.
 */
export function extractDocumentFields(ocr: {
  text: string;
  meanConfidence: number;
}): BillDocumentExtraction {
  const text = normalizeOcrText(ocr.text);
  const lines = text.split("\n").filter((line) => line.length > 0);
  const identification = extractBillCandidates(ocr);

  if (identification.identificationStatus === "unreadable_image") {
    return {
      readStatus: "unreadable",
      hospitalName: null,
      billNumber: null,
      billDate: null,
      lineItems: [],
      totalAmount: null,
      insuranceApprovedAmount: null,
      patientPayableAmount: null,
      currency: "INR",
      warnings: [...identification.warnings, WARNING_UNREADABLE_DOCUMENT],
      notice: DOCUMENT_EXTRACTION_NOTICE,
    };
  }

  const warnings: string[] = [...identification.warnings];
  const skipLines = new Set<number>();

  let hospitalName: ExtractedTextField | null = null;
  if (identification.hospitalNameCandidate) {
    const located = locateValueLine(lines, identification.hospitalNameCandidate);
    if (located) {
      hospitalName = {
        value: identification.hospitalNameCandidate,
        evidence: located.evidence,
      };
      skipLines.add(located.index);
    }
  }

  let billNumber: ExtractedTextField | null = null;
  if (identification.billNumberCandidate) {
    const located = locateValueLine(lines, identification.billNumberCandidate);
    if (located) {
      billNumber = {
        value: identification.billNumberCandidate,
        evidence: located.evidence,
      };
      skipLines.add(located.index);
    }
  }

  const dateResult = extractBillDate(lines, warnings);
  if (dateResult.lineIndex !== null) skipLines.add(dateResult.lineIndex);

  const total: CollectedAmount = { values: new Map(), ambiguous: false };
  const insurance: CollectedAmount = { values: new Map(), ambiguous: false };
  const patient: CollectedAmount = { values: new Map(), ambiguous: false };

  lines.forEach((line, index) => {
    const label = classifyAmountLine(line);
    if (label === null || label === "ignore") return;
    skipLines.add(index);
    collect(label === "total" ? total : label === "insurance" ? insurance : patient, line, index);
  });

  const totalAmount = toAmountField(total, WARNING_AMBIGUOUS_TOTAL, warnings);
  const insuranceApprovedAmount = toAmountField(
    insurance,
    WARNING_AMBIGUOUS_INSURANCE,
    warnings,
  );
  const patientPayableAmount = toAmountField(
    patient,
    WARNING_AMBIGUOUS_PATIENT,
    warnings,
  );

  if (!totalAmount && !insuranceApprovedAmount && !patientPayableAmount) {
    warnings.push(WARNING_NO_AMOUNTS);
  }

  const lineItems = extractLineItems(lines, skipLines, warnings);

  return {
    readStatus: "readable",
    hospitalName,
    billNumber,
    billDate: dateResult.field,
    lineItems,
    totalAmount,
    insuranceApprovedAmount,
    patientPayableAmount,
    currency: "INR",
    warnings,
    notice: DOCUMENT_EXTRACTION_NOTICE,
  };
}
