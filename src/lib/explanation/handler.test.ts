import { describe, expect, it } from "vitest";
import {
  grantAccess,
  TEST_NOW,
  TEST_SECRET,
} from "@/lib/access/__fixtures__/test-access";
import { createInMemoryAccessStore, type AccessStore } from "@/lib/access/store";
import { createMockHospitalRecordRepository } from "@/lib/records/mock-records";
import type { ExplanationResponse } from "@/lib/schemas";
import { handleVerifyRequest } from "@/lib/verification/handler";
import {
  createFakeExplanationProvider,
  structuredDraftResponse,
  type FakeExplanationProvider,
} from "./__fixtures__/fake-explanation-provider";
import {
  EXPLANATION_UNAVAILABLE_CODE,
  EXPLANATION_UNAVAILABLE_MESSAGE,
  handleExplanationRequest,
  type ExplanationHandlerDependencies,
} from "./handler";
import type { ExplanationProvider } from "./provider";

const EXPLAIN_URL = "http://localhost:3000/api/bills/explain";
const VALID_BILL = "INV-2026-0042";
const DISCREPANT_BILL = "INV-2026-0043";
const UNREGISTERED_BILL = "SUN-2026-7781";
const MISSING_BILL = "MISS-2026-0001";

const repository = createMockHospitalRecordRepository();

function validProvider(): FakeExplanationProvider {
  return createFakeExplanationProvider(() =>
    structuredDraftResponse("This field is explained in simple words."),
  );
}

function dependencies(
  store: AccessStore,
  provider: ExplanationProvider | null = validProvider(),
  secret: string | null = TEST_SECRET,
): ExplanationHandlerDependencies {
  return { store, secret, provider, repository, now: () => TEST_NOW };
}

function explainRequest(
  token: string | null,
  body: unknown = { language: "en" },
  query = "",
): Request {
  return new Request(`${EXPLAIN_URL}${query}`, {
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

describe("POST /api/bills/explain — access gate", () => {
  it("refuses a request with no token", async () => {
    const store = createInMemoryAccessStore();
    const response = await handleExplanationRequest(
      explainRequest(null),
      dependencies(store),
    );

    expect(response.status).toBe(401);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "access_denied",
    );
  });

  it("refuses an expired access session without calling the provider", async () => {
    const store = createInMemoryAccessStore();
    const grant = await grantAccess(store, {
      billNumber: VALID_BILL,
      now: new Date(TEST_NOW.getTime() - 20 * 60_000),
    });
    const provider = validProvider();
    const response = await handleExplanationRequest(
      explainRequest(grant.accessToken),
      dependencies(store, provider),
    );

    expect(response.status).toBe(401);
    expect(provider.calls).toHaveLength(0);
  });

  it("fails closed when no secret is configured", async () => {
    const store = createInMemoryAccessStore();
    const response = await handleExplanationRequest(
      explainRequest(null),
      dependencies(store, null, null),
    );
    expect(response.status).toBe(503);
  });

  it("requires a JSON request", async () => {
    const { store, token } = await granted(VALID_BILL);
    const response = await handleExplanationRequest(
      new Request(EXPLAIN_URL, {
        method: "POST",
        headers: { "content-type": "text/plain", authorization: `Bearer ${token}` },
        body: "{}",
      }),
      dependencies(store),
    );
    expect(response.status).toBe(415);
  });

  it("requires verification before an explanation", async () => {
    const { store, token } = await granted(VALID_BILL);
    const provider = validProvider();
    const response = await handleExplanationRequest(
      explainRequest(token),
      dependencies(store, provider),
    );

    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "verification_required",
    );
    expect(provider.calls).toHaveLength(0);
  });
});

describe("POST /api/bills/explain — authorization outcomes", () => {
  it("refuses a bill whose amounts differ, returning only field keys", async () => {
    const { store, token } = await verified(DISCREPANT_BILL);
    const provider = validProvider();
    const response = await handleExplanationRequest(
      explainRequest(token),
      dependencies(store, provider),
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      error: { code: string; discrepancyKeys?: string[] };
    };
    expect(body.error.code).toBe("amounts_differ");
    expect(body.error.discrepancyKeys).toEqual([
      "insuranceApprovedButNotPaid",
      "patientPayments",
      "printedAmountDue",
    ]);
    expect(provider.calls).toHaveLength(0);

    const serialised = JSON.stringify(body);
    for (const figure of ["8000", "7000", "15000"]) {
      expect(serialised).not.toContain(figure);
    }
  });

  it("refuses a bill with no record", async () => {
    const { store, token } = await verified(MISSING_BILL);
    const provider = validProvider();
    const response = await handleExplanationRequest(
      explainRequest(token),
      dependencies(store, provider),
    );

    expect(response.status).toBe(404);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "bill_not_found",
    );
    expect(provider.calls).toHaveLength(0);
  });

  it("refuses an unregistered hospital", async () => {
    const { store, token } = await verified(UNREGISTERED_BILL);
    const provider = validProvider();
    const response = await handleExplanationRequest(
      explainRequest(token),
      dependencies(store, provider),
    );

    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "hospital_not_registered",
    );
    expect(provider.calls).toHaveLength(0);
  });
});

describe("POST /api/bills/explain — validated public response", () => {
  it("returns the validated explanation for a verified session", async () => {
    const { store, token } = await verified(VALID_BILL);
    const provider = validProvider();
    const response = await handleExplanationRequest(
      explainRequest(token),
      dependencies(store, provider),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = (await response.json()) as ExplanationResponse;
    expect(body.validation).toBe("validated");
    expect(body.sections).toHaveLength(5);
    expect(body.explanation.language).toBe("en");
    expect(body.explanation.financialFactsUsed).toHaveLength(5);
    expect(body.explanation.datesUsed).toEqual([]);
    expect(body.sections[0]?.amountRupees).toBe("15000");
    expect(provider.calls).toHaveLength(1);

    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain("confirmedByUser");
    expect(serialised).not.toContain("INV-2026-0043");
  });

  it("returns 503 without a draft when no provider is configured", async () => {
    const { store, token } = await verified(VALID_BILL);
    const response = await handleExplanationRequest(
      explainRequest(token),
      dependencies(store, null),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: EXPLANATION_UNAVAILABLE_CODE,
        message: EXPLANATION_UNAVAILABLE_MESSAGE,
      },
    });
  });

  it("falls back to a server template when the draft is unsafe", async () => {
    const { store, token } = await verified(VALID_BILL);
    const provider = createFakeExplanationProvider(() =>
      structuredDraftResponse("RAW_DRAFT_SENTINEL: you must pay 999999."),
    );
    const response = await handleExplanationRequest(
      explainRequest(token),
      dependencies(store, provider),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ExplanationResponse;
    expect(body.validation).toBe("server_template");
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain("RAW_DRAFT_SENTINEL");
    expect(serialised).not.toContain("999999");
    expect(body.sections[0]?.amountRupees).toBe("15000");
  });

  it("falls back on provider timeout or malformed output", async () => {
    for (const provider of [
      createFakeExplanationProvider(() => {
        throw new Error("timeout detail");
      }),
      createFakeExplanationProvider(() => "not json"),
    ]) {
      const { store, token } = await verified(VALID_BILL);
      const response = await handleExplanationRequest(
        explainRequest(token),
        dependencies(store, provider),
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as ExplanationResponse;
      expect(body.validation).toBe("server_template");
      expect(JSON.stringify(body)).not.toContain("timeout detail");
    }
  });
});

describe("POST /api/bills/explain — request hardening", () => {
  it("rejects an unsupported language without calling the provider", async () => {
    const { store, token } = await verified(VALID_BILL);
    const provider = validProvider();
    const response = await handleExplanationRequest(
      explainRequest(token, { language: "ta" }),
      dependencies(store, provider),
    );

    expect(response.status).toBe(400);
    expect(provider.calls).toHaveLength(0);
  });

  it("rejects a client-supplied verified flag or bill number", async () => {
    const { store, token } = await verified(VALID_BILL);
    for (const body of [
      { language: "en", isVerified: true },
      { language: "en", billNumber: DISCREPANT_BILL },
    ]) {
      const response = await handleExplanationRequest(
        explainRequest(token, body),
        dependencies(store),
      );
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("ignores query-string attempts to retarget the session", async () => {
    const { store, token } = await verified(VALID_BILL);
    const response = await handleExplanationRequest(
      explainRequest(token, { language: "en" }, `?billNumber=${DISCREPANT_BILL}`),
      dependencies(store),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ExplanationResponse;
    expect(body.sections[0]?.amountRupees).toBe("15000");
  });

  it("rejects malformed JSON", async () => {
    const { store, token } = await verified(VALID_BILL);
    const response = await handleExplanationRequest(
      explainRequest(token, "{not json"),
      dependencies(store),
    );

    expect(response.status).toBe(400);
  });
});
