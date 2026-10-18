/**
 * HTTP layer for verification and for releasing financial detail.
 *
 * `POST /api/bills/verify` — checks the bill against the hospital's record and
 * returns only `billVerificationSchema`: the outcome, a patient-safe message and
 * the KEYS that differed. Never an amount.
 *
 * `GET /api/bills/financials` — releases the hospital's recorded amounts, but
 * only for a session that has verified. Every refusal path returns no figures,
 * and an unresolved discrepancy is one of them: if the amounts do not match,
 * the patient gets the field names and a message, not two sets of numbers to
 * compare themselves.
 *
 * Both endpoints call `authorizeSession` for themselves. Neither accepts a bill
 * identifier from the client: the bill is whatever the access session proved,
 * so a caller cannot point these at a record it has not been authorised to see,
 * and no browser-supplied flag is consulted anywhere.
 */
import { NextResponse } from "next/server";
import { authorizeSession } from "@/lib/access/authorization";
import type { AccessStore } from "@/lib/access/store";
import type { HospitalRecord, HospitalRecordRepository } from "@/lib/records/mock-records";
import {
  documentFinancialsSchema,
  type DocumentFinancials,
  type FinancialFieldKey,
  type VerificationOutcome,
} from "@/lib/schemas";
import { baselineDiscrepancies, computeVerification, verifyBill, VERIFICATION_MESSAGES } from "./service";

export const ACCESS_UNAVAILABLE_MESSAGE =
  "Access codes are not available right now. Please try again later.";
export const VERIFICATION_REQUIRED_MESSAGE =
  "Verify this bill before viewing its financial details.";
export const VERIFY_FAILED_MESSAGE =
  "The bill could not be checked right now. Please try again later.";

export interface VerificationHandlerDependencies {
  store: AccessStore;
  /** null when the server secret is missing: protected routes fail closed. */
  secret: string | null;
  repository: HospitalRecordRepository;
  now?: () => Date;
}

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): NextResponse {
  return json({ error: { code, message, ...extra } }, status);
}

/** Status for a refusal that must not carry amounts. */
const STATUS_BY_OUTCOME: Record<VerificationOutcome, number> = {
  verified: 409,
  amounts_differ: 409,
  bill_not_found: 404,
  hospital_not_registered: 409,
};

async function readJsonBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false };
  }
  // An empty body is treated as "nothing to add", not as malformed JSON: a
  // caller that only wants the server's own record should not have to spell out
  // an empty object.
  if (text.trim().length === 0) return { ok: true, body: {} };
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

export async function handleVerifyRequest(
  request: Request,
  dependencies: VerificationHandlerDependencies,
): Promise<NextResponse> {
  const now = (dependencies.now ?? (() => new Date()))();

  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("application/json")) {
    return errorResponse(415, "unsupported_media_type", "Send this request as application/json.");
  }

  if (!dependencies.secret) {
    return errorResponse(503, "access_unavailable", ACCESS_UNAVAILABLE_MESSAGE);
  }

  const authorization = await authorizeSession(request, {
    store: dependencies.store,
    secret: dependencies.secret,
    now,
  });
  if (!authorization.ok) {
    return errorResponse(authorization.status, authorization.code, authorization.message);
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    return errorResponse(400, "invalid_request", "The request body must be valid JSON.");
  }

  try {
    const outcome = await verifyBill({
      // From the session, never from the body.
      billNumber: authorization.session.billNumber,
      repository: dependencies.repository,
      request: body.body,
    });

    if (outcome.kind === "error") {
      const status = outcome.error.code === "invalid_request" ? 400 : 500;
      return errorResponse(status, outcome.error.code, outcome.error.message);
    }

    // Remember the outcome server-side: the financial endpoint checks it rather
    // than trusting anything the client reports back.
    await dependencies.store.recordOutcome(
      authorization.session.sessionId,
      outcome.result.outcome,
      now,
    );

    return json(outcome.result, 200);
  } catch {
    return errorResponse(500, "verification_failed", VERIFY_FAILED_MESSAGE);
  }
}

function buildDocumentFinancials(record: HospitalRecord): DocumentFinancials {
  const field = (key: FinancialFieldKey) => {
    const amount = record.recordAmounts[key] ?? null;
    return {
      amountRupees: amount,
      // A missing amount is unknown, never zero — the schema rejects "0" here.
      status: amount === null ? ("missing" as const) : ("found" as const),
      evidence: null,
      pageNumber: null,
      // Literal false, not a boolean: the schema only accepts a value that has
      // provably not been confirmed by anyone, let alone by a machine.
      confirmedByUser: false as const,
    };
  };

  return {
    billTotalAfterDiscounts: field("billTotalAfterDiscounts"),
    insuranceApprovedButNotPaid: field("insuranceApprovedButNotPaid"),
    insurancePaidOrCredited: field("insurancePaidOrCredited"),
    patientPayments: field("patientPayments"),
    printedAmountDue: field("printedAmountDue"),
    currency: "INR",
    documentWarnings: [
      "These are the amounts held in the hospital's record, not a re-print of your bill.",
    ],
  };
}

export async function handleFinancialsRequest(
  request: Request,
  dependencies: VerificationHandlerDependencies,
): Promise<NextResponse> {
  const now = (dependencies.now ?? (() => new Date()))();

  if (!dependencies.secret) {
    return errorResponse(503, "access_unavailable", ACCESS_UNAVAILABLE_MESSAGE);
  }

  const authorization = await authorizeSession(request, {
    store: dependencies.store,
    secret: dependencies.secret,
    now,
  });
  if (!authorization.ok) {
    return errorResponse(authorization.status, authorization.code, authorization.message);
  }

  const session = authorization.session;

  if (session.outcome === null) {
    return errorResponse(409, "verification_required", VERIFICATION_REQUIRED_MESSAGE);
  }

  const record = await dependencies.repository.findByBillNumber(session.billNumber);
  if (!record) {
    return errorResponse(404, "bill_not_found", VERIFICATION_MESSAGES.bill_not_found);
  }

  // Defence in depth: the session says what was verified, and the record is
  // re-checked here. Release requires both to agree, so a stale or tampered
  // outcome cannot open the amounts on its own.
  const recomputed = computeVerification({ record, hospitalName: null });
  const releasedOutcome: VerificationOutcome =
    session.outcome === "verified" ? recomputed.outcome : session.outcome;

  if (releasedOutcome !== "verified") {
    // No amounts on any refusal path. For a discrepancy the field KEYS are
    // included, because the identification of a differing field is not itself a
    // protected value — the figures are.
    const extra =
      releasedOutcome === "amounts_differ"
        ? { discrepancyKeys: baselineDiscrepancies(record) }
        : {};
    return errorResponse(
      STATUS_BY_OUTCOME[releasedOutcome],
      releasedOutcome,
      VERIFICATION_MESSAGES[releasedOutcome],
      extra,
    );
  }

  const financials = documentFinancialsSchema.safeParse(buildDocumentFinancials(record));
  if (!financials.success) {
    return errorResponse(500, "verification_failed", VERIFY_FAILED_MESSAGE);
  }

  return json(financials.data, 200);
}
