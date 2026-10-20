/**
 * Regression tests for the in-memory store's housekeeping.
 *
 * The store used to grow forever: every challenge, session and failure counter
 * was inserted and never removed. Anyone able to POST to the challenge endpoint
 * could therefore add entries for as long as the process lived, whether or not
 * the bill existed. These tests pin the cleanup that keeps memory bounded by
 * the policy TTLs instead of by uptime.
 */
import { describe, expect, it } from "vitest";
import { ACCESS_TOKEN_TTL_MINUTES } from "./token";
import { at, newStore, TEST_BILL_NUMBER } from "./__fixtures__/test-access";
import { CHALLENGE_TTL_MINUTES, THROTTLE_WINDOW_MINUTES } from "./policy";
import type { ChallengeRecord } from "./store";

function challenge(id: string, createdAt: Date): ChallengeRecord {
  return {
    challengeId: id,
    billNumber: TEST_BILL_NUMBER,
    createdAt,
    expiresAt: new Date(createdAt.getTime() + CHALLENGE_TTL_MINUTES * 60_000),
    status: "pending",
    failedAttempts: 0,
    completedAt: null,
  };
}

describe("in-memory store housekeeping", () => {
  it("drops an expired challenge when a later one is created", async () => {
    const store = newStore();
    const now = at(0);

    await store.addChallenge(challenge("old-challenge-id", now));
    await store.addChallenge(challenge("new-challenge-id", at(CHALLENGE_TTL_MINUTES + 5)));

    expect(await store.findChallenge("old-challenge-id")).toBeNull();
    expect(await store.findChallenge("new-challenge-id")).not.toBeNull();
  });

  it("keeps a challenge that is still live", async () => {
    const store = newStore();
    await store.addChallenge(challenge("live-challenge-id", at(0)));

    // Still inside the five-minute window, so nothing is dead yet.
    await store.addChallenge(challenge("second-challenge-id", at(CHALLENGE_TTL_MINUTES - 1)));

    expect(await store.findChallenge("live-challenge-id")).not.toBeNull();
    expect(await store.findChallenge("second-challenge-id")).not.toBeNull();
  });

  it("drops an expired session when a later one is added", async () => {
    const store = newStore();
    const now = at(0);

    await store.addSession({
      sessionId: "old-session",
      billNumber: TEST_BILL_NUMBER,
      createdAt: now,
      expiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MINUTES * 60_000),
      outcome: null,
      outcomeAt: null,
    });

    const later = at(ACCESS_TOKEN_TTL_MINUTES + 1);
    await store.addSession({
      sessionId: "new-session",
      billNumber: TEST_BILL_NUMBER,
      createdAt: later,
      expiresAt: new Date(later.getTime() + ACCESS_TOKEN_TTL_MINUTES * 60_000),
      outcome: null,
      outcomeAt: null,
    });

    expect(await store.findSession("old-session")).toBeNull();
    expect(await store.findSession("new-session")).not.toBeNull();
  });

  it("drops a failure counter once the throttle window has passed", async () => {
    const store = newStore();
    await store.recordAttemptFailure(`bill:${TEST_BILL_NUMBER}`, at(0));

    // A later challenge triggers the sweep; the counter is past its window.
    await store.addChallenge(challenge("challenge-id", at(THROTTLE_WINDOW_MINUTES + 5)));

    expect(await store.findAttempts(`bill:${TEST_BILL_NUMBER}`)).toBeNull();
  });

  it("leaves codes alone, so a live code survives housekeeping", async () => {
    const store = newStore();
    await store.addCode({
      codeDigest: "a".repeat(64),
      billNumber: TEST_BILL_NUMBER,
      expiresAt: at(60 * 24),
      consumedAt: null,
    });

    await store.addChallenge(challenge("old", at(0)));
    await store.addChallenge(challenge("new", at(CHALLENGE_TTL_MINUTES + 5)));

    expect(await store.findCodeByDigest("a".repeat(64))).not.toBeNull();
  });
});
