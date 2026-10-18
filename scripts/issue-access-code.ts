/**
 * Issues an access code for one bill.
 *
 *   npm run access:issue -- --bill INV-2026-0042 --days 7
 *
 * This stands in for the hospital handing a patient a code at the counter. It
 * runs on the server, never in the browser, and it is deliberately NOT an HTTP
 * endpoint: issuing codes is hospital staff work, and a staff-facing endpoint
 * would need staff authentication that does not exist yet.
 *
 * The code is printed once and stored only as a digest. Nothing here can
 * recover a code afterwards — if it is lost, issue another.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { digestAccessCode, formatAccessCode, generateAccessCode } from "@/lib/access/codes";
import {
  ACCESS_CODES_FILE_ENV_VAR,
  DEFAULT_ACCESS_CODES_FILE,
} from "@/lib/access/code-seed";
import { ACCESS_SECRET_ENV_VAR, MIN_ACCESS_SECRET_LENGTH, isUsableAccessSecret } from "@/lib/access/secret";
import { MOCK_HOSPITAL_RECORDS, normalizeBillNumberForLookup } from "@/lib/records/mock-records";
import { storedAccessCodeSchema } from "@/lib/schemas";

const DEFAULT_VALID_DAYS = 7;

function fail(message: string): never {
  process.stderr.write(`\n${message}\n\n`);
  process.exit(1);
}

function readArgument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

const billNumberArgument = readArgument("bill");
if (!billNumberArgument) {
  fail(
    "Usage: npm run access:issue -- --bill <bill number> [--days 7]\n\n" +
      "Example: npm run access:issue -- --bill INV-2026-0042 --days 7",
  );
}

const billNumber = normalizeBillNumberForLookup(billNumberArgument);

const daysArgument = readArgument("days");
const validDays = daysArgument === null ? DEFAULT_VALID_DAYS : Number(daysArgument);
if (!Number.isFinite(validDays) || validDays <= 0 || validDays > 365) {
  fail("--days must be a number between 1 and 365.");
}

const secret = process.env[ACCESS_SECRET_ENV_VAR];
if (!isUsableAccessSecret(secret)) {
  fail(
    `Set ${ACCESS_SECRET_ENV_VAR} first — the endpoint fails closed without it.\n\n` +
      `Create .env.local (git-ignored) with a value of at least ${MIN_ACCESS_SECRET_LENGTH} characters:\n\n` +
      `  ${ACCESS_SECRET_ENV_VAR}=${randomBytes(32).toString("base64url")}\n\n` +
      "The value above was generated for you just now; treat it as a server secret and keep it out of git.",
  );
}

const seedFilePath = path.resolve(
  process.env[ACCESS_CODES_FILE_ENV_VAR] ?? DEFAULT_ACCESS_CODES_FILE,
);

// Reuse the stored-code shape so a hand-edited file is caught here rather than
// turning into a puzzling rejection at redemption time.
const existingSchema = z.array(storedAccessCodeSchema);
let existing: z.infer<typeof existingSchema> = [];
try {
  existing = existingSchema.parse(JSON.parse(readFileSync(seedFilePath, "utf8")));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    fail(
      `The existing seed file "${seedFilePath}" could not be read or does not match the stored\n` +
        `access-code shape, so it was left untouched:\n\n${
          error instanceof Error ? error.message : String(error)
        }`,
    );
  }
}

const code = generateAccessCode();
const expiresAt = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);

const next = [
  ...existing,
  {
    codeDigest: digestAccessCode(code, secret),
    billNumber,
    expiresAt: expiresAt.toISOString(),
    consumedAt: null,
  },
];

mkdirSync(path.dirname(seedFilePath), { recursive: true });
const temporaryPath = `${seedFilePath}.${randomUUID()}.tmp`;
writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
// Write-then-rename so a crash cannot leave a half-written seed behind.
renameSync(temporaryPath, seedFilePath);

const knownBill = MOCK_HOSPITAL_RECORDS.some(
  (record) => normalizeBillNumberForLookup(record.billNumber) === billNumber,
);

process.stdout.write(
  [
    "",
    `Access code for ${billNumber}`,
    "",
    `    ${formatAccessCode(code)}`,
    "",
    `Valid until : ${expiresAt.toISOString()} (${validDays} day${validDays === 1 ? "" : "s"})`,
    `Stored as   : a digest in ${path.relative(process.cwd(), seedFilePath)}`,
    "Show this code to the patient once. It cannot be recovered afterwards.",
    "",
    knownBill
      ? "This bill number exists in the synthetic hospital records."
      : "Note: this bill number is NOT in the synthetic hospital records, so verification\nwill answer bill_not_found. Known numbers: " +
        MOCK_HOSPITAL_RECORDS.map((record) => record.billNumber).join(", "),
    "",
  ].join("\n"),
);
