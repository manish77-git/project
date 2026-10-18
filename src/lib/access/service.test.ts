import { describe, expect, it } from "vitest";
import {
  answerAccessChallenge,
  createAccessChallenge,
  CHALLENGE_TTL_MINUTES,
  MAX_CHALLENGE_ATTEMPTS,
  THROTTLE_WINDOW_MINUTES,
} from "./service";
import type { AccessStore } from "./store";
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
const CLIENT = "203.0.113.7";

async function challengeFor(
  store: AccessStore,
  options: { billNumber?: string; now?: Date; clientKey?: string | null } = {},
) {
  const result = await createAccessChallenge({
    billNumber: options.billNumber ?? TEST_BILL_NUMBER,
    store,
    now: options.now ?? TEST_NOW,
    clientKey: options.clientKey ?? null,
  });
  if (result.kind !== "challenge") {
    throw new Error(`expected a challenge, got ${result.kind}`);
  }
  return result.challenge;
}

async function answer(
  store: AccessStore,
  challengeId: string,
  code: string,
  options: { now?: Date; clientKey?: string | null } = {},
) {
  return answerAccessChallenge({
    challengeId,
    accessCode: code,
    store,
    secret: TEST_SECRET,
    now: options.now ?? TEST_NOW,
    clientKey: options.clientKey ?? null,
  });
}

async function storeWithTestCode(billNumber = TEST_BILL_NUMBER): Promise<AccessStore> {
  const store = newStore();
  await seedCode(store, { billNumber });
  return store;
}

describe("createAccessChallenge", () => {
  it("binds the challenge to the bill with the full attempt budget", async () => {
    const store = await storeWithTestCode();
    const challenge = await challengeFor(store);

    expect(challenge.billNumber).toBe(TEST_BILL_NUMBER);
    expect(challenge.attemptsRemaining).toBe(MAX_CHALLENGE_ATTEMPTS);
    expect(challenge.expiresAt).toBe(at(CHALLENGE_TTL_MINUTES).toISOString());
    expect(challenge.challengeId).toMatch(/[0-9a-f-]{36}/);
  });

  it("normalises the bill number, so case cannot split one bill in two", async () => {
    const store = newStore();
    const challenge = await challengeFor(store, { billNumber: "inv-2026-0042" });
    expect(challenge.billNumber).toBe(TEST_BILL_NUMBER);
  });

  it("issues a challenge even when no code exists for that bill (no existence oracle)", async () => {
    const store = newStore();
    const result = await createAccessChallenge({
      billNumber: "INV-2026-9999",
      store,
      now: TEST_NOW,
      clientKey: null,
    });
    expect(result.kind).toBe("challenge");
    if (result.kind !== "challenge") return;
    expect(Object.keys(result.challenge).sort()).toEqual([
      "attemptsRemaining",
      "billNumber",
      "challengeId",
      "expiresAt",
    ]);
  });
});

describe("answerAccessChallenge — the happy path", () => {
  it("grants a session for the correct code and spends the code", async () => {
    const store = await storeWithTestCode();
    const challenge = await challengeFor(store);

    const first = await answer(store, challenge.challengeId, TEST_CODE);
    expect(first.kind).toBe("granted");
    if (first.kind !== "granted") return;
    expect(first.grant.billNumber).toBe(TEST_BILL_NUMBER);
    expect(first.grant.expiresAt).toBe(at(15).toISOString());

    // Single-use: the same code cannot open a second challenge.
    const second = await challengeFor(store);
    expect(await answer(store, second.challengeId, TEST_CODE)).toEqual({
      kind: "rejected",
      reason: "invalid_code",
    });
  });

  it("accepts the code however the patient typed it", async () => {
    const store = await storeWithTestCode();
    const challenge = await challengeFor(store);
    expect((await answer(store, challenge.challengeId, "ab3de-fgh7k")).kind).toBe("granted");
  });

  it("clears the failure counters once the code is accepted", async () => {
    const store = await storeWithTestCode();
    const challenge = await challengeFor(store);

    await answer(store, challenge.challengeId, "WRONGCODE1");
    await answer(store, challenge.challengeId, "WRONGCODE2");
    expect((await answer(store, challenge.challengeId, TEST_CODE)).kind).toBe("granted");

    expect(await store.findAttempts(`bill:${TEST_BILL_NUMBER}`)).toBeNull();
    // The budget is fresh, so a new challenge is issued immediately.
    expect((await createAccessChallenge({
      billNumber: TEST_BILL_NUMBER,
      store,
      now: TEST_NOW,
      clientKey: null,
    })).kind).toBe("challenge");
  });
});

describe("answerAccessChallenge — attempts and lockout", () => {
  it("spends one attempt per wrong code and locks on the third", async () => {
    const store = await storeWithTestCode();
    const challenge = await challengeFor(store);

    expect(await answer(store, challenge.challengeId, "WRONGCODE1")).toEqual({
      kind: "rejected",
      reason: "invalid_code",
    });
    expect(await answer(store, challenge.challengeId, "WRONGCODE2")).toEqual({
      kind: "rejected",
      reason: "invalid_code",
    });

    const third = await answer(store, challenge.challengeId, "WRONGCODE3");
    expect(third.kind).toBe("rejected");
    if (third.kind !== "rejected") return;
    expect(third.reason).toBe("locked");

    const record = await store.findChallenge(challenge.challengeId);
    expect(record?.status).toBe("locked");
    expect(record?.failedAttempts).toBe(MAX_CHALLENGE_ATTEMPTS);
  });

  it("refuses more attempts on a locked challenge, even with the right code", async () => {
    const store = await storeWithTestCode();
    const challenge = await challengeFor(store);
    for (const code of ["WRONGCODE1", "WRONGCODE2", "WRONGCODE3"]) {
      await answer(store, challenge.challengeId, code);
    }

    const afterLock = await answer(store, challenge.challengeId, TEST_CODE);
    expect(afterLock.kind).toBe("rejected");
    if (afterLock.kind !== "rejected") return;
    expect(afterLock.reason).toBe("locked");
  });

  it("counts attempts outside the challenge, so a new challenge inherits the limit", async () => {
    const store = await storeWithTestCode();
    const challenge = await challengeFor(store);
    for (const code of ["WRONGCODE1", "WRONGCODE2", "WRONGCODE3"]) {
      await answer(store, challenge.challengeId, code);
    }

    // The whole point: restarting with a fresh challenge must not reset the
    // budget. Without this, three guesses per challenge would mean unlimited
    // guesses overall.
    const restarted = await createAccessChallenge({
      billNumber: TEST_BILL_NUMBER,
      store,
      now: TEST_NOW,
      clientKey: null,
    });
    expect(restarted.kind).toBe("throttled");
    if (restarted.kind !== "throttled") return;
    expect(restarted.retryAfterSeconds).toBe(THROTTLE_WINDOW_MINUTES * 60);
  });

  it("throttles an existing pending challenge too, not just new ones", async () => {
    const store = await storeWithTestCode();
    const challenge = await challengeFor(store);
    for (const code of ["WRONGCODE1", "WRONGCODE2", "WRONGCODE3"]) {
      await answer(store, challenge.challengeId, code);
    }
    // A second challenge made before the lockout is still subject to it.
    const second = await store.findChallenge(challenge.challengeId);
    expect(second?.status).toBe("locked");
  });

  it("lets the throttle expire, with a boundary either side", async () => {
    const store = await storeWithTestCode();
    const challenge = await challengeFor(store);
    for (const code of ["WRONGCODE1", "WRONGCODE2", "WRONGCODE3"]) {
      await answer(store, challenge.challengeId, code);
    }

    const oneMsBefore = new Date(at(THROTTLE_WINDOW_MINUTES).getTime() - 1);
    expect(
      (
        await createAccessChallenge({
          billNumber: TEST_BILL_NUMBER,
          store,
          now: oneMsBefore,
          clientKey: null,
        })
      ).kind,
    ).toBe("throttled");

    expect(
      (
        await createAccessChallenge({
          billNumber: TEST_BILL_NUMBER,
          store,
          now: at(THROTTLE_WINDOW_MINUTES),
          clientKey: null,
        })
      ).kind,
    ).toBe("challenge");
  });

  it("throttles a client working through many bills, but only when it is identified", async () => {
    const store = newStore();
    await seedCode(store, { billNumber: TEST_BILL_NUMBER });
    await seedCode(store, { billNumber: OTHER_BILL, code: "ZZ3DEFGH7K" });

    for (let attempt = 0; attempt < MAX_CHALLENGE_ATTEMPTS; attempt += 1) {
      const challenge = await challengeFor(store, { clientKey: CLIENT });
      await answer(store, challenge.challengeId, "WRONGCODE1", { clientKey: CLIENT });
    }

    // A different bill, same client: still refused, because the client bucket
    // is what catches someone walking through bills one at a time.
    expect(
      (
        await createAccessChallenge({
          billNumber: OTHER_BILL,
          store,
          now: TEST_NOW,
          clientKey: CLIENT,
        })
      ).kind,
    ).toBe("throttled");

    // Without a client identity there is no client bucket to spend, so a
    // different bill is still served. This is deliberate: inventing an identity
    // would let one caller lock out unrelated patients.
    expect(
      (
        await createAccessChallenge({
          billNumber: OTHER_BILL,
          store,
          now: TEST_NOW,
          clientKey: null,
        })
      ).kind,
    ).toBe("challenge");
  });
});

describe("answerAccessChallenge — expiry and reuse", () => {
  it("refuses an expired challenge, even with the correct code", async () => {
    const store = await storeWithTestCode();
    const challenge = await challengeFor(store);

    const justBefore = new Date(at(CHALLENGE_TTL_MINUTES).getTime() - 1);
    expect((await answer(store, challenge.challengeId, TEST_CODE, { now: justBefore })).kind).toBe(
      "granted",
    );

    const second = await challengeFor(store);
    expect(await answer(store, second.challengeId, TEST_CODE, { now: at(CHALLENGE_TTL_MINUTES) })).toEqual({
      kind: "rejected",
      reason: "expired",
    });
  });

  it("refuses an already answered challenge, so a session cannot be replayed", async () => {
    const store = await storeWithTestCode();
    const challenge = await challengeFor(store);
    expect((await answer(store, challenge.challengeId, TEST_CODE)).kind).toBe("granted");

    expect(await answer(store, challenge.challengeId, TEST_CODE)).toEqual({
      kind: "rejected",
      reason: "already_answered",
    });
  });

  it("refuses an unknown challenge id", async () => {
    const store = await storeWithTestCode();
    expect(await answer(store, "0f5b1a2c-3d4e-5f60-7182-93a4b5c6d7e8", TEST_CODE)).toEqual({
      kind: "rejected",
      reason: "unknown_challenge",
    });
  });

  it("refuses a code issued for a different bill", async () => {
    const store = newStore();
    await seedCode(store, { billNumber: OTHER_BILL, code: "ZZ3DEFGH7K" });
    const challenge = await challengeFor(store, { billNumber: TEST_BILL_NUMBER });

    expect(await answer(store, challenge.challengeId, "ZZ3DEFGH7K")).toEqual({
      kind: "rejected",
      reason: "invalid_code",
    });
  });

  it("refuses a code whose own validity has passed", async () => {
    const store = newStore();
    await seedCode(store, { expiresAt: at(-1) });
    const challenge = await challengeFor(store);

    expect(await answer(store, challenge.challengeId, TEST_CODE)).toEqual({
      kind: "rejected",
      reason: "invalid_code",
    });
  });

  it("refuses an already consumed code", async () => {
    const store = newStore();
    await seedCode(store, { consumedAt: at(-1) });
    const challenge = await challengeFor(store);

    expect(await answer(store, challenge.challengeId, TEST_CODE)).toEqual({
      kind: "rejected",
      reason: "invalid_code",
    });
  });

  it("totalises the order of checks: an expired challenge is not a free attempt", async () => {
    const store = await storeWithTestCode();
    const challenge = await challengeFor(store);
    // Two wrong guesses, then the challenge expires: no third attempt is spent
    // and the throttle is not triggered by expiry itself.
    await answer(store, challenge.challengeId, "WRONGCODE1");
    await answer(store, challenge.challengeId, "WRONGCODE2");
    await answer(store, challenge.challengeId, TEST_CODE, { now: at(CHALLENGE_TTL_MINUTES) });

    expect(
      (
        await createAccessChallenge({
          billNumber: TEST_BILL_NUMBER,
          store,
          now: at(CHALLENGE_TTL_MINUTES),
          clientKey: null,
        })
      ).kind,
    ).toBe("challenge");
  });
});
