import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { redeemAccessCode } from "./access-codes";
import type { Queryable } from "./client";
import { findBill, getFinancials, saveCallbackTicket } from "./queries";

// Runs ONLY when DATABASE_URL is set (use `npm run test:db`). Plain `npm test`
// skips this file, so the normal suite stays hermetic (no database needed).
// It expects a database built from db/migrations/001_init.sql + db/seed.sql.
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("real PostgreSQL (seeded by db/seed.sql)", () => {
  let pool: Pool;
  let db: Queryable;

  beforeAll(() => {
    pool = new Pool({ connectionString: url });
    db = { query: (text, params) => pool.query(text, params) };
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seededBill(hospital: string, billNumber: string) {
    const bill = await findBill(db, hospital, billNumber);
    if (!bill) throw new Error("Seed data missing: run db/seed.sql first.");
    return bill;
  }

  it("finds a seeded bill (name match is case-insensitive)", async () => {
    const bill = await findBill(db, "city general hospital", "INV-2026-0042");
    expect(bill?.billNumber).toBe("INV-2026-0042");
  });

  it("returns null for a bill that does not exist", async () => {
    expect(await findBill(db, "City General Hospital", "NOPE-999")).toBeNull();
  });

  it("reads the five seeded amounts as exact decimal strings", async () => {
    const bill = await seededBill("City General Hospital", "INV-2026-0042");
    const f = await getFinancials(db, bill.billId);
    expect(f.billTotalAfterDiscounts.amountRupees).toBe("50000.00");
    expect(f.printedAmountDue.amountRupees).toBe("30000.00");
  });

  it("keeps 'missing' separate from a real zero on the second seeded bill", async () => {
    const bill = await seededBill("Sunrise Medical Centre", "SMC/2026/118");
    const f = await getFinancials(db, bill.billId);
    expect(f.insuranceApprovedButNotPaid.status).toBe("missing");
    expect(f.insuranceApprovedButNotPaid.amountRupees).toBeNull();
    expect(f.insurancePaidOrCredited.amountRupees).toBe("0.00");
  });

  it("rejects a wrong access code, then accepts the demo code", async () => {
    const bill = await seededBill("City General Hospital", "INV-2026-0042");
    const wrong = await redeemAccessCode(db, bill.billId, "WRONG-0000");
    expect(wrong.status).toBe("invalid");
    const ok = await redeemAccessCode(db, bill.billId, "DEMO-1234");
    expect(ok.status).toBe("ok"); // a correct code also resets the counter
  });

  it("saves a callback ticket, then removes it", async () => {
    const ticket = await saveCallbackTicket(db, {
      preferredLanguage: "en",
      callbackTime: "morning",
      reason: "Integration test request",
      patientName: "Test Person",
      phoneNumber: "9876543210",
      consentToCallback: true,
    });
    expect(ticket.status).toBe("new");
    await db.query("delete from callback_tickets where ticket_id = $1", [
      ticket.ticketId,
    ]);
  });

  it("the database itself refuses a callback without consent", async () => {
    await expect(
      db.query(
        `insert into callback_tickets
           (preferred_language, callback_time, reason,
            patient_name, phone_number, consent_to_callback)
         values ('en', 'morning', 'no consent test',
                 'Test Person', '9876543210', false)`,
      ),
    ).rejects.toThrow();
  });
});