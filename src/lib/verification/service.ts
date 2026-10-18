/**
 * Bill verification: does the hospital's record match this bill?
 *
 * The comparison happens here, on the server, against the authoritative record.
 * A caller may describe what it read off the uploaded bill (a hospital name and
 * amounts); it can never state a verdict, and any amounts it supplies are
 * treated as claims to be checked, not as evidence.
 *
 * Two properties are worth stating explicitly, because they are easy to lose in
 * a later refactor:
 *
 *   1. **Monotone discrepancies.** The disagreement between the bill on file
 *      and the hospital's record is computed first and always counted. Supplied
 *      candidates can only ADD discrepancies, never remove one. Without this, a
 *      caller could send amounts equal to the hospital's record and turn an
 *      `amounts_differ` bill into a `verified` one — and the response itself
 *      would then leak the record's figures like an oracle.
 *   2. **No amounts in the answer.** The result carries the outcome, a
 *      patient-safe message and the KEYS of the fields that differed. The
 *      figures stay behind the authorised financial endpoint.
 */
import {
  normalizeBillNumberForLookup,
  type HospitalRecord,
  type HospitalRecordRepository,
} from "@/lib/records/mock-records";
import {
  billVerificationRequestSchema,
  billVerificationSchema,
  financialFieldKeySchema,
  type BillVerification,
  type BillVerificationCandidate,
  type BillVerificationRequest,
  type FinancialFieldKey,
  type VerificationOutcome,
} from "@/lib/schemas";

/** Patient-safe wording. Never quotes an amount or a patient's details. */
export const VERIFICATION_MESSAGES: Record<VerificationOutcome, string> = {
  verified: "The hospital's record matches this bill.",
  amounts_differ:
    "Some amounts on this bill do not match the hospital's record. Please check the fields listed with the hospital before paying.",
  bill_not_found:
    "No record of this bill was found at the hospital. Check the bill number, or ask the hospital to confirm it.",
  hospital_not_registered:
    "This hospital is not registered with us, so this bill cannot be checked yet.",
};

const ALL_FIELD_KEYS: readonly FinancialFieldKey[] = financialFieldKeySchema.options;

/**
 * Compares two amounts.
 *
 * Absent values are treated as "not comparable" rather than as a disagreement:
 * a missing amount is unknown, not zero, so `null` against a value is not
 * evidence that they differ. Equality is by numeric value, so "5000" and
 * "5000.00" are the same amount.
 */
function amountsEqual(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  if (left === undefined || right === undefined) return true;
  if (left === null || right === null) return true;
  return Number(left) === Number(right);
}

/** The server-side disagreement between the bill on file and the record. */
export function baselineDiscrepancies(record: HospitalRecord): FinancialFieldKey[] {
  return ALL_FIELD_KEYS.filter(
    (key) => !amountsEqual(record.printedAmounts[key], record.recordAmounts[key]),
  );
}

export interface ComputeVerificationInput {
  record: HospitalRecord;
  /** Hospital name read off the bill, when the caller read one. */
  hospitalName?: string | null;
  /** Amounts read off the uploaded bill, if the caller supplied any. */
  financialCandidates?: readonly BillVerificationCandidate[] | null;
}

/**
 * Pure: record + what the caller read -> outcome. No I/O, no clock.
 */
export function computeVerification(input: ComputeVerificationInput): BillVerification {
  const { record } = input;

  const namedHospital = input.hospitalName?.trim();
  if (
    namedHospital &&
    normalizeBillNumberForLookup(namedHospital) !== normalizeBillNumberForLookup(record.hospitalName)
  ) {
    // The bill number is not on file at the hospital the caller named. Saying
    // so is truthful; inventing an outcome about a record we did not match
    // would not be.
    return {
      outcome: "bill_not_found",
      message: VERIFICATION_MESSAGES.bill_not_found,
      discrepancyKeys: [],
    };
  }

  if (!record.registered) {
    return {
      outcome: "hospital_not_registered",
      message: VERIFICATION_MESSAGES.hospital_not_registered,
      discrepancyKeys: [],
    };
  }

  const baseline = baselineDiscrepancies(record);
  const suppliedDiff = (input.financialCandidates ?? [])
    .filter((candidate) => !amountsEqual(candidate.amountRupees, record.recordAmounts[candidate.fieldKey]))
    .map((candidate) => candidate.fieldKey);

  const discrepancyKeys = [...new Set([...baseline, ...suppliedDiff])].sort();

  if (discrepancyKeys.length > 0) {
    return {
      outcome: "amounts_differ",
      message: VERIFICATION_MESSAGES.amounts_differ,
      discrepancyKeys,
    };
  }

  return {
    outcome: "verified",
    message: VERIFICATION_MESSAGES.verified,
    discrepancyKeys: [],
  };
}

export type VerificationErrorCode = "invalid_request" | "extraction_failed";

export type VerificationServiceResult =
  | { kind: "result"; result: BillVerification }
  | { kind: "error"; error: { code: VerificationErrorCode; message: string } };

function hasDuplicateFieldKeys(candidates: readonly BillVerificationCandidate[]): boolean {
  const seen = new Set<FinancialFieldKey>();
  for (const candidate of candidates) {
    if (seen.has(candidate.fieldKey)) return true;
    seen.add(candidate.fieldKey);
  }
  return false;
}

/**
 * Verifies the bill named by `billNumber`.
 *
 * The bill number is passed in rather than read from the request: it comes from
 * the access session, so a caller cannot aim this at a record it was not
 * authorised to see. The request body is validated again here even though the
 * HTTP layer already parsed it, the same way the identification service
 * re-validates its own results — the contract, not the caller, decides.
 */
export async function verifyBill(input: {
  billNumber: string;
  repository: HospitalRecordRepository;
  request: unknown;
}): Promise<VerificationServiceResult> {
  const parsed = parseVerificationRequest(input.request);
  if (!parsed.ok) {
    return {
      kind: "error",
      error: {
        code: "invalid_request",
        message:
          "Send only a hospital name and any amounts read from the bill. Amounts cannot be submitted twice for the same field.",
      },
    };
  }

  const record = await input.repository.findByBillNumber(input.billNumber);
  if (!record) {
    return {
      kind: "result",
      result: {
        outcome: "bill_not_found",
        message: VERIFICATION_MESSAGES.bill_not_found,
        discrepancyKeys: [],
      },
    };
  }

  const candidate = computeVerification({
    record,
    hospitalName: parsed.data.hospitalName ?? null,
    financialCandidates: parsed.data.financialCandidates ?? null,
  });

  // Last gate: the published contract decides what may leave the service.
  const validated = billVerificationSchema.safeParse(candidate);
  if (!validated.success) {
    return {
      kind: "error",
      error: {
        code: "extraction_failed",
        message: "The bill could not be checked right now. Please try again later.",
      },
    };
  }

  return { kind: "result", result: validated.data };
}

/**
 * Validates the body and the duplicate-key rule together: two different
 * amounts for one field is not a reading, it is an attempt to be right by
 * accident, so the request is refused instead of picking one.
 */
function parseVerificationRequest(
  request: unknown,
): { ok: true; data: BillVerificationRequest } | { ok: false } {
  const parsed = billVerificationRequestSchema.safeParse(request);
  if (!parsed.success) return { ok: false };
  const candidates = parsed.data.financialCandidates ?? [];
  if (hasDuplicateFieldKeys(candidates)) return { ok: false };
  return { ok: true, data: parsed.data };
}
