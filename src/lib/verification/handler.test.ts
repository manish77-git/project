import { describe, expect, it } from "vitest";
import { grantAccess, TEST_CODE, TEST_NOW, TEST_SECRET } from "@/lib/access/__fixtures__/test-access";
import { createInMemoryAccessStore, type AccessStore } from "@/lib/access/store";
import { createMockHospitalRecordRepository } from "@/lib/records/mock-records";
import { handleFinancialsRequest, handleVerifyRequest, type VerificationHandlerDependencies } from "./handler";

const VERIFY_URL = "http://localhost:3000/api/bills/verify";
const FINANCIALS_URL = "http://localhost:3000/api/bills/financials";

const VALID_BILL = "INV-2026-0042";
const DISCREPANT_BILL = "INV-2026-0043";
const UNREGISTERED_BILL = "SUN-2026-7781";

const repository = createMockHospitalRecordRepository();

function dependencies(store: AccessStore, secret: string | null = TEST_SECRET): VerificationHandlerDependencies {
  return { store, secret, repository, now: () => TEST_NOW };
}

/** A store holding a real grant (access code answered) for one bill. */
async function granted(billNumber: string): Promise<{ store: AccessStore; token: string }> {
  const store = createInMemoryAccessStore();
  const grant = await grantAccess(store, { billNumber, code: TEST_CODE });
  return { store, token: grant.accessToken };
}

function verifyRequest(token: string | null, body: unknown = {}): Request {
  return new Request(VERIFY_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function financialsRequest(token: string | null, query = ""): Request {
  return new Request(`${FINANCIALS_URL}${query}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("POST /api/bills/verify — authorization", () => {
  it("refuses a request with no token", async () => {
    const store = createInMemoryAccessStore();
    const response = await handleVerifyRequest(verifyRequest(null), dependencies(store));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "access_denied",
        message: "A valid access code session is required to view this bill.",
      },
    });
  });

  it("refuses a forged token", async () => {
    const store = createInMemoryAccessStore();
    const forged = `Bearer ${Buffer.from("{}").toString("base64url")}.signature`;
    const response = await handleVerifyRequest(verifyRequest(forged), dependencies(store));
    expect(response.status).toBe(401);
  });

  it("refuses a token whose session was never created", async () => {
    const store = createInMemoryAccessStore();
    const other = createInMemoryAccessStore();
    const grant = await grantAccess(other);

    // Valid signature, unknown session: the server keeps its own record of
    // who answered a challenge, and this token names one it never issued.
    const response = await handleVerifyRequest(
      verifyRequest(grant.accessToken),
      dependencies(store),
    );
    expect(response.status).toBe(401);
  });

  it("fails closed when no secret is configured", async () => {
    const store = createInMemoryAccessStore();
    const response = await handleVerifyRequest(verifyRequest(null), dependencies(store, null));
    expect(response.status).toBe(503);
  });
});

describe("POST /api/bills/verify — outcomes", () => {
  it("verifies a matching bill and returns only the contract fields", async () => {
    const { store, token } = await granted(VALID_BILL);
    const response = await handleVerifyRequest(verifyRequest(token), dependencies(store));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["discrepancyKeys", "message", "outcome"]);
    expect(body.outcome).toBe("verified");
    expect(body.discrepancyKeys).toEqual([]);
  });

  it("reports an amount discrepancy without any figure", async () => {
    const { store, token } = await granted(DISCREPANT_BILL);
    const response = await handleVerifyRequest(verifyRequest(token), dependencies(store));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { outcome: string; discrepancyKeys: string[] };
    expect(body.outcome).toBe("amounts_differ");
    expect(body.discrepancyKeys).toContain("printedAmountDue");

    const serialised = JSON.stringify(body);
    for (const figure of ["8000", "7000"]) {
      expect(serialised).not.toContain(figure);
    }
  });

  it("reports an unregistered hospital", async () => {
    const { store, token } = await granted(UNREGISTERED_BILL);
    const response = await handleVerifyRequest(verifyRequest(token), dependencies(store));

    expect(response.status).toBe(200);
    expect(((await response.json()) as { outcome: string }).outcome).toBe(
      "hospital_not_registered",
    );
  });

  it("reports a bill that is not on file", async () => {
    const { store, token } = await granted("INV-2026-9999");
    const response = await handleVerifyRequest(verifyRequest(token), dependencies(store));

    expect(response.status).toBe(200);
    expect(((await response.json()) as { outcome: string }).outcome).toBe("bill_not_found");
  });

  it("rejects a browser-supplied verified flag instead of honouring it", async () => {
    const { store, token } = await granted(VALID_BILL);
    const response = await handleVerifyRequest(
      verifyRequest(token, { isVerified: true }),
      dependencies(store),
    );

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "invalid_request",
    );
  });

  it("rejects a wrong content type", async () => {
    const { store, token } = await granted(VALID_BILL);
    const response = await handleVerifyRequest(
      new Request(VERIFY_URL, {
        method: "POST",
        headers: { "content-type": "text/plain", authorization: `Bearer ${token}` },
        body: "{}",
      }),
      dependencies(store),
    );
    expect(response.status).toBe(415);
  });
});

describe("GET /api/bills/financials — protected release", () => {
  it("refuses a request with no token", async () => {
    const store = createInMemoryAccessStore();
    const response = await handleFinancialsRequest(financialsRequest(null), dependencies(store));
    expect(response.status).toBe(401);
  });

  it("refuses to release anything before verification has run", async () => {
    const { store, token } = await granted(VALID_BILL);
    const response = await handleFinancialsRequest(financialsRequest(token), dependencies(store));

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("verification_required");
  });

  it("releases the hospital's amounts only for a verified session", async () => {
    const { store, token } = await granted(VALID_BILL);
    await handleVerifyRequest(verifyRequest(token), dependencies(store));

    const response = await handleFinancialsRequest(financialsRequest(token), dependencies(store));
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, { amountRupees: string | null }>;
    expect(body.printedAmountDue?.amountRupees).toBe("10000");
    expect(body.insuranceApprovedButNotPaid?.amountRupees).toBe("5000");
    expect(body.currency).toBe("INR");
  });

  it("withholds every figure when the amounts differ, returning only the field keys", async () => {
    const { store, token } = await granted(DISCREPANT_BILL);
    await handleVerifyRequest(verifyRequest(token), dependencies(store));

    const response = await handleFinancialsRequest(financialsRequest(token), dependencies(store));
    expect(response.status).toBe(409);

    const body = (await response.json()) as {
      error: { code: string; discrepancyKeys?: string[] };
    };
    expect(body.error.code).toBe("amounts_differ");
    expect(body.error.discrepancyKeys).toContain("insuranceApprovedButNotPaid");

    const serialised = JSON.stringify(body);
    for (const figure of ["8000", "7000", "15000"]) {
      expect(serialised).not.toContain(figure);
    }
    expect(serialised).not.toContain("amountRupees");
  });

  it("returns no amounts for a bill that is not on file", async () => {
    const { store, token } = await granted("INV-2026-9999");
    await handleVerifyRequest(verifyRequest(token), dependencies(store));

    const response = await handleFinancialsRequest(financialsRequest(token), dependencies(store));
    expect(response.status).toBe(404);
    const serialised = JSON.stringify(await response.json());
    expect(serialised).not.toContain("amountRupees");
  });

  it("returns nothing for an unregistered hospital", async () => {
    const { store, token } = await granted(UNREGISTERED_BILL);
    await handleVerifyRequest(verifyRequest(token), dependencies(store));

    const response = await handleFinancialsRequest(financialsRequest(token), dependencies(store));
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "hospital_not_registered",
    );
  });

  it("ignores an attempt to name another bill in the query string", async () => {
    // There is no bill parameter to tamper with: the session decides. Even a
    // caller who asks for the discrepant bill gets its own bill's figures.
    const { store, token } = await granted(VALID_BILL);
    await handleVerifyRequest(verifyRequest(token), dependencies(store));

    const response = await handleFinancialsRequest(
      financialsRequest(token, `?billNumber=${DISCREPANT_BILL}&isVerified=true`),
      dependencies(store),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, { amountRupees: string | null }>;
    expect(body.printedAmountDue?.amountRupees).toBe("10000");
  });

  it("fails closed when no secret is configured", async () => {
    const store = createInMemoryAccessStore();
    const response = await handleFinancialsRequest(financialsRequest(null), dependencies(store, null));
    expect(response.status).toBe(503);
  });
});
