/**
 * HTTP layer for bill questions.
 *
 * `POST /api/bills/questions` accepts exactly two values — a question and a
 * language — and answers from the session the bearer token proves. It:
 *   - requires `application/json`;
 *   - fails closed with `503` when no access secret is configured;
 *   - requires a live bearer session, checked by the same gate every protected
 *     endpoint calls for itself;
 *   - reads the body under a byte limit, so an oversized chunked request is
 *     refused while it is read instead of after it has been buffered;
 *   - returns `503` when no provider is configured — never an invented answer;
 *   - parses the finished answer with `questionAnswerResponseSchema` as the
 *     last gate before it leaves the server.
 *
 * A client-supplied bill number, amount, outcome or `isVerified` flag is not
 * accepted here because the request schema is strict: such a body is a `400`.
 */
import { NextResponse } from "next/server";
import { authorizeSession } from "@/lib/access/authorization";
import { BODY_TOO_LARGE_MESSAGE, readJsonBody } from "@/lib/http/request-body";
import type { AccessStore } from "@/lib/access/store";
import type { HospitalRecordRepository } from "@/lib/records/mock-records";
import { questionAnswerResponseSchema } from "@/lib/schemas";
import type { QuestionProvider } from "./provider";
import { answerQuestion, type QuestionServiceErrorCode } from "./service";

export const QUESTION_ACCESS_UNAVAILABLE_MESSAGE =
  "Access codes are not available right now. Please try again later.";
export const QUESTION_UNAVAILABLE_CODE = "question_unavailable";
export const QUESTION_UNAVAILABLE_MESSAGE =
  "Question answering is not available right now. Please try again later.";
export const QUESTION_FAILED_CODE = "question_failed";
export const QUESTION_FAILED_MESSAGE =
  "The answer could not be prepared right now. Please try again later.";

export interface QuestionHandlerDependencies {
  store: AccessStore;
  /** null when the server secret is missing: the endpoint fails closed. */
  secret: string | null;
  /** null when GEMINI_API_KEY is absent: a safe 503, never an answer. */
  provider: QuestionProvider | null;
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
): NextResponse {
  return json({ error: { code, message } }, status);
}

type ErrorMapping = { status: number; code: string };

const ERROR_MAPPING: Record<QuestionServiceErrorCode, ErrorMapping> = {
  invalid_request: { status: 400, code: "invalid_request" },
  unsupported_language: { status: 400, code: "invalid_request" },
  session_expired: { status: 401, code: "access_denied" },
  verification_required: { status: 409, code: "verification_required" },
  bill_not_found: { status: 404, code: "bill_not_found" },
  hospital_not_registered: { status: 409, code: "hospital_not_registered" },
  assembly_failed: { status: 500, code: QUESTION_FAILED_CODE },
};

function requireJson(request: Request): boolean {
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  return contentType.includes("application/json");
}

export async function handleQuestionRequest(
  request: Request,
  dependencies: QuestionHandlerDependencies,
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
      QUESTION_ACCESS_UNAVAILABLE_MESSAGE,
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

  if (dependencies.provider === null) {
    return errorResponse(
      503,
      QUESTION_UNAVAILABLE_CODE,
      QUESTION_UNAVAILABLE_MESSAGE,
    );
  }

  const result = await answerQuestion({
    session: authorization.session,
    request: body.value,
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
        ? QUESTION_FAILED_MESSAGE
        : result.error.message,
    );
  }

  // Last gate: the public shape decides what may leave the server.
  const response = questionAnswerResponseSchema.safeParse(result.response);
  if (!response.success) {
    return errorResponse(500, QUESTION_FAILED_CODE, QUESTION_FAILED_MESSAGE);
  }

  return json(response.data, 200);
}
