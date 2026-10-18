import { describe, expect, it } from "vitest";
import {
  ACCESS_CODE_ALPHABET,
  ACCESS_CODE_LENGTH,
  digestAccessCode,
  formatAccessCode,
  generateAccessCode,
  normalizeAccessCode,
} from "./codes";
import {
  ACCESS_SECRET_ENV_VAR,
  MIN_ACCESS_SECRET_LENGTH,
  isUsableAccessSecret,
  readAccessSecret,
} from "./secret";

describe("generateAccessCode", () => {
  it("uses the unambiguous alphabet only", () => {
    for (const character of ["I", "O", "0", "1"]) {
      expect(ACCESS_CODE_ALPHABET).not.toContain(character);
    }
  });

  it("generates a code of the expected length from the alphabet", () => {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const code = generateAccessCode();
      expect(code).toHaveLength(ACCESS_CODE_LENGTH);
      for (const character of code) {
        expect(ACCESS_CODE_ALPHABET).toContain(character);
      }
    }
  });

  it("does not repeat itself across many calls", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateAccessCode()));
    expect(codes.size).toBe(200);
  });

  it("rejects a nonsensical length", () => {
    expect(() => generateAccessCode(0)).toThrow();
    expect(() => generateAccessCode(1.5)).toThrow();
  });
});

describe("normalizeAccessCode", () => {
  it("treats the ways a patient might type a code as one code", () => {
    for (const typed of ["AB3DEFGH7K", "ab3de-fgh7k", " ab3de fgh7k ", "AB3DE-FGH7K"]) {
      expect(normalizeAccessCode(typed)).toBe("AB3DEFGH7K");
    }
  });
});

describe("formatAccessCode", () => {
  it("groups the code for reading off paper", () => {
    expect(formatAccessCode("AB3DEFGH7K")).toBe("AB3DE-FGH7K");
    expect(formatAccessCode("ab3de-fgh7k")).toBe("AB3DE-FGH7K");
  });
});

describe("digestAccessCode", () => {
  it("is deterministic and case/format insensitive", () => {
    const secret = "a-secret-long-enough-to-be-usable-1234567890";
    expect(digestAccessCode("AB3DEFGH7K", secret)).toBe(digestAccessCode("ab3de-fgh7k", secret));
  });

  it("never contains the code, so the store cannot leak it", () => {
    const secret = "a-secret-long-enough-to-be-usable-1234567890";
    const digest = digestAccessCode("AB3DEFGH7K", secret);
    expect(digest).not.toContain("AB3DE");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("depends on the secret, so a store leak alone cannot be brute-forced", () => {
    const otherSecret = "another-secret-long-enough-1234567890123456";
    expect(digestAccessCode("AB3DEFGH7K", "a-secret-long-enough-to-be-usable-1234567890")).not.toBe(
      digestAccessCode("AB3DEFGH7K", otherSecret),
    );
  });

  it("separates different codes", () => {
    const secret = "a-secret-long-enough-to-be-usable-1234567890";
    const digests = new Set(
      ["AB3DEFGH7K", "AB3DEFGH7L", "ZZZZZZZZZZ"].map((code) => digestAccessCode(code, secret)),
    );
    expect(digests.size).toBe(3);
  });
});

describe("access secret policy", () => {
  it("refuses a short or missing secret rather than using a weak one", () => {
    expect(isUsableAccessSecret(undefined)).toBe(false);
    expect(isUsableAccessSecret(null)).toBe(false);
    expect(isUsableAccessSecret("")).toBe(false);
    expect(isUsableAccessSecret("too-short")).toBe(false);
    expect(isUsableAccessSecret("x".repeat(MIN_ACCESS_SECRET_LENGTH - 1))).toBe(false);
    expect(isUsableAccessSecret("x".repeat(MIN_ACCESS_SECRET_LENGTH))).toBe(true);
  });

  it("reads the secret from the environment", () => {
    expect(readAccessSecret({})).toBeNull();
    expect(readAccessSecret({ [ACCESS_SECRET_ENV_VAR]: "short" })).toBeNull();
    expect(readAccessSecret({ [ACCESS_SECRET_ENV_VAR]: "y".repeat(40) })).toBe("y".repeat(40));
  });
});
