import { describe, expect, it } from "vitest";
import { authorizeSession } from "./authorization";
import { createInMemoryAccessStore } from "./store";
import { issueAccessToken } from "./token";
import {
  at,
  grantAccess,
  TEST_BILL_NUMBER,
  TEST_NOW,
  TEST_SECRET,
} from "./__fixtures__/test-access";

const ENDPOINT = "http://localhost:3000/api/bills/financials";

function request(authorization?: string): Request {
  return new Request(ENDPOINT, {
    headers: authorization ? { authorization } : {},
  });
}

describe("authorizeSession", () => {
  it("authorises a token whose session the server still holds", async () => {
    const store = createInMemoryAccessStore();
    const grant = await grantAccess(store);

    const result = await authorizeSession(request(`Bearer ${grant.accessToken}`), {
      store,
      secret: TEST_SECRET,
      now: TEST_NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.billNumber).toBe(TEST_BILL_NUMBER);
    expect(result.session.outcome).toBeNull();
  });

  it("refuses a missing or non-bearer authorization header", async () => {
    const store = createInMemoryAccessStore();
    await grantAccess(store);

    for (const header of [undefined, "", "Basic abc", "Bearer", `Token ${"x".repeat(20)}`]) {
      const result = await authorizeSession(request(header), {
        store,
        secret: TEST_SECRET,
        now: TEST_NOW,
      });
      expect(result.ok, `header ${JSON.stringify(header)}`).toBe(false);
    }
  });

  it("refuses a token signed with a different secret", async () => {
    const store = createInMemoryAccessStore();
    const { token } = issueAccessToken({
      billNumber: TEST_BILL_NUMBER,
      secret: "a-different-secret-long-enough-1234567890",
      now: TEST_NOW,
    });

    const result = await authorizeSession(request(`Bearer ${token}`), {
      store,
      secret: TEST_SECRET,
      now: TEST_NOW,
    });
    expect(result.ok).toBe(false);
  });

  it("refuses a well-formed token with no matching session", async () => {
    // The signature is valid, but the server never created this session — which
    // is exactly the case a restart or a forged-but-signed token would produce.
    const store = createInMemoryAccessStore();
    const { token } = issueAccessToken({
      billNumber: TEST_BILL_NUMBER,
      secret: TEST_SECRET,
      now: TEST_NOW,
    });

    const result = await authorizeSession(request(`Bearer ${token}`), {
      store,
      secret: TEST_SECRET,
      now: TEST_NOW,
    });
    expect(result.ok).toBe(false);
  });

  it("refuses a session whose lifetime has passed", async () => {
    const store = createInMemoryAccessStore();
    const grant = await grantAccess(store);

    const result = await authorizeSession(request(`Bearer ${grant.accessToken}`), {
      store,
      secret: TEST_SECRET,
      now: at(16),
    });
    expect(result.ok).toBe(false);
  });

  it("refuses a token that names a different bill than its session", async () => {
    const store = createInMemoryAccessStore();
    const grant = await grantAccess(store);

    // Same session id, same secret, valid signature — but pointed at another
    // bill. Both halves must agree, so this is refused.
    const { payload } = issueAccessToken({
      billNumber: TEST_BILL_NUMBER,
      secret: TEST_SECRET,
      now: TEST_NOW,
    });
    const reissued = issueAccessToken({
      billNumber: "INV-2026-9999",
      secret: TEST_SECRET,
      now: TEST_NOW,
      sessionId: payload.sessionId,
    });
    void grant;

    const result = await authorizeSession(request(`Bearer ${reissued.token}`), {
      store,
      secret: TEST_SECRET,
      now: TEST_NOW,
    });
    expect(result.ok).toBe(false);
  });

  it("fails closed when no secret is configured", async () => {
    const store = createInMemoryAccessStore();
    const grant = await grantAccess(store);

    const result = await authorizeSession(request(`Bearer ${grant.accessToken}`), {
      store,
      secret: null,
      now: TEST_NOW,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(401);
  });
});
