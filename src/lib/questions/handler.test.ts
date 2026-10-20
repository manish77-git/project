import { describe, expect, it } from "vitest";
import {
  grantAccess,
  TEST_NOW,
  TEST_SECRET,
} from "@/lib/access/__fixtures__/test-access";
import { createInMemoryAccessStore, type AccessStore } from "@/lib/access/store";
import { createMockHospitalRecordRepository } from "@/lib/records/mock-records";
import type { QuestionAnswerResponse } from "@/lib/schemas";
import { handleVerifyRequest } from "@/lib/verification/handler";
import {
  createFakeQuestionProvider,
  draftResponse,
  type FakeQuestionProvider,
} from "./__fixtures__/fake-question-provider";
import {
  handleQuestionRequest,
  QUESTION_UNAVAILABLE_CODE,
  QUESTION_UNAVAILABLE_MESSAGE,
  type QuestionHandlerDependencies,
} from "./handler";
import type { QuestionProvider } from "./provider";

const URL = "http://localhost:3000/api/bills/questions";
const VALID_BILL = "INV-2026-0042";
const DISCREPANT_BILL = "INV-2026-0043";

const repository = createMockHospitalRecordRepository();

const MEANING = "An approved amount is one the insurer has agreed but not settled.";

function providerReturning(raw: string): FakeQuestionProvider {
  return createFakeQuestionProvider(() => raw);
}

function dependencies(
  store: AccessStore,
  provider: QuestionProvider | null = providerReturning(draftResponse("meaning", MEANING)),
  secret: string | null = TEST_SECRET,
): QuestionHandlerDependencies {
  return { store, secret, provider, repository, now: () => TEST_NOW };
}

function questionRequest(
  token: string | null,
  body: unknown = { question: "What is amount due?", language: "en" },
  query = "",
): Request {
  return new Request(`${URL}${query}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function granted(billNumber: string): Promise<{ store: AccessStore; token: string }> {
  const store = createInMemoryAccessStore();
  const grant = await grantAccess(store, { billNumber });
  return { store, token: grant.accessToken };
}

async function verified(billNumber: string): Promise<{ store: AccessStore; token: string }> {
  const { store, token } = await granted(billNumber);
  const response = await handleVerifyRequest(
    new Request("http://localhost:3000/api/bills/verify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: "{}",
    }),
    { store, secret: TEST_SECRET, repository, now: () => TEST_NOW },
  );
  expect(response.status).toBe(200);
  return { store, token };
}

describe("POST /api/bills/questions — access gate", () => {
  it("refuses a request with no token", async () => {
    const store = createInMemoryAccessStore();
    const provider = providerReturning(draftResponse("meaning", MEANING));

    const response = await handleQuestionRequest(
      questionRequest(null),
      dependencies(store, provider),
    );

    expect(response.status).toBe(401);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "access_denied",
    );
    expect(provider.calls).toHaveLength(0);
  });

  it("refuses an expired access session without calling the provider", async () => {
    const store = createInMemoryAccessStore();
    const grant = await grantAccess(store, {
      billNumber: VALID_BILL,
      now: new Date(TEST_NOW.getTime() - 20 * 60_000),
    });
    const provider = providerReturning(draftResponse("meaning", MEANING));

    const response = await handleQuestionRequest(
      questionRequest(grant.accessToken),
      dependencies(store, provider),
    );

    expect(response.status).toBe(401);
    expect(provider.calls).toHaveLength(0);
  });

  it("fails closed when no secret is configured", async () => {
    const store = createInMemoryAccessStore();
    const response = await handleQuestionRequest(
      questionRequest(null),
      dependencies(store, null, null),
    );

    expect(response.status).toBe(503);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "access_unavailable",
    );
  });

  it("requires a JSON request", async () => {
    const { store, token } = await granted(VALID_BILL);
    const response = await handleQuestionRequest(
      new Request(URL, {
        method: "POST",
        headers: { "content-type": "text/plain", authorization: `Bearer ${token}` },
        body: "{}",
      }),
      dependencies(store),
    );
    expect(response.status).toBe(415);
  });

  it("requires verification before answering questions about amounts", async () => {
    const { store, token } = await granted(VALID_BILL);
    const provider = providerReturning(draftResponse("meaning", MEANING));

    const response = await handleQuestionRequest(
      questionRequest(token),
      dependencies(store, provider),
    );

    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "verification_required",
    );
    expect(provider.calls).toHaveLength(0);
  });
});

describe("POST /api/bills/questions — answers", () => {
  it("returns a validated meaning answer with no-store", async () => {
    const { store, token } = await verified(VALID_BILL);
    const provider = providerReturning(draftResponse("meaning", MEANING));

    const response = await handleQuestionRequest(
      questionRequest(token, { question: "What does insurance approved mean?", language: "en" }),
      dependencies(store, provider),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = (await response.json()) as QuestionAnswerResponse;
    expect(body.validation).toBe("validated");
    expect(body.answer.answerType).toBe("meaning");
    expect(body.answer.answerText).toBe(MEANING);
    expect(body.answer.amountRupees).toBeNull();
    expect(body.answer.question).toBe("What does insurance approved mean?");
    expect(provider.calls).toHaveLength(1);
  });

  it("returns the record's figure for a record_fact question", async () => {
    const { store, token } = await verified(VALID_BILL);
    const provider = providerReturning(
      draftResponse("record_fact", "The bill shows this as outstanding.", "printedAmountDue"),
    );

    const response = await handleQuestionRequest(
      questionRequest(token, { question: "What amount is recorded as due?", language: "en" }),
      dependencies(store, provider),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as QuestionAnswerResponse;
    expect(body.validation).toBe("server_rendered");
    expect(body.answer.answerType).toBe("record_fact");
    expect(body.answer.amountRupees).toBe("10000");
    expect(body.answer.verifiedRecordReference?.billNumber).toBe(VALID_BILL);
  });

  it("answers in Hindi and Kannada", async () => {
    for (const language of ["hi", "kn"] as const) {
      const { store, token } = await verified(VALID_BILL);
      const provider = providerReturning(draftResponse("meaning", "यह एक स्वीकृत राशि है।"));

      const response = await handleQuestionRequest(
        questionRequest(token, { question: "यह क्या है?", language }),
        dependencies(store, provider),
      );

      expect(response.status, language).toBe(200);
      const body = (await response.json()) as QuestionAnswerResponse;
      expect(body.answer.language).toBe(language);
    }
  });

  it("returns 503 without an answer when no provider is configured", async () => {
    const { store, token } = await verified(VALID_BILL);
    const response = await handleQuestionRequest(
      questionRequest(token),
      dependencies(store, null),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: QUESTION_UNAVAILABLE_CODE,
        message: QUESTION_UNAVAILABLE_MESSAGE,
      },
    });
  });
});

describe("POST /api/bills/questions — request hardening", () => {
  it("rejects malformed JSON", async () => {
    const { store, token } = await verified(VALID_BILL);
    const response = await handleQuestionRequest(
      questionRequest(token, "{not json"),
      dependencies(store),
    );
    expect(response.status).toBe(400);
  });

  it("rejects an empty or oversized question and an unsupported language", async () => {
    const { store, token } = await verified(VALID_BILL);
    for (const body of [
      { question: "", language: "en" },
      { question: "   ", language: "en" },
      { question: "a".repeat(501), language: "en" },
      { question: "What is due?", language: "ta" },
      {},
    ]) {
      const response = await handleQuestionRequest(
        questionRequest(token, body),
        dependencies(store),
      );
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("rejects a client-supplied bill number, verdict or amount", async () => {
    const { store, token } = await verified(VALID_BILL);
    for (const body of [
      { question: "What is due?", language: "en", billNumber: DISCREPANT_BILL },
      { question: "What is due?", language: "en", isVerified: true },
      { question: "What is due?", language: "en", outcome: "verified" },
      { question: "What is due?", language: "en", amountRupees: "15000" },
    ]) {
      const response = await handleQuestionRequest(
        questionRequest(token, body),
        dependencies(store),
      );
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("ignores a query-string attempt to retarget the session", async () => {
    const { store, token } = await verified(VALID_BILL);
    const provider = providerReturning(
      draftResponse("record_fact", "The bill shows this as outstanding.", "printedAmountDue"),
    );

    const response = await handleQuestionRequest(
      questionRequest(token, { question: "What is due?", language: "en" }, `?billNumber=${DISCREPANT_BILL}`),
      dependencies(store, provider),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as QuestionAnswerResponse;
    expect(body.answer.amountRupees).toBe("10000");
    expect(body.answer.verifiedRecordReference?.billNumber).toBe(VALID_BILL);
  });

  it("refuses an oversized body while reading it", async () => {
    const { store, token } = await verified(VALID_BILL);
    const oversized = JSON.stringify({ question: "a".repeat(70 * 1024), language: "en" });

    const response = await handleQuestionRequest(
      questionRequest(token, oversized),
      dependencies(store),
    );

    expect(response.status).toBe(413);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "payload_too_large",
    );
  });
});
