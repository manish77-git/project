import { describe, expect, it } from "vitest";
import {
  ACCESS_DENIED_MESSAGE,
  ACCESS_LOCKED_MESSAGE,
  ACCESS_UNAVAILABLE_MESSAGE,
  handleChallengeRequest,
  handleChallengeVerificationRequest,
} from "./handler";
import { createInMemoryAccessStore, type AccessStore } from "./store";
import {
  at,
  seedCode,
  TEST_BILL_NUMBER,
  TEST_CODE,
  TEST_NOW,
  TEST_SECRET,
} from "./__fixtures__/test-access";

const CHALLENGE_URL = "http://localhost:3000/api/bills/access/challenge";
const VERIFY_URL = "http://localhost:3000/api/bills/access/verify";

function jsonRequest(url: string, body: unknown, contentType = "application/json"): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function storeWithCode(): Promise<AccessStore> {
  const store = createInMemoryAccessStore();
  await seedCode(store);
  return store;
}

async function challengeIdFor(store: AccessStore, now = TEST_NOW): Promise<string> {
  const response = await handleChallengeRequest(
    jsonRequest(CHALLENGE_URL, { billNumber: TEST_BILL_NUMBER }),
    { store, secret: TEST_SECRET, now: () => now },
  );
  const body = (await response.json()) as { challengeId: string };
  return body.challengeId;
}

describe("POST /api/bills/access/challenge", () => {
  it("issues a challenge with no-store and the documented shape", async () => {
    const store = createInMemoryAccessStore();
    const response = await handleChallengeRequest(
      jsonRequest(CHALLENGE_URL, { billNumber: "inv-2026-0042" }),
      { store, secret: TEST_SECRET, now: () => TEST_NOW },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      challengeId: expect.any(String),
      billNumber: TEST_BILL_NUMBER,
      expiresAt: at(5).toISOString(),
      attemptsRemaining: 3,
    });
  });

  it("accepts a bill it knows nothing about, and answers identically", async () => {
    const store = createInMemoryAccessStore();
    const known = await handleChallengeRequest(
      jsonRequest(CHALLENGE_URL, { billNumber: TEST_BILL_NUMBER }),
      { store, secret: TEST_SECRET, now: () => TEST_NOW },
    );
    const unknown = await handleChallengeRequest(
      jsonRequest(CHALLENGE_URL, { billNumber: "INV-2026-9999" }),
      { store, secret: TEST_SECRET, now: () => TEST_NOW },
    );

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(Object.keys(await unknown.json()).sort()).toEqual(
      Object.keys(await known.json()).sort(),
    );
  });

  it("rejects a browser-supplied flag with 400", async () => {
    const store = createInMemoryAccessStore();
    const response = await handleChallengeRequest(
      jsonRequest(CHALLENGE_URL, { billNumber: TEST_BILL_NUMBER, isVerified: true }),
      { store, secret: TEST_SECRET, now: () => TEST_NOW },
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_request");
  });

  it("rejects malformed JSON, a missing bill number and a wrong content type", async () => {
    const store = createInMemoryAccessStore();
    const dependencies = { store, secret: TEST_SECRET, now: () => TEST_NOW };

    expect((await handleChallengeRequest(jsonRequest(CHALLENGE_URL, "{not json"), dependencies)).status).toBe(400);
    expect((await handleChallengeRequest(jsonRequest(CHALLENGE_URL, {}), dependencies)).status).toBe(400);
    expect(
      (await handleChallengeRequest(jsonRequest(CHALLENGE_URL, { billNumber: "INV-2026-0042" }, "text/plain"), dependencies)).status,
    ).toBe(415);
  });

  it("fails closed with 503 when no secret is configured", async () => {
    const response = await handleChallengeRequest(
      jsonRequest(CHALLENGE_URL, { billNumber: TEST_BILL_NUMBER }),
      { store: createInMemoryAccessStore(), secret: null, now: () => TEST_NOW },
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: "access_unavailable", message: ACCESS_UNAVAILABLE_MESSAGE },
    });
  });

  it("throttles with 429 and a Retry-After header once the budget is spent", async () => {
    const store = await storeWithCode();
    const challengeId = await challengeIdFor(store);

    for (const code of ["WRONGCODE1", "WRONGCODE2", "WRONGCODE3"]) {
      await handleChallengeVerificationRequest(jsonRequest(VERIFY_URL, { challengeId, accessCode: code }), {
        store,
        secret: TEST_SECRET,
        now: () => TEST_NOW,
      });
    }

    const response = await handleChallengeRequest(
      jsonRequest(CHALLENGE_URL, { billNumber: TEST_BILL_NUMBER }),
      { store, secret: TEST_SECRET, now: () => TEST_NOW },
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("900");
    expect(await response.json()).toEqual({
      error: { code: "too_many_attempts", message: ACCESS_LOCKED_MESSAGE },
    });
  });
});

describe("POST /api/bills/access/verify", () => {
  it("returns a grant for the correct code, and never the code itself", async () => {
    const store = await storeWithCode();
    const challengeId = await challengeIdFor(store);

    const response = await handleChallengeVerificationRequest(
      jsonRequest(VERIFY_URL, { challengeId, accessCode: "ab3de-fgh7k" }),
      { store, secret: TEST_SECRET, now: () => TEST_NOW },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["accessToken", "billNumber", "expiresAt"]);
    expect(body.billNumber).toBe(TEST_BILL_NUMBER);
    expect(JSON.stringify(body)).not.toContain("AB3DE");
    expect(JSON.stringify(body)).not.toContain("ab3de");
  });

  it("answers a wrong code, an expired challenge and an unknown challenge identically", async () => {
    // Uniform refusals are the whole point: a caller must not be able to tell
    // "this code is wrong" from "this bill has no code" from "that challenge
    // never existed".
    const store = await storeWithCode();
    const wrongCodeId = await challengeIdFor(store);
    const expiringId = await challengeIdFor(store);

    const wrongCode = await handleChallengeVerificationRequest(
      jsonRequest(VERIFY_URL, { challengeId: wrongCodeId, accessCode: "WRONGCODE1" }),
      { store, secret: TEST_SECRET, now: () => TEST_NOW },
    );
    const expired = await handleChallengeVerificationRequest(
      jsonRequest(VERIFY_URL, { challengeId: expiringId, accessCode: TEST_CODE }),
      { store, secret: TEST_SECRET, now: () => at(5) },
    );
    const unknown = await handleChallengeVerificationRequest(
      jsonRequest(VERIFY_URL, { challengeId: "0f5b1a2c-3d4e-5f60-7182-93a4b5c6d7e8", accessCode: TEST_CODE }),
      { store, secret: TEST_SECRET, now: () => TEST_NOW },
    );

    expect(wrongCode.status).toBe(401);
    expect(expired.status).toBe(401);
    expect(unknown.status).toBe(401);

    const expected = { error: { code: "access_denied", message: ACCESS_DENIED_MESSAGE } };
    expect(await wrongCode.json()).toEqual(expected);
    expect(await expired.json()).toEqual(expected);
    expect(await unknown.json()).toEqual(expected);
  });

  it("locks out with 429 once three attempts are spent", async () => {
    const store = await storeWithCode();
    const challengeId = await challengeIdFor(store);

    const statuses: number[] = [];
    for (const code of ["WRONGCODE1", "WRONGCODE2", "WRONGCODE3", "WRONGCODE4"]) {
      const response = await handleChallengeVerificationRequest(
        jsonRequest(VERIFY_URL, { challengeId, accessCode: code }),
        { store, secret: TEST_SECRET, now: () => TEST_NOW },
      );
      statuses.push(response.status);
    }

    // 401, 401, then 429 for every attempt after the limit is reached.
    expect(statuses).toEqual([401, 401, 429, 429]);
  });

  it("refuses a reused challenge", async () => {
    const store = await storeWithCode();
    const challengeId = await challengeIdFor(store);

    const first = await handleChallengeVerificationRequest(
      jsonRequest(VERIFY_URL, { challengeId, accessCode: TEST_CODE }),
      { store, secret: TEST_SECRET, now: () => TEST_NOW },
    );
    const second = await handleChallengeVerificationRequest(
      jsonRequest(VERIFY_URL, { challengeId, accessCode: TEST_CODE }),
      { store, secret: TEST_SECRET, now: () => TEST_NOW },
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(401);
  });

  it("rejects an answer that tries to carry a verdict or another bill", async () => {
    const store = await storeWithCode();
    const challengeId = await challengeIdFor(store);
    const dependencies = { store, secret: TEST_SECRET, now: () => TEST_NOW };

    for (const body of [
      { challengeId, accessCode: TEST_CODE, isVerified: true },
      { challengeId, accessCode: TEST_CODE, outcome: "verified" },
      { challengeId, accessCode: TEST_CODE, billNumber: "INV-2026-9999" },
    ]) {
      const response = await handleChallengeVerificationRequest(jsonRequest(VERIFY_URL, body), dependencies);
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("fails closed with 503 when no secret is configured", async () => {
    const response = await handleChallengeVerificationRequest(
      jsonRequest(VERIFY_URL, { challengeId: "0f5b1a2c-3d4e-5f60-7182-93a4b5c6d7e8", accessCode: TEST_CODE }),
      { store: createInMemoryAccessStore(), secret: null, now: () => TEST_NOW },
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: "access_unavailable", message: ACCESS_UNAVAILABLE_MESSAGE },
    });
  });
});
