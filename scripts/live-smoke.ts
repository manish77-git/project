/**
 * Controlled live smoke test for the Stage 4 explanation workflow.
 *
 * Run against a server that has already been started with .env.local:
 *
 *   node --import tsx scripts/live-smoke.ts
 *
 * It performs exactly one real Gemini-backed request, using only the synthetic
 * bill INV-2026-0042:
 *
 *   1. issue a single-use access code (output captured, never printed);
 *   2. start a challenge;
 *   3. answer it with the code;
 *   4. verify the bill;
 *   5. request an explanation.
 *
 * What it prints — and what it deliberately does not:
 *   - prints: HTTP statuses, the validation marker, schema conformance,
 *     per-field match booleans, the client-facing explanations (which the
 *     contract guarantees carry no figures), and the error code on failure;
 *   - never prints: the API key, the access code, the bearer token, a raw
 *     provider draft, or any amount from the record.
 *
 * Exit code 0 means the response validated against `explanationResponseSchema`
 * and every financial fact matched the authoritative record.
 */
import { execFileSync } from "node:child_process";
import { explanationResponseSchema } from "@/lib/schemas";
import { MOCK_HOSPITAL_RECORDS, normalizeBillNumberForLookup } from "@/lib/records/mock-records";
import { validateFinancialFact } from "@/lib/explanation/validator";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const BILL_NUMBER = "INV-2026-0042";
const LANGUAGE = process.env.SMOKE_LANGUAGE ?? "en";

function log(line: string): void {
  process.stdout.write(`${line}\n`);
}

function fail(line: string): never {
  process.stderr.write(`${line}\n`);
  process.exit(1);
}

async function post(
  path: string,
  body: unknown,
  token?: string,
): Promise<{ status: number; json: unknown }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { status: response.status, json };
}

function errorCode(json: unknown): string {
  if (json && typeof json === "object" && "error" in json) {
    const error = (json as { error?: unknown }).error;
    if (error && typeof error === "object" && "code" in error) {
      return String((error as { code?: unknown }).code);
    }
  }
  return "unknown";
}

/** Issues a code through the existing script and returns it without logging it. */
function issueAccessCode(): string {
  const output = execFileSync(
    process.execPath,
    [
      "--env-file-if-exists=.env.local",
      "--import",
      "tsx",
      "scripts/issue-access-code.ts",
      "--bill",
      BILL_NUMBER,
      "--days",
      "1",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const match = /^ {4}([A-Z2-9]{5}-[A-Z2-9]{5})$/m.exec(output);
  if (!match?.[1]) fail("issue-access-code did not print a code in the expected shape");
  return match[1];
}

async function main(): Promise<void> {
  log(`live smoke | bill=${BILL_NUMBER} language=${LANGUAGE} base=${BASE_URL}`);

  const accessCode = issueAccessCode();
  log("1 issue access code   ok (code withheld from output)");

  const challenge = await post("/api/bills/access/challenge", { billNumber: BILL_NUMBER });
  if (challenge.status !== 200) {
    fail(`2 challenge           HTTP ${challenge.status} ${errorCode(challenge.json)}`);
  }
  const challengeId = (challenge.json as { challengeId?: string }).challengeId;
  if (!challengeId) fail("2 challenge           no challengeId in response");
  log("2 challenge           HTTP 200");

  const grant = await post("/api/bills/access/verify", { challengeId, accessCode });
  if (grant.status !== 200) {
    fail(`3 access verify       HTTP ${grant.status} ${errorCode(grant.json)}`);
  }
  const token = (grant.json as { accessToken?: string }).accessToken;
  if (!token) fail("3 access verify       no accessToken in response");
  log("3 access verify       HTTP 200");

  const verification = await post("/api/bills/verify", {}, token);
  if (verification.status !== 200) {
    fail(`4 bill verify         HTTP ${verification.status} ${errorCode(verification.json)}`);
  }
  const outcome = (verification.json as { outcome?: string }).outcome;
  log(`4 bill verify         HTTP 200 outcome=${outcome ?? "missing"}`);
  if (outcome !== "verified") fail(`4 bill verify         expected verified, got ${outcome}`);

  const explain = await post("/api/bills/explain", { language: LANGUAGE }, token);
  if (explain.status !== 200) {
    fail(`5 explain             HTTP ${explain.status} ${errorCode(explain.json)}`);
  }
  log("5 explain             HTTP 200");

  const body = explain.json;
  const parsed = explanationResponseSchema.safeParse(body);
  if (!parsed.success) {
    const paths = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "<root>"}:${issue.code}`)
      .join(", ");
    fail(`schema                FAILED (${paths})`);
  }
  log("schema                conforms to explanationResponseSchema");

  const response = parsed.data;
  log(`validation marker     ${response.validation}`);

  const record = MOCK_HOSPITAL_RECORDS.find(
    (candidate) =>
      normalizeBillNumberForLookup(candidate.billNumber) ===
      normalizeBillNumberForLookup(BILL_NUMBER),
  );
  if (!record) fail("record                synthetic record missing");

  const reference = response.explanation.verifiedRecordReference;
  log(
    `record reference      recordId=${reference.recordId} billMatch=${
      normalizeBillNumberForLookup(reference.billNumber) ===
      normalizeBillNumberForLookup(record.billNumber)
    }`,
  );
  log(`notice                ${response.explanation.notice}`);
  log(`datesUsed             ${response.explanation.datesUsed.length} entries`);

  let allFactsMatch = true;
  for (const fact of response.explanation.financialFactsUsed) {
    const result = validateFinancialFact(fact.fieldKey, fact.amountRupees, record);
    const matched = result === null;
    if (!matched) allFactsMatch = false;
    log(`fact ${fact.fieldKey}: match=${matched}`);
  }

  let allSectionsMatch = true;
  for (const section of response.sections) {
    const result = validateFinancialFact(section.fieldKey, section.amountRupees, record);
    const matched = result === null;
    if (!matched) allSectionsMatch = false;
    log(`section ${section.fieldKey}: match=${matched} status=${section.status}`);
  }

  // The client-facing text must never carry the credentials this run used.
  const serialised = JSON.stringify(response);
  const leaksCode = serialised.includes(accessCode);
  const leaksToken = serialised.includes(token);
  log(`no code in response   ${!leaksCode}`);
  log(`no token in response  ${!leaksToken}`);

  log("client-facing explanations:");
  for (const section of response.sections) {
    log(`  [${section.fieldKey}] ${section.explanation}`);
  }

  if (!allFactsMatch || !allSectionsMatch || leaksCode || leaksToken) {
    fail("result                FAILED: facts or credential-leak check");
  }

  log(`result                ${response.validation === "validated" ? "LIVE_AI_VALIDATED" : "SAFE_FALLBACK"}`);
}

main().catch((error: unknown) => {
  fail(`driver                ${error instanceof Error ? error.message : String(error)}`);
});
