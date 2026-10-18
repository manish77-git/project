/**
 * Shared fixtures for the access tests.
 *
 * All values are synthetic. The fixed clock matters: every expiry, lockout and
 * throttle test asserts a boundary, so time is passed in explicitly rather than
 * read from the machine.
 */
import { digestAccessCode } from "../codes";
import { answerAccessChallenge, createAccessChallenge } from "../service";
import { createInMemoryAccessStore, type AccessStore } from "../store";

/** >= 32 characters so it passes the secret policy. */
export const TEST_SECRET = "unit-test-secret-abcdefghijklmnopqrstuvwxyz";

export const TEST_NOW = new Date("2026-10-16T10:00:00.000Z");
export const TEST_BILL_NUMBER = "INV-2026-0042";
export const TEST_CODE = "AB3DEFGH7K";

/** A moment `minutes` after the fixed clock. */
export function at(minutes: number, start: Date = TEST_NOW): Date {
  return new Date(start.getTime() + minutes * 60_000);
}

export function newStore(): AccessStore {
  return createInMemoryAccessStore();
}

/** Stores a code the way the issuing script does: as a digest only. */
export async function seedCode(
  store: AccessStore,
  options: {
    code?: string;
    billNumber?: string;
    expiresAt?: Date;
    secret?: string;
    consumedAt?: Date | null;
  } = {},
): Promise<void> {
  const code = options.code ?? TEST_CODE;
  const secret = options.secret ?? TEST_SECRET;
  await store.addCode({
    codeDigest: digestAccessCode(code, secret),
    billNumber: options.billNumber ?? TEST_BILL_NUMBER,
    expiresAt: options.expiresAt ?? at(60 * 24),
    consumedAt: options.consumedAt ?? null,
  });
}

/** Runs the full two-step flow and returns the grant. */
export async function grantAccess(
  store: AccessStore,
  options: {
    billNumber?: string;
    code?: string;
    now?: Date;
    secret?: string;
    clientKey?: string | null;
  } = {},
): Promise<{ accessToken: string; expiresAt: string; billNumber: string }> {
  const secret = options.secret ?? TEST_SECRET;
  const now = options.now ?? TEST_NOW;

  // Idempotent: adding the same digest twice simply overwrites it.
  await seedCode(store, {
    code: options.code ?? TEST_CODE,
    billNumber: options.billNumber ?? TEST_BILL_NUMBER,
    secret,
  });

  const created = await createAccessChallenge({
    billNumber: options.billNumber ?? TEST_BILL_NUMBER,
    store,
    now,
    clientKey: options.clientKey ?? null,
  });
  if (created.kind !== "challenge") throw new Error("expected a challenge");

  const answered = await answerAccessChallenge({
    challengeId: created.challenge.challengeId,
    accessCode: options.code ?? TEST_CODE,
    store,
    secret,
    now,
    clientKey: options.clientKey ?? null,
  });
  if (answered.kind !== "granted") {
    throw new Error(`expected a grant, got ${answered.reason}`);
  }
  return answered.grant;
}

/** A store already holding the test code, for one-step tests. */
export async function storeWithCode(
  options: { billNumber?: string; code?: string; expiresAt?: Date } = {},
): Promise<AccessStore> {
  const store = newStore();
  await seedCode(store, options);
  return store;
}
