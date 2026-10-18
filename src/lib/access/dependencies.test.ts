import { describe, expect, it, vi } from "vitest";
import { selectAccessDependencies } from "./dependencies";
import { MAX_CHALLENGE_ATTEMPTS, THROTTLE_WINDOW_MINUTES } from "./policy";
import { newStore, TEST_BILL_NUMBER, TEST_NOW, TEST_SECRET } from "./__fixtures__/test-access";

const CLIENT = "203.0.113.7";
const DATABASE_URL = "postgres://navigator:secret@localhost:5432/navigator";

function fakeDatabase() {
  return { query: vi.fn(async () => ({ rows: [] })) };
}

describe("selectAccessDependencies", () => {
  it("uses the database code store and its lockout when a database is configured", async () => {
    const store = newStore();
    const dependencies = selectAccessDependencies({
      store,
      secret: TEST_SECRET,
      databaseUrl: DATABASE_URL,
      database: fakeDatabase,
    });

    expect(dependencies.attemptAuthority).toBe("database");
    expect(dependencies.codeVerifier).not.toBeNull();
  });

  it("keeps exactly one authority: no in-memory bucket is armed in database mode", async () => {
    const store = newStore();
    const dependencies = selectAccessDependencies({
      store,
      secret: TEST_SECRET,
      databaseUrl: DATABASE_URL,
      database: fakeDatabase,
    });
    const input = { billNumber: TEST_BILL_NUMBER, clientKey: CLIENT, now: TEST_NOW };

    // Ten failures in a row, and the in-memory strategy reports nothing —
    // because a second counter is exactly what this design forbids.
    for (let i = 0; i < 10; i += 1) {
      expect(await dependencies.throttle.registerFailure(input)).toBeNull();
    }
    expect(await dependencies.throttle.check(input)).toBeNull();
    expect(await store.findAttempts(`bill:${TEST_BILL_NUMBER}`)).toBeNull();
    expect(await store.findAttempts(`client:${CLIENT}`)).toBeNull();
  });

  it("falls back to the digest store and the in-memory throttle without a database", async () => {
    const store = newStore();
    const dependencies = selectAccessDependencies({ store, secret: TEST_SECRET, databaseUrl: null });
    const input = { billNumber: TEST_BILL_NUMBER, clientKey: CLIENT, now: TEST_NOW };

    expect(dependencies.attemptAuthority).toBe("memory");
    expect(dependencies.codeVerifier).not.toBeNull();

    for (let attempt = 1; attempt < MAX_CHALLENGE_ATTEMPTS; attempt += 1) {
      expect(await dependencies.throttle.registerFailure(input)).toBeNull();
    }
    expect(await dependencies.throttle.registerFailure(input)).toBe(THROTTLE_WINDOW_MINUTES * 60);
    expect(await store.findAttempts(`bill:${TEST_BILL_NUMBER}`)).not.toBeNull();
  });

  it("has no code verifier at all when the secret is unusable and there is no database", () => {
    const dependencies = selectAccessDependencies({
      store: newStore(),
      secret: null,
      databaseUrl: null,
    });

    // The endpoints answer 503 in this state: failing closed, not open.
    expect(dependencies.codeVerifier).toBeNull();
    expect(dependencies.secret).toBeNull();
  });

  it("still builds a database verifier when the secret is missing, leaving tokens to fail closed", async () => {
    const dependencies = selectAccessDependencies({
      store: newStore(),
      secret: null,
      databaseUrl: DATABASE_URL,
      database: fakeDatabase,
    });

    // Codes need no secret in database mode (bcrypt hashes, not HMAC digests),
    // but a missing secret still means no token can be signed or trusted.
    expect(dependencies.codeVerifier).not.toBeNull();
    expect(dependencies.secret).toBeNull();
  });
});
