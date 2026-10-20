import { describe, expect, it } from "vitest";
import {
  grantAccess,
  TEST_NOW,
  TEST_SECRET,
} from "@/lib/access/__fixtures__/test-access";
import {
  createInMemoryAccessStore,
  type AccessSession,
  type AccessStore,
} from "@/lib/access/store";
import { createMockHospitalRecordRepository } from "@/lib/records/mock-records";
import type { QuestionAnswerResponse } from "@/lib/schemas";
import { handleVerifyRequest } from "@/lib/verification/handler";
import {
  createFakeQuestionProvider,
  draftResponse,
  type FakeQuestionProvider,
} from "./__fixtures__/fake-question-provider";
import type { QuestionProvider } from "./provider";
import { answerQuestion, type QuestionServiceResult } from "./service";

const VALID_BILL = "INV-2026-0042";
const DISCREPANT_BILL = "INV-2026-0043";
const UNREGISTERED_BILL = "SUN-2026-7781";
const MISSING_BILL = "MISS-2026-0001";

const repository = createMockHospitalRecordRepository();

const MEANING = "An approved amount is one the insurer has agreed but not settled.";

function providerReturning(raw: string): FakeQuestionProvider {
  return createFakeQuestionProvider(() => raw);
}

/** A session in the exact state a test needs, without a token round-trip. */
function sessionState(
  overrides: Partial<AccessSession> = {},
): AccessSession {
  return {
    sessionId: "session-under-test",
    billNumber: VALID_BILL,
    createdAt: TEST_NOW,
    expiresAt: new Date(TEST_NOW.getTime() + 15 * 60_000),
    outcome: "verified",
    outcomeAt: TEST_NOW,
    ...overrides,
  };
}

async function verified(
  billNumber: string,
): Promise<{ store: AccessStore; token: string }> {
  const store = createInMemoryAccessStore();
  const grant = await grantAccess(store, { billNumber });
  const response = await handleVerifyRequest(
    new Request("http://localhost:3000/api/bills/verify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${grant.accessToken}`,
      },
      body: "{}",
    }),
    { store, secret: TEST_SECRET, repository, now: () => TEST_NOW },
  );
  expect(response.status).toBe(200);
  return { store, token: grant.accessToken };
}

async function ask(
  options: {
    token?: string | null;
    store?: AccessStore;
    provider?: QuestionProvider;
    body?: unknown;
    now?: Date;
  } = {},
): Promise<QuestionServiceResult> {
  const store = options.store ?? createInMemoryAccessStore();
  const { authorizeSession } = await import("@/lib/access/authorization");
  const request = new Request("http://localhost:3000/api/bills/questions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: JSON.stringify(options.body ?? { question: "What is amount due?", language: "en" }),
  });

  const authorization = await authorizeSession(request, {
    store,
    secret: TEST_SECRET,
    now: options.now ?? TEST_NOW,
  });
  if (!authorization.ok) throw new Error("fixture session was not authorized");

  return answerQuestion({
    session: authorization.session,
    request: options.body ?? { question: "What is amount due?", language: "en" },
    repository,
    provider: options.provider ?? providerReturning(draftResponse("meaning", MEANING)),
    now: options.now ?? TEST_NOW,
  });
}

function answerOf(result: QuestionServiceResult): QuestionAnswerResponse {
  if (result.kind !== "answer") throw new Error(`expected an answer, got ${JSON.stringify(result)}`);
  return result.response;
}

describe("answerQuestion — authorization", () => {
  it("refuses a session that has not verified, without calling the provider", async () => {
    const provider = providerReturning(draftResponse("meaning", MEANING));

    const result = await answerQuestion({
      session: sessionState({ outcome: null, outcomeAt: null }),
      request: { question: "What is due?", language: "en" },
      repository,
      provider,
      now: TEST_NOW,
    });

    expect(result).toMatchObject({ kind: "error", error: { code: "verification_required" } });
    expect(provider.calls).toHaveLength(0);
  });

  it("refuses an expired session", async () => {
    const provider = providerReturning(draftResponse("meaning", MEANING));

    const result = await answerQuestion({
      session: sessionState({ expiresAt: new Date(TEST_NOW.getTime() - 1_000) }),
      request: { question: "What is due?", language: "en" },
      repository,
      provider,
      now: TEST_NOW,
    });

    expect(result).toMatchObject({ kind: "error", error: { code: "session_expired" } });
    expect(provider.calls).toHaveLength(0);
  });

  it("refuses an unknown bill and an unregistered hospital", async () => {
    for (const [billNumber, code] of [
      [MISSING_BILL, "bill_not_found"],
      [UNREGISTERED_BILL, "hospital_not_registered"],
    ] as const) {
      const { store, token } = await verified(billNumber);
      const result = await ask({
        store,
        token,
        provider: providerReturning(draftResponse("meaning", MEANING)),
      });

      expect(result, billNumber).toMatchObject({ kind: "error", error: { code } });
    }
  });
});

describe("answerQuestion — meaning questions", () => {
  it("returns validated model prose for a verified session", async () => {
    const { store, token } = await verified(VALID_BILL);
    const provider = providerReturning(draftResponse("meaning", MEANING));

    const result = await ask({ store, token, provider, body: { question: "What does insurance approved mean?", language: "en" } });
    const answer = answerOf(result).answer;

    expect(answer.answerType).toBe("meaning");
    expect(answer.answerText).toBe(MEANING);
    expect(answer.amountRupees).toBeNull();
    expect(answer.financialFactsUsed).toEqual([]);
    expect(answer.verifiedRecordReference).toBeNull();
    expect(answerOf(result).validation).toBe("validated");
  });

  it("tells the provider the bill is verified and sends no amount", async () => {
    const { store, token } = await verified(VALID_BILL);
    const provider = providerReturning(draftResponse("meaning", MEANING));

    await ask({ store, token, provider });

    expect(provider.calls).toHaveLength(1);
    const call = provider.calls[0]!;
    expect(call.figuresAllowed).toBe(true);
    expect(call.question).toBe("What is amount due?");
    expect(JSON.stringify(call)).not.toContain("15000");
    expect(JSON.stringify(call)).not.toContain(VALID_BILL);
  });

  it("answers in Hindi and Kannada", async () => {
    for (const language of ["hi", "kn"] as const) {
      const { store, token } = await verified(VALID_BILL);
      const provider = providerReturning(
        draftResponse("meaning", "यह एक स्वीकृत राशि है।"),
      );

      const result = await ask({ store, token, provider, body: { question: "यह क्या है?", language } });
      const answer = answerOf(result).answer;

      expect(answer.language).toBe(language);
      expect(provider.calls[0]?.language).toBe(language);
    }
  });
});

describe("answerQuestion — recorded facts", () => {
  it("renders the record's exact value and discards the model's sentence", async () => {
    const { store, token } = await verified(VALID_BILL);
    const provider = providerReturning(
      draftResponse("record_fact", "MODEL_SENTENCE_SENTINEL", "printedAmountDue"),
    );

    const result = await ask({ store, token, provider, body: { question: "What amount is recorded as due?", language: "en" } });
    const response = answerOf(result);
    const answer = response.answer;

    expect(response.validation).toBe("server_rendered");
    expect(answer.answerType).toBe("record_fact");
    expect(answer.fieldKey).toBe("printedAmountDue");
    expect(answer.amountRupees).toBe("10000");
    expect(answer.financialFactsUsed).toEqual([
      { fieldKey: "printedAmountDue", amountRupees: "10000", pageNumber: null },
    ]);
    expect(answer.verifiedRecordReference?.billNumber).toBe(VALID_BILL);
    expect(answer.answerText).toContain("Hospital record: INR 10,000");
    expect(JSON.stringify(response)).not.toContain("MODEL_SENTENCE_SENTINEL");
  });

  it("agrees with the authoritative record for every field", async () => {
    const record = await repository.findByBillNumber(VALID_BILL);
    if (!record) throw new Error("fixture record missing");

    for (const [fieldKey, expected] of Object.entries(record.recordAmounts)) {
      const { store, token } = await verified(VALID_BILL);
      const provider = providerReturning(
        draftResponse("record_fact", "An amount.", fieldKey as never),
      );

      const answer = answerOf(await ask({ store, token, provider })).answer;
      expect(answer.answerType, fieldKey).toBe("record_fact");
      expect(answer.amountRupees, fieldKey).toBe(expected);
    }
  });

  it("asks which field when the model cannot place the question", async () => {
    const { store, token } = await verified(VALID_BILL);
    const provider = providerReturning(
      JSON.stringify({ type: "record_fact", explanation: "An amount." }),
    );

    const response = answerOf(await ask({ store, token, provider }));
    expect(response.validation).toBe("server_rendered");
    expect(response.answer.answerType).toBe("clarification");
    expect(response.answer.amountRupees).toBeNull();
    expect(response.answer.answerText).toContain("Bill total after discounts");
  });
});

describe("answerQuestion — discrepancy questions", () => {
  it("names the differing fields and no figure on a discrepant bill", async () => {
    const { store, token } = await verified(DISCREPANT_BILL);
    const provider = providerReturning(draftResponse("discrepancy", "There is a difference."));

    const result = await ask({ store, token, provider, body: { question: "Why is my bill different?", language: "en" } });
    const response = answerOf(result);
    const answer = response.answer;

    expect(response.validation).toBe("server_rendered");
    expect(answer.answerType).toBe("discrepancy");
    expect(answer.amountRupees).toBeNull();
    expect(answer.financialFactsUsed).toEqual([]);
    expect(answer.answerText).toContain("Insurance approved but not paid");

    const serialised = JSON.stringify(response);
    for (const figure of ["8000", "7000", "15000", "10000", "5000"]) {
      expect(serialised).not.toContain(figure);
    }
    expect(provider.calls[0]?.figuresAllowed).toBe(false);
  });

  it("releases no figure when a discrepant bill is asked for one", async () => {
    const { store, token } = await verified(DISCREPANT_BILL);
    const provider = providerReturning(
      draftResponse("record_fact", "An amount.", "printedAmountDue"),
    );

    const response = answerOf(await ask({ store, token, provider }));
    expect(response.answer.answerType).toBe("unsupported");
    expect(response.answer.amountRupees).toBeNull();
    expect(response.answer.financialFactsUsed).toEqual([]);
    expect(response.answer.verifiedRecordReference).toBeNull();
    // The bill WAS checked, so the refusal must not claim it was not.
    expect(response.answer.answerText).toContain("do not match the hospital's record");
    expect(response.answer.answerText).not.toContain("checked yet");
    expect(JSON.stringify(response)).not.toContain("7000");
    expect(JSON.stringify(response)).not.toContain("8000");
  });

  it("says there is no difference when the bill verified", async () => {
    const { store, token } = await verified(VALID_BILL);
    const provider = providerReturning(draftResponse("discrepancy", "There is a difference."));

    const response = answerOf(await ask({ store, token, provider }));
    expect(response.answer.answerType).toBe("unsupported");
    expect(response.answer.answerText).toContain("did not find a difference");
    expect(response.answer.amountRupees).toBeNull();
  });
});

describe("answerQuestion — unsupported and ambiguous questions", () => {
  it("passes an unsupported question through as model prose with no figure", async () => {
    const { store, token } = await verified(VALID_BILL);
    const text = "I cannot answer that here. Please ask your insurer.";
    const provider = providerReturning(draftResponse("unsupported", text));

    const response = answerOf(await ask({ store, token, provider, body: { question: "Should I sue the hospital?", language: "en" } }));
    expect(response.validation).toBe("validated");
    expect(response.answer.answerType).toBe("unsupported");
    expect(response.answer.answerText).toBe(text);
    expect(response.answer.amountRupees).toBeNull();
  });

  it("returns a clarification when the model says the question is ambiguous", async () => {
    const { store, token } = await verified(VALID_BILL);
    const text = "Which amount do you mean?";
    const provider = providerReturning(draftResponse("ambiguous", text));

    const response = answerOf(await ask({ store, token, provider }));
    expect(response.answer.answerType).toBe("clarification");
    expect(response.answer.answerText).toBe(text);
    expect(response.answer.amountRupees).toBeNull();
  });
});

describe("answerQuestion — rejected drafts", () => {
  it("falls back when the model invents an amount, a date or a promise", async () => {
    for (const explanation of [
      "The amount due is 9999.",
      "It was settled on 5 March.",
      "Your insurance covers this, so you owe nothing.",
      "This is confirmed by the hospital.",
    ]) {
      const { store, token } = await verified(VALID_BILL);
      const response = answerOf(
        await ask({ store, token, provider: providerReturning(draftResponse("meaning", explanation)) }),
      );

      expect(response.validation, explanation).toBe("server_rendered");
      expect(response.answer.answerType, explanation).toBe("unavailable");
      expect(JSON.stringify(response), explanation).not.toContain("9999");
      expect(JSON.stringify(response), explanation).not.toContain(explanation);
    }
  });

  it("falls back on timeout, provider error and malformed output", async () => {
    for (const provider of [
      createFakeQuestionProvider(() => {
        throw new Error("timeout detail");
      }),
      providerReturning("not json"),
      providerReturning(JSON.stringify({ type: "meaning" })),
    ]) {
      const { store, token } = await verified(VALID_BILL);
      const response = answerOf(await ask({ store, token, provider }));

      expect(response.validation).toBe("server_rendered");
      expect(response.answer.answerType).toBe("unavailable");
      expect(JSON.stringify(response)).not.toContain("timeout detail");
    }
  });
});

describe("answerQuestion — request hardening", () => {
  it("rejects an empty, oversized, malformed or retargeted request", async () => {
    const { store, token } = await verified(VALID_BILL);
    const provider = providerReturning(draftResponse("meaning", MEANING));

    for (const body of [
      { question: "", language: "en" },
      { question: "a".repeat(501), language: "en" },
      { question: "What is due?", language: "ta" },
      { question: "What is due?", language: "en", billNumber: DISCREPANT_BILL },
      { question: "What is due?", language: "en", isVerified: true },
      { question: "What is due?", language: "en", amountRupees: "15000" },
      {},
    ]) {
      const result = await ask({ store, token, provider, body });
      expect(result, JSON.stringify(body)).toMatchObject({
        kind: "error",
        error: { code: "invalid_request" },
      });
    }

    expect(provider.calls).toHaveLength(0);
  });
});
