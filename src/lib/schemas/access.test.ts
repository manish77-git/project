import { describe, expect, it } from "vitest";
import {
  accessChallengeRequestSchema,
  accessChallengeSchema,
  accessChallengeVerificationRequestSchema,
  accessGrantSchema,
  storedAccessCodeSchema,
} from "./access";

const digest = "a".repeat(64);

describe("accessChallengeRequestSchema", () => {
  it("accepts a bill number on its own", () => {
    expect(accessChallengeRequestSchema.safeParse({ billNumber: "INV-2026-0042" }).success).toBe(
      true,
    );
  });

  it("rejects a browser-supplied flag or any other extra field", () => {
    for (const extra of [
      { isVerified: true },
      { verified: true },
      { outcome: "verified" },
      { attemptsRemaining: 99 },
      { expiresAt: "2099-01-01T00:00:00.000Z" },
      { challengeId: "chosen-by-the-client-1234567890" },
    ]) {
      const result = accessChallengeRequestSchema.safeParse({
        billNumber: "INV-2026-0042",
        ...extra,
      });
      expect(result.success, `extra ${JSON.stringify(extra)}`).toBe(false);
    }
  });

  it("rejects a missing or malformed bill number", () => {
    expect(accessChallengeRequestSchema.safeParse({}).success).toBe(false);
    expect(accessChallengeRequestSchema.safeParse({ billNumber: "AB" }).success).toBe(false);
    expect(accessChallengeRequestSchema.safeParse({ billNumber: -1 }).success).toBe(false);
  });
});

describe("accessChallengeVerificationRequestSchema", () => {
  it("accepts a challenge id and a code", () => {
    const result = accessChallengeVerificationRequestSchema.safeParse({
      challengeId: "0f5b1a2c-3d4e-5f60-7182-93a4b5c6d7e8",
      accessCode: "AB3DE-FGH7K",
    });
    expect(result.success).toBe(true);
  });

  it("refuses to let a client retarget the challenge at another bill", () => {
    const result = accessChallengeVerificationRequestSchema.safeParse({
      challengeId: "0f5b1a2c-3d4e-5f60-7182-93a4b5c6d7e8",
      accessCode: "AB3DE-FGH7K",
      billNumber: "INV-2026-9999",
    });
    expect(result.success).toBe(false);
  });

  it("refuses an outcome or a verified flag in the answer", () => {
    for (const extra of [{ outcome: "verified" }, { isVerified: true }, { status: "completed" }]) {
      const result = accessChallengeVerificationRequestSchema.safeParse({
        challengeId: "0f5b1a2c-3d4e-5f60-7182-93a4b5c6d7e8",
        accessCode: "AB3DE-FGH7K",
        ...extra,
      });
      expect(result.success, `extra ${JSON.stringify(extra)}`).toBe(false);
    }
  });
});

describe("accessChallengeSchema", () => {
  it("requires an ISO timestamp with a timezone", () => {
    const base = {
      challengeId: "0f5b1a2c-3d4e-5f60-7182-93a4b5c6d7e8",
      billNumber: "INV-2026-0042",
      attemptsRemaining: 3,
    };
    expect(
      accessChallengeSchema.safeParse({ ...base, expiresAt: "2026-10-16T10:05:00.000Z" }).success,
    ).toBe(true);
    // No offset: ambiguous, so refused rather than guessed at.
    expect(
      accessChallengeSchema.safeParse({ ...base, expiresAt: "2026-10-16T10:05:00" }).success,
    ).toBe(false);
  });
});

describe("accessGrantSchema", () => {
  it("carries only a token, an expiry and the bill it is bound to", () => {
    const grant = {
      accessToken: "x".repeat(40),
      expiresAt: "2026-10-16T10:15:00.000Z",
      billNumber: "INV-2026-0042",
    };
    expect(accessGrantSchema.safeParse(grant).success).toBe(true);
    for (const extra of [{ isVerified: true }, { accessCode: "AB3DEFGH7K" }, { amounts: {} }]) {
      expect(accessGrantSchema.safeParse({ ...grant, ...extra }).success).toBe(false);
    }
  });
});

describe("storedAccessCodeSchema", () => {
  it("accepts a digest record and rejects a plaintext code", () => {
    const record = {
      codeDigest: digest,
      billNumber: "INV-2026-0042",
      expiresAt: "2026-10-20T10:00:00.000Z",
      consumedAt: null,
    };
    expect(storedAccessCodeSchema.safeParse(record).success).toBe(true);
    // A record that stored the code itself must never validate.
    expect(
      storedAccessCodeSchema.safeParse({ ...record, codeDigest: "AB3DEFGH7K" }).success,
    ).toBe(false);
    expect(storedAccessCodeSchema.safeParse({ ...record, code: "AB3DEFGH7K" }).success).toBe(false);
  });

  it("rejects an uppercase or short digest", () => {
    const record = {
      codeDigest: "A".repeat(64),
      billNumber: "INV-2026-0042",
      expiresAt: "2026-10-20T10:00:00.000Z",
      consumedAt: null,
    };
    expect(storedAccessCodeSchema.safeParse(record).success).toBe(false);
    expect(storedAccessCodeSchema.safeParse({ ...record, codeDigest: "abc" }).success).toBe(false);
  });
});
