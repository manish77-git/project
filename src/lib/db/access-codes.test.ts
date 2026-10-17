import { compare, hash } from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
import {
  LOCK_MINUTES,
  MAX_FAILED_ATTEMPTS,
  issueAccessCode,
  redeemAccessCode,
} from "./access-codes";

const NOW = new Date("2026-10-17T10:00:00Z");
const FUTURE = new Date("2026-10-20T10:00:00Z");
const PAST = new Date("2026-10-10T10:00:00Z");

// Low bcrypt cost keeps the tests fast. Real codes use cost 10.
async function codeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    code_hash: await hash("DEMO-1234", 4),
    expires_at: FUTURE,
    failed_attempts: 0,
    locked_until: null,
    ...overrides,
  };
}

// First call (the select) returns `rows`; later calls (updates) return nothing.
function fakeDb(rows: Record<string, unknown>[]) {
  return {
    query: vi
      .fn()
      .mockResolvedValueOnce({ rows })
      .mockResolvedValue({ rows: [] }),
  };
}

describe("redeemAccessCode", () => {
  it("accepts the right code (any case, extra spaces) and resets the counter", async () => {
    const db = fakeDb([await codeRow({ failed_attempts: 3 })]);
    const result = await redeemAccessCode(db, "b1", " demo-1234 ", { now: NOW });
    expect(result).toEqual({ status: "ok", accessCodeId: "c1" });
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query.mock.calls[1][1]).toEqual(["c1", NOW]);
  });

  it("counts a wrong code and says how many tries are left", async () => {
    const db = fakeDb([await codeRow({ failed_attempts: 1 })]);
    const result = await redeemAccessCode(db, "b1", "WRONG-0000", { now: NOW });
    expect(result).toEqual({
      status: "invalid",
      attemptsLeft: MAX_FAILED_ATTEMPTS - 2,
    });
    expect(db.query.mock.calls[1][1]).toEqual(["c1", 2, null]);
  });

  it("locks the bill on the last allowed wrong attempt", async () => {
    const db = fakeDb([
      await codeRow({ failed_attempts: MAX_FAILED_ATTEMPTS - 1 }),
    ]);
    const lockedUntil = new Date(NOW.getTime() + LOCK_MINUTES * 60_000);
    const result = await redeemAccessCode(db, "b1", "WRONG-0000", { now: NOW });
    expect(result).toEqual({
      status: "locked",
      lockedUntil: lockedUntil.toISOString(),
    });
    expect(db.query.mock.calls[1][1]).toEqual([
      "c1",
      MAX_FAILED_ATTEMPTS,
      lockedUntil,
    ]);
  });

  it("refuses even the right code while locked, without touching the counter", async () => {
    const lockedUntil = new Date("2026-10-17T10:10:00Z");
    const db = fakeDb([
      await codeRow({ failed_attempts: 5, locked_until: lockedUntil }),
    ]);
    const result = await redeemAccessCode(db, "b1", "DEMO-1234", { now: NOW });
    expect(result).toEqual({
      status: "locked",
      lockedUntil: lockedUntil.toISOString(),
    });
    expect(db.query).toHaveBeenCalledTimes(1); // only the select
  });

  it("starts counting again once an old lock has run out", async () => {
    const db = fakeDb([
      await codeRow({
        failed_attempts: 5,
        locked_until: new Date("2026-10-17T09:00:00Z"),
      }),
    ]);
    const result = await redeemAccessCode(db, "b1", "WRONG-0000", { now: NOW });
    expect(result).toEqual({
      status: "invalid",
      attemptsLeft: MAX_FAILED_ATTEMPTS - 1,
    });
    expect(db.query.mock.calls[1][1]).toEqual(["c1", 1, null]);
  });

  it("reports an expired code without counting an attempt", async () => {
    const db = fakeDb([await codeRow({ expires_at: PAST })]);
    expect(await redeemAccessCode(db, "b1", "DEMO-1234", { now: NOW })).toEqual({
      status: "expired",
    });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("reports not_found when the bill has no access code", async () => {
    const db = fakeDb([]);
    expect(await redeemAccessCode(db, "b1", "DEMO-1234", { now: NOW })).toEqual({
      status: "not_found",
    });
  });
});

describe("issueAccessCode", () => {
  it("returns a readable code, stores only its hash, and sets the expiry", async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ id: "c9" }] }) };
    const result = await issueAccessCode(db, "b1", { ttlHours: 24, now: NOW });

    expect(result.accessCodeId).toBe("c9");
    expect(result.code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(result.expiresAt).toBe(
      new Date(NOW.getTime() + 24 * 3_600_000).toISOString(),
    );

    const params = db.query.mock.calls[0][1] as unknown[];
    expect(params[0]).toBe("b1");
    expect(params[1]).not.toBe(result.code); // never the plain code
    expect(await compare(result.code, params[1] as string)).toBe(true);
  });
});