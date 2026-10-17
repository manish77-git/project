import { Pool } from "pg";

/**
 * The tiny slice of `pg` that our queries use. Query functions accept this
 * instead of a real Pool, so tests can pass a fake and never need a database.
 */
export interface Queryable {
  query(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
}

// Next.js dev mode reloads modules often; keep ONE pool on globalThis so we
// don't open a new set of connections on every reload.
const globalForPool = globalThis as unknown as { __navigatorPool?: Pool };

/**
 * Returns the shared database connection. SERVER-SIDE ONLY: never import this
 * from a client component, because DATABASE_URL contains the password.
 */
export function getDb(): Queryable {
  if (!globalForPool.__navigatorPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set. Add it to .env.local.");
    }
    globalForPool.__navigatorPool = new Pool({ connectionString });
  }
  const pool = globalForPool.__navigatorPool;
  return { query: (text, params) => pool.query(text, params) };
}