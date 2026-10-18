import { describe, expect, it, vi } from "vitest";
import { findBill, findBillByNumber, getFinancials, saveCallbackTicket } from "./queries";

// A fake database: hermetic, like the rest of `npm test`.
function fakeDb(rows: Record<string, unknown>[]) {
  return { query: vi.fn().mockResolvedValue({ rows }) };
}

const validCallback = {
  preferredLanguage: "en",
  callbackTime: "morning",
  reason: "Need help understanding my bill",
  patientName: "Asha Rao",
  phoneNumber: "9876543210",
  consentToCallback: true,
};

describe("findBill", () => {
  it("returns the bill record when a row matches", async () => {
    const db = fakeDb([
      {
        bill_id: "b1",
        hospital_id: "h1",
        hospital_name: "CITY GENERAL HOSPITAL",
        bill_number: "INV-2026-0042",
      },
    ]);
    const bill = await findBill(db, " city general hospital ", "INV-2026-0042");
    expect(bill).toEqual({
      billId: "b1",
      hospitalId: "h1",
      hospitalName: "CITY GENERAL HOSPITAL",
      billNumber: "INV-2026-0042",
    });
    // Inputs are trimmed and passed as parameters, never glued into the SQL.
    expect(db.query.mock.calls[0][1]).toEqual([
      "city general hospital",
      "INV-2026-0042",
    ]);
  });

  it("returns null when nothing matches", async () => {
    expect(await findBill(fakeDb([]), "X", "NOPE-1")).toBeNull();
  });
});

describe("findBillByNumber", () => {
  it("finds a bill from the number alone, trimming the input", async () => {
    const db = fakeDb([
      {
        bill_id: "b1",
        hospital_id: "h1",
        hospital_name: "CITY GENERAL HOSPITAL",
        bill_number: "INV-2026-0042",
      },
    ]);
    expect(await findBillByNumber(db, " INV-2026-0042 ")).toEqual({
      billId: "b1",
      hospitalId: "h1",
      hospitalName: "CITY GENERAL HOSPITAL",
      billNumber: "INV-2026-0042",
    });
    expect(db.query.mock.calls[0][1]).toEqual(["INV-2026-0042"]);
  });

  it("returns null for a number no hospital has on file", async () => {
    expect(await findBillByNumber(fakeDb([]), "NOPE-1")).toBeNull();
  });

  it("reads no amounts — identification is not authorization", async () => {
    const db = fakeDb([]);
    await findBillByNumber(db, "INV-2026-0042");
    expect(String(db.query.mock.calls[0][0])).not.toMatch(/amount|financial|rupee/i);
  });
});

describe("getFinancials", () => {
  it("returns decimal strings and marks absent fields as missing, not zero", async () => {
    const db = fakeDb([
      {
        field_key: "billTotalAfterDiscounts",
        amount_rupees: "50000.00",
        status: "found",
        evidence: "Net payable 50000",
        page_number: 1,
        confirmed_by_user: false,
      },
      {
        field_key: "insurancePaidOrCredited",
        amount_rupees: "0.00",
        status: "found",
        evidence: "Insurance: 0",
        page_number: 2,
        confirmed_by_user: false,
      },
    ]);
    const f = await getFinancials(db, "b1");
    expect(f.billTotalAfterDiscounts.amountRupees).toBe("50000.00");
    expect(f.insurancePaidOrCredited.amountRupees).toBe("0.00"); // real zero
    expect(f.printedAmountDue.status).toBe("missing");
    expect(f.printedAmountDue.amountRupees).toBeNull(); // not "0"
  });

  it("rejects a row that breaks the contract (found without an amount)", async () => {
    const db = fakeDb([
      {
        field_key: "patientPayments",
        amount_rupees: null,
        status: "found",
        evidence: null,
        page_number: null,
        confirmed_by_user: false,
      },
    ]);
    await expect(getFinancials(db, "b1")).rejects.toThrow();
  });
});

describe("saveCallbackTicket", () => {
  it("stores a valid request and returns a 'new' ticket", async () => {
    const db = fakeDb([
      {
        ticket_id: "3f2b8c1e-5d4a-4e7b-9a1c-2d6e8f0a1b3c",
        created_at: new Date("2026-10-17T10:00:00Z"),
      },
    ]);
    const ticket = await saveCallbackTicket(db, validCallback);
    expect(ticket.ticketId).toBe("3f2b8c1e-5d4a-4e7b-9a1c-2d6e8f0a1b3c");
    expect(ticket.status).toBe("new");
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("refuses to save without consent and never touches the database", async () => {
    const db = fakeDb([]);
    await expect(
      saveCallbackTicket(db, { ...validCallback, consentToCallback: false }),
    ).rejects.toThrow();
    expect(db.query).not.toHaveBeenCalled();
  });
});