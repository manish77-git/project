import { describe, expect, it } from "vitest";
import { ACCESS_TOKEN_TTL_MINUTES, issueAccessToken, readBearerToken, verifyAccessToken } from "./token";
import { at, TEST_BILL_NUMBER, TEST_NOW, TEST_SECRET } from "./__fixtures__/test-access";

const OTHER_SECRET = "another-unit-test-secret-abcdefghijklmnop";

function issue(overrides: Partial<Parameters<typeof issueAccessToken>[0]> = {}) {
  return issueAccessToken({
    billNumber: TEST_BILL_NUMBER,
    secret: TEST_SECRET,
    now: TEST_NOW,
    ...overrides,
  });
}

describe("issueAccessToken", () => {
  it("binds the token to the bill and to a session id", () => {
    const { token, payload } = issue();
    expect(token.split(".")).toHaveLength(2);
    expect(payload.billNumber).toBe(TEST_BILL_NUMBER);
    expect(payload.sessionId).toMatch(/[0-9a-f-]{36}/);
    expect(payload.expiresAt.getTime()).toBe(
      TEST_NOW.getTime() + ACCESS_TOKEN_TTL_MINUTES * 60_000,
    );
  });

  it("carries no code and no bill contents", () => {
    const { token } = issue();
    const decoded = Buffer.from(token.split(".")[0] as string, "base64url").toString("utf8");
    expect(decoded).not.toContain("AB3DEFGH7K");
    expect(decoded.toLowerCase()).not.toContain("amount");
    expect(JSON.parse(decoded)).toEqual({
      jti: expect.any(String),
      sub: TEST_BILL_NUMBER,
      iat: expect.any(String),
      exp: expect.any(String),
    });
  });
});

describe("verifyAccessToken", () => {
  it("accepts a token it issued", () => {
    const { token, payload } = issue();
    const result = verifyAccessToken({ token, secret: TEST_SECRET, now: TEST_NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.sessionId).toBe(payload.sessionId);
    expect(result.payload.billNumber).toBe(TEST_BILL_NUMBER);
  });

  it("rejects a token signed with a different secret", () => {
    const { token } = issue();
    expect(verifyAccessToken({ token, secret: OTHER_SECRET, now: TEST_NOW })).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("rejects a payload edited to claim another bill", () => {
    const { token } = issue();
    const [encoded, signature] = token.split(".") as [string, string];
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    const tampered = Buffer.from(
      JSON.stringify({ ...payload, sub: "INV-2026-9999" }),
      "utf8",
    ).toString("base64url");

    expect(verifyAccessToken({ token: `${tampered}.${signature}`, secret: TEST_SECRET, now: TEST_NOW })).toEqual(
      { ok: false, reason: "bad_signature" },
    );
  });

  it("rejects a signature edited to any other value of the same length", () => {
    const { token } = issue();
    const [encoded, signature] = token.split(".") as [string, string];
    const flipped = `${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`;
    expect(verifyAccessToken({ token: `${encoded}.${flipped}`, secret: TEST_SECRET, now: TEST_NOW })).toEqual(
      { ok: false, reason: "bad_signature" },
    );
  });

  it("rejects an expired token, including exactly at its expiry", () => {
    const { token } = issue();
    const justBefore = new Date(TEST_NOW.getTime() + ACCESS_TOKEN_TTL_MINUTES * 60_000 - 1);
    expect(verifyAccessToken({ token, secret: TEST_SECRET, now: justBefore }).ok).toBe(true);
    expect(
      verifyAccessToken({ token, secret: TEST_SECRET, now: at(ACCESS_TOKEN_TTL_MINUTES) }),
    ).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects malformed input", () => {
    for (const token of ["", "abc", "a.b.c", `${"a".repeat(10)}.`, `.${"b".repeat(10)}`]) {
      const result = verifyAccessToken({ token, secret: TEST_SECRET, now: TEST_NOW });
      expect(result.ok, `token ${JSON.stringify(token)}`).toBe(false);
    }
  });
});

describe("readBearerToken", () => {
  it("reads a bearer header and ignores anything else", () => {
    expect(readBearerToken("Bearer abc.def")).toBe("abc.def");
    expect(readBearerToken("bearer abc.def")).toBe("abc.def");
    expect(readBearerToken("Basic abc")).toBeNull();
    expect(readBearerToken("Bearer")).toBeNull();
    expect(readBearerToken(null)).toBeNull();
  });
});
