/**
 * The one place that decides which access-code store and which attempt
 * authority a running server uses.
 *
 * The rule is: a configured database wins, and nothing is ever enforced twice.
 *
 *   DATABASE_URL set  → codes live in `access_codes` (bcrypt), single-use, and
 *                       that table's own five-failure lockout is the attempt
 *                       authority. It survives a restart.
 *   DATABASE_URL unset → codes are digest rows in the seed file and the
 *                       in-memory bill/client throttle is the attempt
 *                       authority. It resets on restart (documented).
 *
 * Routes only ever see ports, so neither choice leaks into the HTTP layer and a
 * future shared store is one adapter away.
 */
import { getDb } from "@/lib/db/client";
import {
  createDatabaseCodeVerifier,
  createDigestCodeVerifier,
  type CodeVerifier,
} from "./code-verifier";
import { readAccessSecret } from "./secret";
import { getDefaultAccessStore, type AccessStore } from "./store";
import {
  createInMemoryThrottle,
  createStorageManagedThrottle,
  type ThrottleStrategy,
} from "./throttle";

export type AttemptAuthority = "database" | "memory";

export interface AccessDependencies {
  store: AccessStore;
  /** null when the secret is missing or too weak: access fails closed. */
  secret: string | null;
  /** null only when no secret is usable and no database is configured. */
  codeVerifier: CodeVerifier | null;
  throttle: ThrottleStrategy;
  attemptAuthority: AttemptAuthority;
}

export function selectAccessDependencies(input: {
  store: AccessStore;
  secret: string | null;
  databaseUrl?: string | null;
  database?: () => ReturnType<typeof getDb>;
}): AccessDependencies {
  if (input.databaseUrl) {
    return {
      store: input.store,
      secret: input.secret,
      codeVerifier: createDatabaseCodeVerifier((input.database ?? getDb)()),
      throttle: createStorageManagedThrottle(),
      attemptAuthority: "database",
    };
  }

  return {
    store: input.store,
    secret: input.secret,
    codeVerifier: input.secret ? createDigestCodeVerifier(input.store, input.secret) : null,
    throttle: createInMemoryThrottle(input.store),
    attemptAuthority: "memory",
  };
}

let cached: { key: string; dependencies: AccessDependencies } | null = null;

/**
 * Dependencies for the running server, built once per configuration.
 *
 * Cached on the secret + database URL rather than on "first call", so a test
 * that changes the environment gets a fresh set instead of a stale one.
 */
export function getAccessDependencies(
  env: Record<string, string | undefined> = process.env,
): AccessDependencies {
  const secret = readAccessSecret(env);
  const databaseUrl = env.DATABASE_URL ?? null;
  const key = `${secret ?? ""}|${databaseUrl ?? ""}`;

  if (cached && cached.key === key) return cached.dependencies;

  const dependencies = selectAccessDependencies({
    store: getDefaultAccessStore(),
    secret,
    databaseUrl,
  });
  cached = { key, dependencies };
  return dependencies;
}

/** Test helper: forget the cached wiring. */
export function resetAccessDependencies(): void {
  cached = null;
}
