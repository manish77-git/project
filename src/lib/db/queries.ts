import {
  callbackRequestSchema,
  createCallbackTicket,
  financialFieldsSchema,
  type CallbackRequest,
  type CallbackTicket,
  type FinancialFields,
} from "../schemas";
import type { Queryable } from "./client";

// The five tracked fields from docs/API_CONTRACT.md.
const FIELD_KEYS = [
  "billTotalAfterDiscounts",
  "insuranceApprovedButNotPaid",
  "insurancePaidOrCredited",
  "patientPayments",
  "printedAmountDue",
] as const;

export interface BillRecord {
  billId: string;
  hospitalId: string;
  hospitalName: string;
  billNumber: string;
}

/**
 * Look up a hospital-side bill record. Returns null when there is no match.
 * Hospital name is compared case-insensitively; the bill number must match
 * exactly. This reads NO amounts (identification is not authorization).
 */
export async function findBill(
  db: Queryable,
  hospitalName: string,
  billNumber: string,
): Promise<BillRecord | null> {
  const { rows } = await db.query(
    `select b.id as bill_id, h.id as hospital_id,
            h.name as hospital_name, b.bill_number
       from bills b
       join hospitals h on h.id = b.hospital_id
      where lower(h.name) = lower($1) and b.bill_number = $2
      limit 1`,
    [hospitalName.trim(), billNumber.trim()],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    billId: String(row.bill_id),
    hospitalId: String(row.hospital_id),
    hospitalName: String(row.hospital_name),
    billNumber: String(row.bill_number),
  };
}

/**
 * Read the five financial fields for a bill. Money comes back as decimal
 * strings (never floats). A field with no row is reported as "missing" with a
 * null amount, never as "0". The result is validated with the shared schema.
 * Callers must have checked authorization (access code) BEFORE calling this.
 */
export async function getFinancials(
  db: Queryable,
  billId: string,
): Promise<FinancialFields> {
  const { rows } = await db.query(
    `select field_key::text as field_key,
            amount_rupees::text as amount_rupees,
            status, evidence, page_number, confirmed_by_user
       from bill_financials
      where bill_id = $1`,
    [billId],
  );

  const byKey = new Map(rows.map((r) => [String(r.field_key), r]));
  const fields: Record<string, unknown> = {};

  for (const key of FIELD_KEYS) {
    const row = byKey.get(key);
    fields[key] = row
      ? {
          amountRupees:
            row.amount_rupees === null || row.amount_rupees === undefined
              ? null
              : String(row.amount_rupees),
          status: row.status,
          evidence: row.evidence ?? null,
          pageNumber: row.page_number ?? null,
          confirmedByUser: row.confirmed_by_user === true,
        }
      : {
          amountRupees: null,
          status: "missing",
          evidence: null,
          pageNumber: null,
          confirmedByUser: false,
        };
  }

  // Throws if any row breaks the contract (e.g. "found" with no amount).
  return financialFieldsSchema.parse(fields);
}

/**
 * Validate a callback request (consent must be literally true) and store it.
 * Invalid input throws BEFORE anything is written to the database.
 */
export async function saveCallbackTicket(
  db: Queryable,
  input: unknown,
  billId: string | null = null,
): Promise<CallbackTicket> {
  const request: CallbackRequest = callbackRequestSchema.parse(input);

  const { rows } = await db.query(
    `insert into callback_tickets
       (bill_id, preferred_language, callback_time, reason,
        patient_name, phone_number, consent_to_callback)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning ticket_id, created_at`,
    [
      billId,
      request.preferredLanguage,
      request.callbackTime,
      request.reason,
      request.patientName,
      request.phoneNumber,
      request.consentToCallback,
    ],
  );

  const row = rows[0];
  if (!row) throw new Error("Callback ticket was not saved.");

  const createdAt =
    row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at);

  return createCallbackTicket({
    ticketId: String(row.ticket_id),
    createdAt,
    request,
  });
}