/**
 * Seed codes read from disk.
 *
 * The issuing script writes digests here so the running server can find them;
 * the file never contains a usable code. It is read lazily and cached by
 * modification time, so a code issued while the server is running is picked up
 * on the next attempt without a restart.
 *
 * A malformed file is a hard error, not an empty list. Silently treating a
 * broken seed as "no codes exist" would turn an operator typo into a puzzling
 * authentication failure; failing loudly keeps the endpoint closed and says
 * why.
 */
import { readFileSync, statSync } from "node:fs";
import { z } from "zod";
import { storedAccessCodeSchema } from "@/lib/schemas";
import type { AccessCodeRecord } from "./store";

export const DEFAULT_ACCESS_CODES_FILE = "data/access-codes.json";
export const ACCESS_CODES_FILE_ENV_VAR = "ACCESS_CODES_FILE";

/** Raised when the seed file exists but cannot be trusted. */
export class AccessCodeSeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessCodeSeedError";
  }
}

const seedArraySchema = z.array(storedAccessCodeSchema);

function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

/**
 * Returns a loader for the given file. Calling the loader twice without the
 * file changing does not re-read it.
 */
export function createCodeSeedSource(
  filePath: string = process.env[ACCESS_CODES_FILE_ENV_VAR] ?? DEFAULT_ACCESS_CODES_FILE,
): () => Promise<AccessCodeRecord[]> {
  let cachedMtimeMs = -1;
  let cached: AccessCodeRecord[] = [];

  return async () => {
    let raw: string;
    let mtimeMs: number;
    // Runtime state, not a build asset. The ignore comment stops Turbopack from
    // tracing this read and bundling the whole project into the server output.
    try {
      const stats = statSync(/*turbopackIgnore: true*/ filePath);
      if (stats.mtimeMs === cachedMtimeMs) return cached;
      raw = readFileSync(/*turbopackIgnore: true*/ filePath, "utf8");
      mtimeMs = stats.mtimeMs;
    } catch (error) {
      if (isMissingFile(error)) {
        cached = [];
        cachedMtimeMs = -1;
        return cached;
      }
      throw new AccessCodeSeedError(
        `The access-code seed file "${filePath}" could not be read: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new AccessCodeSeedError(`The access-code seed file "${filePath}" is not valid JSON.`);
    }

    const parsed = seedArraySchema.safeParse(json);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      throw new AccessCodeSeedError(
        `The access-code seed file "${filePath}" does not match the stored access-code shape (${
          firstIssue ? `${firstIssue.path.join(".")}: ${firstIssue.message}` : "unknown issue"
        }). Re-issue the codes with the seeding script rather than editing the file by hand.`,
      );
    }

    cached = parsed.data.map((record) => ({
      codeDigest: record.codeDigest,
      billNumber: record.billNumber,
      expiresAt: new Date(record.expiresAt),
      consumedAt: record.consumedAt ? new Date(record.consumedAt) : null,
    }));
    cachedMtimeMs = mtimeMs;
    return cached;
  };
}
