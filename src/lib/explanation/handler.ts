/**
 * HTTP layer for explanations.
 *
 * `POST /api/bills/explain` is the first public explanation endpoint. It:
 *   - requires a live bearer session whose recorded outcome is `verified`;
 *   - passes the session (never a client bill number) to the service;
 *   - returns `503` when the provider is not configured;
 *   - otherwise returns the validated `explanationResponseSchema`.
 *
 * The service re-checks the session and the current record before invoking the
 * model. If the provider fails or its draft fails validation, the service
 * substitutes a deterministic server template; the raw draft is never
 * returned. A final schema parse in this handler is the last gate.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeSession } from "@/lib/access/authorization";
import { BODY_TOO_LARGE_MESSAGE, readJsonBody } from "@/lib/http/request-body";
import type { AccessStore } from "@/lib/access/store";
import type { ExplanationProvider } from "@/lib/explanation/provider";
import {
  generateExplanation,
  type ExplanationServiceErrorCode,
} from "@/lib/explanation/service";
import type { HospitalRecordRepository } from "@/lib/records/mock-records";
import {
  explanationResponseSchema,
  languageCodeSchema,
  type FinancialFieldKey,
} from "@/lib/schemas";

export const EXPLANATION_ACCESS_UNAVAILABLE_MESSAGE =
  "Access codes are not available right now. Please try again later.";
export const EXPLANATION_UNAVAILABLE_CODE = "explanation_unavailable";
export const EXPLANATION_UNAVAILABLE_MESSAGE =
  "Explanations are not available right now. Please try again later.";
export const EXPLANATION_FAILED_CODE = "explanation_failed";
export const EXPLANATION_FAILED_MESSAGE =
  "The explanation could not be prepared right now. Please try again later.";

/** The only thing a client may choose: the language of the explanation. */
export const explanationRequestSchema = z
  .object({
    language: languageCodeSchema,
  })
  .strict();
export type ExplanationRequest = z.infer<typeof explanationRequestSchema>;

export interface ExplanationHandlerDependencies {
  store: AccessStore;
  /** null when the server secret is missing: the endpoint fails closed. */
  secret: string | null;
  /** null when GEMINI_API_KEY is absent: a safe 503, never a draft. */
  provider: ExplanationProvider | null;
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
  discrepancyKeys?: readonly FinancialFieldKey[],
): NextResponse {
  return json(
    {
      error: {
        code,
        message,
        ...(discrepancyKeys && discrepancyKeys.length > 0
          ? { discrepancyKeys: [...discrepancyKeys] }
          : {}),
      },
    },
    status,
  );
}

type ErrorMapping = { status: number; code: string };

const ERROR_MAPPING: Record<ExplanationServiceErrorCode, ErrorMapping> = {
  unsupported_language: { status: 400, code: "invalid_request" },
  session_expired: { status: 401, code: "access_denied" },
  verification_required: { status: 409, code: "verification_required" },
  amounts_differ: { status: 409, code: "amounts_differ" },
  bill_not_found: { status: 404, code: "bill_not_found" },
  hospital_not_registered: { status: 409, code: "hospital_not_registered" },
  assembly_failed: { status: 500, code: EXPLANATION_FAILED_CODE },
};

function requireJson(request: Request): boolean {
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  return contentType.includes("application/json");
}

export async function handleExplanationRequest(
  request: Request,
  dependencies: ExplanationHandlerDependencies,
): Promise<NextResponse> {
  const now = (dependencies.now ?? (() => new Date()))();

  if (!requireJson(request)) {
    return errorResponse(
      415,
      "unsupported_media_type",
      "Send this request as application/json.",
    );
  }

  if (!dependencies.secret) {
    return errorResponse(
      503,
      "access_unavailable",
      EXPLANATION_ACCESS_UNAVAILABLE_MESSAGE,
    );
  }

  const authorization = await authorizeSession(request, {
    store: dependencies.store,
    secret: dependencies.secret,
    now,
  });
  if (!authorization.ok) {
    return errorResponse(
      authorization.status,
      authorization.code,
      authorization.message,
    );
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    if (body.reason === "too_large") {
      return errorResponse(413, "payload_too_large", BODY_TOO_LARGE_MESSAGE);
    }
    return errorResponse(
      400,
      "invalid_request",
      "The request body must be valid JSON.",
    );
  }

  const parsed = explanationRequestSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorResponse(
      400,
      "invalid_request",
      "Choose English, Hindi or Kannada as the explanation language, and nothing else.",
    );
  }

  if (dependencies.provider === null) {
    return errorResponse(
      503,
      EXPLANATION_UNAVAILABLE_CODE,
      EXPLANATION_UNAVAILABLE_MESSAGE,
    );
  }

  const result = await generateExplanation({
    session: authorization.session,
    language: parsed.data.language,
    repository: dependencies.repository,
    provider: dependencies.provider,
    now,
  });

  if (result.kind === "error") {
    const mapping = ERROR_MAPPING[result.error.code];
    return errorResponse(
      mapping.status,
      mapping.code,
      result.error.code === "assembly_failed"
        ? EXPLANATION_FAILED_MESSAGE
        : result.error.message,
      result.error.discrepancyKeys,
    );
  }

  // Last gate: the public shape decides what may leave the server.
  const response = explanationResponseSchema.safeParse(result.response);
  if (!response.success) {
    return errorResponse(
      500,
      EXPLANATION_FAILED_CODE,
      EXPLANATION_FAILED_MESSAGE,
    );
  }

  return json(response.data, 200);
}
