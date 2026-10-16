/**
 * Text → identification candidates (pure, no I/O, no OCR).
 *
 * This is the only place that turns recognised text into candidate values. It
 * is deliberately independent of any OCR engine and of verification, so it can
 * be tested exhaustively with plain strings.
 *
 * It applies the schema's trust rules rather than restating them:
 *   - an unread value is `null`, never `""` and never a guess;
 *   - when nothing legible was read the status is `unreadable_image` and every
 *     candidate stays `null` — the pipeline never invents a value to look
 *     successful;
 *   - every candidate is only ever a *candidate*: identification says what the
 *     document appears to say, never that it was checked against a record.
 */
import type { BillIdentification } from "@/lib/schemas";

/** Below this many letters/digits in the whole page, treat the image as unread. */
export const MIN_READABLE_CHARACTERS = 10;

/**
 * Minimum engine confidence (0-100) to accept a page as legible.
 *
 * Only applied when the engine reports a positive confidence: `0` means "the
 * engine did not report one" (or found nothing), and in that case the
 * text-density gate above decides on its own.
 */
export const MIN_MEAN_CONFIDENCE = 30;

/** Hospital names are printed at the top; only look this far down the page. */
export const HOSPITAL_NAME_SEARCH_LINES = 10;

/*
 * Patient-facing warnings. Named constants so they can be recognised and
 * replaced (rather than duplicated) when a candidate is filled in later.
 */
export const WARNING_NO_HOSPITAL_NAME = "The hospital name could not be read from this image.";
export const WARNING_NO_BILL_NUMBER = "The bill number could not be read from this image.";
export const WARNING_NOT_A_BILL =
  "The image was readable but does not appear to be a hospital bill.";
export const WARNING_UNLABELLED_BILL_NUMBER =
  "The bill number was read without a printed label, so it may be incomplete. Please check it against the bill.";
export const WARNING_MANUAL_BILL_NUMBER_USED =
  "The bill number was taken from your typed entry because it could not be read from the image.";
export const WARNING_MANUAL_BILL_NUMBER_MISMATCH =
  "The bill number you typed does not match the number read from the image. The number read from the image is shown; please check it.";

/** Warnings that only describe a candidate being absent, so they can be superseded. */
const OUTDATED_WHEN_FILLED = [WARNING_NO_HOSPITAL_NAME, WARNING_NO_BILL_NUMBER, WARNING_NOT_A_BILL];

/** Schema limits, mirrored so a candidate is never built out of range. */
const MAX_BILL_NUMBER_LENGTH = 100;
const MAX_HOSPITAL_NAME_LENGTH = 300;

/** Words that appear on a bill but are not part of the hospital's name. */
const NON_NAME_WORDS = new Set([
  "name",
  "names",
  "address",
  "detail",
  "details",
  "number",
  "no",
  "nos",
  "id",
  "code",
  "bill",
  "tax",
  "invoice",
  "receipt",
  "original",
  "copy",
  "duplicate",
  "date",
  "phone",
  "mobile",
  "email",
  "gst",
  "gstin",
  "licence",
  "license",
  "registration",
  "regd",
  "reg",
]);

/** A line must contain one of these to be considered a hospital name. */
const HOSPITAL_KEYWORDS =
  /\b(hospital|clinic|nursing[\s-]*home|health[\s-]*cent(?:re|er)|healthcare|medical[\s-]*cent(?:re|er)|medical[\s-]*college|institute|infirmary|polyclinic|diagnostics|speciality|specialty|trust)\b/i;

/**
 * A labelled bill number, e.g. "Bill No: INV-2026-0042" or "Invoice # 98765".
 * Evaluated per line so it can never match across a line break.
 */
const LABELLED_BILL_NUMBER =
  /\b(?:bill|invoice|receipt)\b\s*(?:(?:number|nos|no|num|#)\s*[.:#-]?|[.:#-])\s*([A-Za-z0-9][A-Za-z0-9/\-_.]{2,49})/i;

/**
 * Fallback for an unlabelled but bill-like token, e.g. "INV-2026-0042".
 * Deliberately narrow (letters, a separator, then at least 3 digits) so it does
 * not fire on amounts, dates or phone numbers.
 */
const UNLABELLED_BILL_NUMBER = /\b([A-Z]{2,6}[-/]\d{3,}[-/]?\d*)\b/i;

/** Normalises raw OCR text: control characters out, whitespace collapsed. */
export function normalizeOcrText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\f/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n");
}

/** Number of letters and digits — spaces and punctuation do not count. */
export function countMeaningfulCharacters(text: string): number {
  return (text.match(/[A-Za-z0-9]/g) ?? []).length;
}

/**
 * Normalises a bill number for storage as a *candidate*: whitespace collapsed,
 * surrounding separators stripped, uppercased. Uppercasing is a normalisation,
 * not a correction — downstream matching is case-insensitive anyway.
 */
export function normalizeBillNumber(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.\-_:,/]+$/, "")
    .toUpperCase()
    .slice(0, MAX_BILL_NUMBER_LENGTH);
}

/** Normalises a hospital name candidate: whitespace and edge punctuation. */
export function normalizeHospitalName(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.,;:#\-–_]+/, "")
    .replace(/[.,;:#\-–_]+$/, "")
    .trim()
    .slice(0, MAX_HOSPITAL_NAME_LENGTH);
}

/**
 * Builds a schema-shaped identification result from candidate values.
 *
 * `hospitalIdentifierCandidate` is always `null`: this stage extracts the
 * hospital NAME and the bill number only, so no identifier is ever guessed.
 */
export function buildIdentificationResult(input: {
  billNumber: string | null;
  hospitalName: string | null;
  warnings?: readonly string[];
}): BillIdentification {
  const hospitalName = input.hospitalName;
  const billNumber = input.billNumber;
  const warnings = [...(input.warnings ?? [])];

  let identificationStatus: BillIdentification["identificationStatus"];
  if (billNumber !== null && hospitalName !== null) {
    identificationStatus = "identified";
  } else if (billNumber !== null || hospitalName !== null) {
    identificationStatus = "partial";
    warnings.push(billNumber !== null ? WARNING_NO_HOSPITAL_NAME : WARNING_NO_BILL_NUMBER);
  } else {
    identificationStatus = "invalid_input";
    warnings.push(WARNING_NOT_A_BILL);
  }

  return {
    hospitalNameCandidate: hospitalName,
    hospitalIdentifierCandidate: null,
    billNumberCandidate: billNumber,
    identificationStatus,
    warnings,
  };
}

/** True when an image is too unreadable to extract anything from. */
function unreadableResult(reason: string): BillIdentification {
  return {
    hospitalNameCandidate: null,
    hospitalIdentifierCandidate: null,
    billNumberCandidate: null,
    identificationStatus: "unreadable_image",
    warnings: [reason],
  };
}

/** True when the line names an organisation rather than merely labelling one. */
function looksLikeOrganisationName(line: string): boolean {
  if (!HOSPITAL_KEYWORDS.test(line)) return false;
  const words = line
    .replace(/[^A-Za-z\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0);
  const meaningful = words.filter(
    (word) =>
      word.length >= 2 &&
      !NON_NAME_WORDS.has(word.toLowerCase()) &&
      !HOSPITAL_KEYWORDS.test(word),
  );
  return meaningful.length > 0;
}

function findBillNumber(lines: readonly string[]): { value: string; labelled: boolean } | null {
  for (const line of lines) {
    const labelled = line.match(LABELLED_BILL_NUMBER);
    if (labelled) {
      const value = normalizeBillNumber(labelled[1]);
      if (value.length > 0) return { value, labelled: true };
    }
  }
  for (const line of lines) {
    const unlabelled = line.match(UNLABELLED_BILL_NUMBER);
    if (unlabelled) {
      const value = normalizeBillNumber(unlabelled[1]);
      if (value.length > 0) return { value, labelled: false };
    }
  }
  return null;
}

function findHospitalName(lines: readonly string[]): string | null {
  for (const line of lines.slice(0, HOSPITAL_NAME_SEARCH_LINES)) {
    if (!looksLikeOrganisationName(line)) continue;
    const value = normalizeHospitalName(line);
    if (value.length > 0) return value;
  }
  return null;
}

/**
 * Turns recognised page text into a schema-shaped identification result.
 *
 * Callers MUST still validate the returned object with
 * `billIdentificationSchema` — that keeps the schema the single source of truth
 * even if this function is changed.
 */
export function extractBillCandidates(ocr: {
  text: string;
  meanConfidence: number;
}): BillIdentification {
  const text = normalizeOcrText(ocr.text);
  const lines = text.split("\n").filter((line) => line.length > 0);

  if (lines.length === 0 || countMeaningfulCharacters(text) < MIN_READABLE_CHARACTERS) {
    return unreadableResult("No readable text was found in the image.");
  }

  const confidenceIsReported = Number.isFinite(ocr.meanConfidence) && ocr.meanConfidence > 0;
  if (confidenceIsReported && ocr.meanConfidence < MIN_MEAN_CONFIDENCE) {
    return unreadableResult("The image was too unclear to read reliably.");
  }

  const billNumber = findBillNumber(lines);
  const hospitalName = findHospitalName(lines);

  const warnings: string[] = [];
  if (billNumber && !billNumber.labelled) {
    warnings.push(WARNING_UNLABELLED_BILL_NUMBER);
  }

  return buildIdentificationResult({
    billNumber: billNumber ? billNumber.value : null,
    hospitalName,
    warnings,
  });
}

/**
 * Folds a patient-typed bill number into an identification result.
 *
 * Used when an image could not be read well enough to give a number: the typed
 * value is what the patient knows, so it is used *and labelled as typed*, never
 * presented as if OCR had read it. If both readings exist and disagree, the one
 * read from the image is kept and the disagreement is surfaced as a warning.
 */
export function applyManualBillNumber(
  result: BillIdentification,
  rawManualBillNumber: string,
): BillIdentification {
  const typed = normalizeBillNumber(rawManualBillNumber);
  if (typed.length === 0) return result;
  if (result.billNumberCandidate === typed) return result;

  // Keep every warning that still applies; the "could not be read" ones are
  // dropped because this function is what resolves them.
  const carriedWarnings = result.warnings.filter((warning) => !OUTDATED_WHEN_FILLED.includes(warning));

  if (result.billNumberCandidate === null) {
    return buildIdentificationResult({
      billNumber: typed,
      hospitalName: result.hospitalNameCandidate,
      warnings: [...carriedWarnings, WARNING_MANUAL_BILL_NUMBER_USED],
    });
  }

  return buildIdentificationResult({
    billNumber: result.billNumberCandidate,
    hospitalName: result.hospitalNameCandidate,
    warnings: [...carriedWarnings, WARNING_MANUAL_BILL_NUMBER_MISMATCH],
  });
}
