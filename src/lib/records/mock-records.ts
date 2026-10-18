/**
 * Mock hospital records — the authoritative side of verification.
 *
 * Verification asks "does the hospital's record match this bill?", which needs
 * something to check against. Until a real hospital integration exists, that is
 * this synthetic repository: invented hospitals, invented bill numbers,
 * invented amounts. No real patient, document or hospital is represented.
 *
 * It sits behind a repository interface for two reasons: the verification
 * service can be tested against arbitrary records (including the awkward cases)
 * without touching the fixtures, and swapping in a real hospital system later
 * means writing one adapter, not changing any policy.
 *
 * Note on the two sets of amounts. A real verification compares amounts *read
 * off the patient's bill* against amounts *in the hospital's system*. The mock
 * keeps both: `printedAmounts` stands in for what the OCR pipeline found on the
 * bill, and `recordAmounts` is the hospital's authority. When a caller supplies
 * its own candidates (from its own OCR run), those replace `printedAmounts` for
 * that comparison — and the comparison itself always happens here, never from a
 * value the caller claims matched.
 */
import type { FinancialFieldKey } from "@/lib/schemas";

/** Amounts for some or all of the five tracked fields. */
export type FieldAmounts = Partial<Record<FinancialFieldKey, string | null>>;

export interface HospitalRecord {
  /** Server-side hospital id. Never accepted from a client. */
  hospitalId: string;
  hospitalName: string;
  billNumber: string;
  /** False for a hospital that issues bills but is not registered with us. */
  registered: boolean;
  /** What the bill in the patient's hand says (stand-in for OCR output). */
  printedAmounts: FieldAmounts;
  /** What the hospital's own system says. This is the authority. */
  recordAmounts: FieldAmounts;
}

export interface HospitalRecordRepository {
  /** Looks up by bill number; null means no such bill is on file. */
  findByBillNumber(billNumber: string): Promise<HospitalRecord | null>;
  /** Every record, for diagnostics and tests. Never returned to a client. */
  listAll(): Promise<readonly HospitalRecord[]>;
}

/** Bill numbers are compared case- and whitespace-insensitively. */
export function normalizeBillNumberForLookup(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toUpperCase();
}

const CITY_GENERAL = "CITY GENERAL HOSPITAL";
const SUNRISE = "SUNRISE MULTISPECIALITY HOSPITAL";

/**
 * The synthetic fixture set, covering the four cases verification must handle:
 *
 *   1. INV-2026-0042 — a valid bill: the bill and the record agree.
 *   2. INV-2026-0043 — an amount discrepancy: three fields disagree.
 *   3. SUN-2026-7781 — an unregistered hospital.
 *   4. anything else — no record at all, e.g. INV-2026-9999.
 *
 * All values are invented. Amounts still obey the shared money contract
 * (decimal strings, no leading zeros, "0" means a real zero).
 */
export const MOCK_HOSPITAL_RECORDS: readonly HospitalRecord[] = [
  {
    hospitalId: "HOSP-001",
    hospitalName: CITY_GENERAL,
    billNumber: "INV-2026-0042",
    registered: true,
    printedAmounts: {
      billTotalAfterDiscounts: "15000",
      insuranceApprovedButNotPaid: "5000",
      insurancePaidOrCredited: "0",
      patientPayments: "10000",
      printedAmountDue: "10000",
    },
    recordAmounts: {
      billTotalAfterDiscounts: "15000",
      insuranceApprovedButNotPaid: "5000",
      insurancePaidOrCredited: "0",
      patientPayments: "10000",
      printedAmountDue: "10000",
    },
  },
  {
    hospitalId: "HOSP-001",
    hospitalName: CITY_GENERAL,
    billNumber: "INV-2026-0043",
    registered: true,
    // The bill the patient holds: insurance approved 5000, so 10000 is due.
    printedAmounts: {
      billTotalAfterDiscounts: "15000",
      insuranceApprovedButNotPaid: "5000",
      insurancePaidOrCredited: "0",
      patientPayments: "10000",
      printedAmountDue: "10000",
    },
    // The hospital's system: insurance approved 8000, so only 7000 was due.
    recordAmounts: {
      billTotalAfterDiscounts: "15000",
      insuranceApprovedButNotPaid: "8000",
      insurancePaidOrCredited: "0",
      patientPayments: "7000",
      printedAmountDue: "7000",
    },
  },
  {
    hospitalId: "HOSP-002",
    hospitalName: SUNRISE,
    billNumber: "SUN-2026-7781",
    registered: false,
    printedAmounts: {
      billTotalAfterDiscounts: "22000",
      insuranceApprovedButNotPaid: "0",
      insurancePaidOrCredited: "0",
      patientPayments: "22000",
      printedAmountDue: "0",
    },
    recordAmounts: {
      billTotalAfterDiscounts: "22000",
      insuranceApprovedButNotPaid: "0",
      insurancePaidOrCredited: "0",
      patientPayments: "22000",
      printedAmountDue: "0",
    },
  },
];

export function createMockHospitalRecordRepository(
  records: readonly HospitalRecord[] = MOCK_HOSPITAL_RECORDS,
): HospitalRecordRepository {
  const byBillNumber = new Map<string, HospitalRecord>();
  for (const record of records) {
    byBillNumber.set(normalizeBillNumberForLookup(record.billNumber), record);
  }

  return {
    async findByBillNumber(billNumber: string): Promise<HospitalRecord | null> {
      return byBillNumber.get(normalizeBillNumberForLookup(billNumber)) ?? null;
    },
    async listAll(): Promise<readonly HospitalRecord[]> {
      return records;
    },
  };
}

/** The repository used by the running app: synthetic records, in memory. */
export function getDefaultHospitalRecordRepository(): HospitalRecordRepository {
  return createMockHospitalRecordRepository();
}
