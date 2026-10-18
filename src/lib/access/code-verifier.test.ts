import { hash } from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
import { createDatabaseCodeVerifier, createDigestCodeVerifier } from "./code-verifier";
import {
  at,
  newStore,
  seedCode,
  TEST_BILL_NUMBER,
  TEST_CODE,
  TEST_NOW,
  TEST_SECRET,
} from "./__fixtures__/test-access";

const OTHER_BILL = "INV-2026-0043";
const DB_CODE = "DEMO-1234";

const BILL_ROW = {
  bill_id: "b1",
  hospital_id: "h1",
  hospital_name: "CITY GENERAL HOSPITAL",
  bill_number: TEST_BILL_NUMBER,
};

/**
 * A fake database that returns one scripted result per query, in order, and
 * repeats the last one for any further query.
 */
function scriptedDb(...responses: Record<string, unknown>[][]) {
  let call = 0;
  return {
    query: vi.fn(async (_text: string, _params?: unknown[]) => ({
      rows: responses[Math.min(call++, Math.max(responses.length - 1, 0))] ?? [],
    })),
  };
}

// Low bcrypt cost keeps the tests fast. Real codes use cost 10.
async function codeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    code_hash: await hash(DB_CODE, 4),
    expires_at: at(60 * 24),
    failed_attempts: 0,
    locked_until: null,
    redeemed_at: null,
    ...overrides,
  };
}

describe("createDigestCodeVerifier", () => {
  it("accepts the issued code and spends it, so a replay is refused", async () => {
    const store = newStore();
    await seedCode(store);
    const verifier = createDigestCodeVerifier(store, TEST_SECRET);
    const attempt = { billNumber: TEST_BILL_NUMBER, accessCode: TEST_CODE, now: TEST_NOW };

    expect(await verifier.redeemCode(attempt)).toEqual({ status: "ok" });
    expect(await verifier.redeemCode(attempt)).toEqual({ status: "invalid" });
  });

  it("refuses a code issued for a different bill", async () => {
    const store = newStore();
    await seedCode(store, { billNumber: OTHER_BILL });
    const verifier = createDigestCodeVerifier(store, TEST_SECRET);

    expect(
      await verifier.redeemCode({
        billNumber: TEST_BILL_NUMBER,
        accessCode: TEST_CODE,
        now: TEST_NOW,
      }),
    ).toEqual({ status: "invalid" });
  });

  it("matches the bill number case-insensitively, as the challenge does", async () => {
    const store = newStore();
    await seedCode(store, { billNumber: TEST_BILL_NUMBER });
    const verifier = createDigestCodeVerifier(store, TEST_SECRET);

    expect(
      await verifier.redeemCode({
        billNumber: " inv-2026-0042 ",
        accessCode: TEST_CODE,
        now: TEST_NOW,
      }),
    ).toEqual({ status: "ok" });
  });

  it("refuses an expired code", async () => {
    const store = newStore();
    await seedCode(store, { expiresAt: at(-1) });
    const verifier = createDigestCodeVerifier(store, TEST_SECRET);

    expect(
      await verifier.redeemCode({
        billNumber: TEST_BILL_NUMBER,
        accessCode: TEST_CODE,
        now: TEST_NOW,
      }),
    ).toEqual({ status: "invalid" });
  });

  it("refuses a wrong code", async () => {
    const store = newStore();
    await seedCode(store);
    const verifier = createDigestCodeVerifier(store, TEST_SECRET);

    expect(
      await verifier.redeemCode({
        billNumber: TEST_BILL_NUMBER,
        accessCode: "WRONGCODE9",
        now: TEST_NOW,
      }),
    ).toEqual({ status: "invalid" });
  });
});

describe("createDatabaseCodeVerifier", () => {
  it("accepts the right code for a bill that exists, and records the redemption", async () => {
    const db = scriptedDb([BILL_ROW], [await codeRow()], []);
    const verifier = createDatabaseCodeVerifier(db);

    expect(
      await verifier.redeemCode({
        billNumber: TEST_BILL_NUMBER,
        accessCode: DB_CODE,
        now: TEST_NOW,
      }),
    ).toEqual({ status: "ok" });

    // Bill row, code row, then the redemption update — never plain text.
    expect(db.query).toHaveBeenCalledTimes(3);
    expect(db.query.mock.calls[0][1]).toEqual([TEST_BILL_NUMBER]);
    expect(db.query.mock.calls[2][1]).toEqual(["c1", TEST_NOW]);
  });

  it("refuses an unknown bill number without reading any code", async () => {
    const db = scriptedDb([]);
    const verifier = createDatabaseCodeVerifier(db);

    expect(
      await verifier.redeemCode({
        billNumber: "NOPE-0001",
        accessCode: DB_CODE,
        now: TEST_NOW,
      }),
    ).toEqual({ status: "invalid" });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("refuses a code that has already been redeemed", async () => {
    const db = scriptedDb([BILL_ROW], [await codeRow({ redeemed_at: TEST_NOW })]);
    const verifier = createDatabaseCodeVerifier(db);

    expect(
      await verifier.redeemCode({
        billNumber: TEST_BILL_NUMBER,
        accessCode: DB_CODE,
        now: TEST_NOW,
      }),
    ).toEqual({ status: "invalid" });
    expect(db.query).toHaveBeenCalledTimes(2); // no update: nothing was spent
  });

  it("refuses a wrong code", async () => {
    const db = scriptedDb([BILL_ROW], [await codeRow()], []);
    const verifier = createDatabaseCodeVerifier(db);

    expect(
      await verifier.redeemCode({
        billNumber: TEST_BILL_NUMBER,
        accessCode: "WRONGCODE9",
        now: TEST_NOW,
      }),
    ).toEqual({ status: "invalid" });
  });

  it("refuses an expired code even when the code itself matches", async () => {
    const db = scriptedDb([BILL_ROW], [await codeRow({ expires_at: at(-1) })]);
    const verifier = createDatabaseCodeVerifier(db);

    expect(
      await verifier.redeemCode({
        billNumber: TEST_BILL_NUMBER,
        accessCode: DB_CODE,
        now: TEST_NOW,
      }),
    ).toEqual({ status: "invalid" });
  });

  it("surfaces the store's own lockout with its real remaining wait", async () => {
    const db = scriptedDb([BILL_ROW], [await codeRow({ locked_until: at(10) })]);
    const verifier = createDatabaseCodeVerifier(db);

    // Ten minutes left of the table's lock, reported as ten minutes — not the
    // in-memory window, and not a guessed number.
    expect(
      await verifier.redeemCode({
        billNumber: TEST_BILL_NUMBER,
        accessCode: DB_CODE,
        now: TEST_NOW,
      }),
    ).toEqual({ status: "locked", retryAfterSeconds: 600 });
  });
});
