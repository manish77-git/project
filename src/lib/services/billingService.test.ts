import { afterEach, describe, expect, it, vi } from "vitest";
import {
  analyzeBill,
  getDemoBill,
  lookupBillByNumber,
} from "./billingService";

const NOTICE = "Read from the uploaded bill — not independently verified.";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface ExtractionOverrides {
  readStatus?: "readable" | "unreadable";
  hospitalName?: unknown;
  billNumber?: unknown;
  billDate?: unknown;
  lineItems?: unknown[];
  totalAmount?: unknown;
  insuranceApprovedAmount?: unknown;
  patientPayableAmount?: unknown;
  warnings?: string[];
}

function extraction(overrides: ExtractionOverrides = {}) {
  return {
    readStatus: "readable",
    hospitalName: {
      value: "CITY GENERAL HOSPITAL",
      evidence: { lineNumber: 1, text: "CITY GENERAL HOSPITAL" },
    },
    billNumber: {
      value: "UNKNOWN-1",
      evidence: { lineNumber: 3, text: "Bill No: UNKNOWN-1" },
    },
    billDate: null,
    lineItems: [
      {
        description: "Consultation Fee",
        amountRupees: "800",
        evidence: { lineNumber: 5, text: "Consultation Fee 800" },
      },
      {
        description: "CBC Blood Test",
        amountRupees: "450",
        evidence: { lineNumber: 6, text: "CBC Blood Test 450" },
      },
    ],
    totalAmount: {
      amountRupees: "2750",
      evidence: { lineNumber: 8, text: "Total Amount: Rs 2,750" },
    },
    insuranceApprovedAmount: null,
    patientPayableAmount: null,
    currency: "INR",
    warnings: [],
    notice: NOTICE,
    ...overrides,
  };
}

const recordAmounts = {
  billTotalAfterDiscounts: "15000",
  insuranceApprovedButNotPaid: "5000",
  insurancePaidOrCredited: "0",
  patientPayments: "10000",
  printedAmountDue: "10000",
};

function explanationResponse(
  amounts: Record<string, string | null> = recordAmounts,
  billNumber = "INV-2026-0042",
  factAmounts: Record<string, string | null> = amounts,
) {
  const headings: Record<string, string> = {
    billTotalAfterDiscounts: "Bill total after discounts",
    insuranceApprovedButNotPaid: "Insurance approved but not paid",
    insurancePaidOrCredited: "Insurance paid or credited",
    patientPayments: "Amount you have paid",
    printedAmountDue: "Amount shown as due",
  };

  const sections = Object.entries(amounts).map(([fieldKey, amountRupees]) => ({
    fieldKey,
    heading: headings[fieldKey],
    explanation: `Meaning of ${headings[fieldKey]}.`,
    amountRupees,
    status: amountRupees === null ? "missing" : "found",
  }));

  return {
    validation: "validated",
    explanation: {
      language: "en",
      explanationText: "Generated narrative.",
      verifiedRecordReference: { recordId: `mock:${billNumber}`, billNumber },
      financialFactsUsed: Object.entries(factAmounts).map(([fieldKey, amountRupees]) => ({
        fieldKey,
        amountRupees,
        pageNumber: null,
      })),
      datesUsed: [],
      warnings: [],
      notice: "Generated from hospital-provided bill information.",
    },
    sections,
  };
}

function financialsResponse(amounts: Record<string, string | null> = recordAmounts) {
  const body: Record<string, unknown> = {
    currency: "INR",
    documentWarnings: [],
  };
  for (const [key, amountRupees] of Object.entries(amounts)) {
    body[key] = {
      amountRupees,
      status: amountRupees === null ? "missing" : "found",
      evidence: null,
      pageNumber: null,
      confirmedByUser: false,
    };
  }
  return body;
}

type Handler = () => Response | Promise<Response>;

function mockServer(routes: Record<string, Handler>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = new URL(url, "http://localhost").pathname;
    const key = `${init?.method ?? "GET"} ${path}`;
    const handler = routes[key];
    if (!handler) throw new Error(`Unexpected request: ${key}`);
    return handler();
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const file = () =>
  new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], "bill.jpg", {
    type: "image/jpeg",
  });

function verifiedRoutes(overrides: Record<string, Handler> = {}) {
  return {
    "POST /api/bills/access/challenge": () =>
      json({
        challengeId: "c".repeat(24),
        billNumber: "INV-2026-0042",
        expiresAt: new Date().toISOString(),
        attemptsRemaining: 3,
      }),
    "POST /api/bills/access/verify": () =>
      json({
        accessToken: "t".repeat(32),
        expiresAt: new Date().toISOString(),
        billNumber: "INV-2026-0042",
      }),
    "POST /api/bills/verify": () =>
      json({
        outcome: "verified",
        message: "The hospital's record matches this bill.",
        discrepancyKeys: [],
      }),
    "POST /api/bills/explain": () => json(explanationResponse()),
    "GET /api/bills/financials": () => json(financialsResponse()),
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("analyzeBill — reads the uploaded bill, never a sample", () => {
  it("shows the bill's own amount as unverified instead of ₹3,100", async () => {
    mockServer({
      "POST /api/bills/extract": () => json(extraction()),
    });

    const result = await analyzeBill(file(), "en");

    expect(result.source).toBe("document");
    expect(result.verification.state).toBe("unverified");
    expect(result.totalInr).toBe("2750");
    expect(result.items.map((item) => item.amountInr)).toEqual(["800", "450"]);
    expect(result.readStatus).toBe("readable");
    expect(JSON.stringify(result)).not.toContain("3100");
    expect(JSON.stringify(result)).not.toContain("Sunrise");
  });

  it("labels every OCR figure as read from the bill, not verified", async () => {
    mockServer({
      "POST /api/bills/extract": () => json(extraction()),
    });

    const result = await analyzeBill(file(), "en");

    expect(result.verification.state).not.toBe("verified");
    expect(result.verification.message).toMatch(/not independently verified|access code/i);
    expect(result.items.every((item) => item.id.startsWith("document-"))).toBe(true);
  });

  it("keeps two different uploads separate", async () => {
    const first = extraction({ totalAmount: { amountRupees: "2750", evidence: { lineNumber: 8, text: "Total Amount: Rs 2,750" } } });
    const second = extraction({
      billNumber: { value: "OTHER-9", evidence: { lineNumber: 3, text: "Bill No: OTHER-9" } },
      totalAmount: { amountRupees: "8125", evidence: { lineNumber: 8, text: "Total Amount: Rs 8,125" } },
      lineItems: [],
    });
    let call = 0;
    mockServer({
      "POST /api/bills/extract": () => json(call++ === 0 ? first : second),
    });

    const one = await analyzeBill(file(), "en");
    const two = await analyzeBill(file(), "en");

    expect(one.totalInr).toBe("2750");
    expect(two.totalInr).toBe("8125");
    expect(two.billNumber).toBe("OTHER-9");
    expect(two.items).not.toEqual(one.items);
  });

  it("returns null amounts when the bill prints none", async () => {
    mockServer({
      "POST /api/bills/extract": () =>
        json(
          extraction({
            lineItems: [],
            totalAmount: null,
            insuranceApprovedAmount: null,
            patientPayableAmount: null,
          }),
        ),
    });

    const result = await analyzeBill(file(), "en");

    expect(result.totalInr).toBeNull();
    expect(result.insuranceApprovedInr).toBeNull();
    expect(result.patientPayableInr).toBeNull();
    expect(result.items).toEqual([]);
    expect(result.verification.state).toBe("unverified");
  });

  it("says explicitly when the bill could not be read", async () => {
    mockServer({
      "POST /api/bills/extract": () =>
        json(
          extraction({
            readStatus: "unreadable",
            hospitalName: null,
            billNumber: null,
            lineItems: [],
            totalAmount: null,
            warnings: ["No readable text was found in the uploaded bill, so no figures are shown."],
          }),
        ),
    });

    const result = await analyzeBill(file(), "en");

    expect(result.readStatus).toBe("unreadable");
    expect(result.verification.state).toBe("unavailable");
    expect(result.items).toEqual([]);
    expect(result.totalInr).toBeNull();
  });

  it("returns no figures when the extraction request fails", async () => {
    mockServer({
      "POST /api/bills/extract": () => json({ error: { code: "ocr_unavailable", message: "OCR is unavailable." } }, 503),
    });

    const result = await analyzeBill(file(), "en");

    expect(result.readStatus).toBe("unavailable");
    expect(result.totalInr).toBeNull();
    expect(result.items).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("3100");
  });
});

describe("analyzeBill — unmatched bills never receive a mock report", () => {
  it("keeps document figures and reports bill_not_found", async () => {
    const fetchMock = mockServer({
      "POST /api/bills/extract": () => json(extraction()),
      "POST /api/bills/access/challenge": () =>
        json({
          challengeId: "c".repeat(24),
          billNumber: "UNKNOWN-1",
          expiresAt: new Date().toISOString(),
          attemptsRemaining: 3,
        }),
      "POST /api/bills/access/verify": () =>
        json({ accessToken: "t".repeat(32), expiresAt: new Date().toISOString(), billNumber: "UNKNOWN-1" }),
      "POST /api/bills/verify": () =>
        json({
          outcome: "bill_not_found",
          message: "No record of this bill was found at the hospital.",
          discrepancyKeys: [],
        }),
    });

    const result = await analyzeBill(file(), "en", undefined, { accessCode: "CODE-123" });

    expect(result.source).toBe("document");
    expect(result.verification.state).toBe("bill_not_found");
    expect(result.verification.message).toMatch(/no record/i);
    expect(result.totalInr).toBe("2750");
    expect(JSON.stringify(result)).not.toContain("15000");
    const paths = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(paths.some((path) => path.includes("/api/bills/explain"))).toBe(false);
    expect(paths.some((path) => path.includes("/api/bills/financials"))).toBe(false);
  });

  it("never uses a record when the access code is rejected", async () => {
    mockServer({
      "POST /api/bills/extract": () => json(extraction()),
      "POST /api/bills/access/challenge": () =>
        json({
          challengeId: "c".repeat(24),
          billNumber: "UNKNOWN-1",
          expiresAt: new Date().toISOString(),
          attemptsRemaining: 3,
        }),
      "POST /api/bills/access/verify": () =>
        json({ error: { code: "access_denied", message: "That access code could not be accepted." } }, 401),
    });

    const result = await analyzeBill(file(), "en", undefined, { accessCode: "WRONG" });

    expect(result.source).toBe("document");
    expect(result.verification.state).toBe("access_denied");
    expect(result.totalInr).toBe("2750");
  });
});

describe("analyzeBill — verified records are authoritative", () => {
  it("shows record amounts, not the OCR amount, for a verified bill", async () => {
    const document = extraction({
      billNumber: {
        value: "INV-2026-0042",
        evidence: { lineNumber: 3, text: "Bill No: INV-2026-0042" },
      },
      totalAmount: {
        amountRupees: "9999",
        evidence: { lineNumber: 8, text: "Total Amount: Rs 9,999" },
      },
    });
    mockServer({
      "POST /api/bills/extract": () => json(document),
      ...verifiedRoutes({
        "POST /api/bills/verify": () =>
          json({
            outcome: "verified",
            message: "The hospital's record matches this bill.",
            discrepancyKeys: [],
          }),
      }),
    });

    const result = await analyzeBill(file(), "en", undefined, { accessCode: "CODE-123" });

    expect(result.source).toBe("verified");
    expect(result.verification.state).toBe("verified");
    expect(result.totalInr).toBe("15000");
    expect(result.insuranceApprovedInr).toBe("5000");
    expect(result.patientPayableInr).toBe("10000");
    expect(JSON.stringify(result)).not.toContain("9999");
  });

  it("sends extracted amounts as candidates so a discrepancy can only add to the record's", async () => {
    const fetchMock = mockServer({
      "POST /api/bills/extract": () => json(extraction()),
      ...verifiedRoutes(),
    });

    await analyzeBill(file(), "en", undefined, { accessCode: "CODE-123" });

    const verifyCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/api/bills/verify"),
    );
    expect(verifyCall).toBeDefined();
    const body = JSON.parse(String(verifyCall?.[1]?.body));
    expect(body.financialCandidates).toEqual([
      { fieldKey: "billTotalAfterDiscounts", amountRupees: "2750" },
    ]);
    expect(body).not.toHaveProperty("outcome");
    expect(body).not.toHaveProperty("isVerified");
  });

  it("rejects AI amounts that do not match the record and falls back to recorded amounts", async () => {
    const invented = { ...recordAmounts, billTotalAfterDiscounts: "7777" };
    mockServer({
      "POST /api/bills/extract": () =>
        json(
          extraction({
            billNumber: {
              value: "INV-2026-0042",
              evidence: { lineNumber: 3, text: "Bill No: INV-2026-0042" },
            },
          }),
        ),
      ...verifiedRoutes({
        // Facts are the server-rendered record; the prose sections claim a
        // different amount. The client must refuse the mismatch.
        "POST /api/bills/explain": () =>
          json(explanationResponse(invented, "INV-2026-0042", recordAmounts)),
      }),
    });

    const result = await analyzeBill(file(), "en", undefined, { accessCode: "CODE-123" });

    expect(result.source).toBe("verified");
    expect(result.totalInr).toBe("15000");
    expect(JSON.stringify(result)).not.toContain("7777");
  });

  it("ignores an explanation that refers to a different bill", async () => {
    mockServer({
      "POST /api/bills/extract": () =>
        json(
          extraction({
            billNumber: {
              value: "INV-2026-0042",
              evidence: { lineNumber: 3, text: "Bill No: INV-2026-0042" },
            },
          }),
        ),
      ...verifiedRoutes({
        "POST /api/bills/explain": () => json(explanationResponse(recordAmounts, "OTHER-BILL-9")),
      }),
    });

    const result = await analyzeBill(file(), "en", undefined, { accessCode: "CODE-123" });

    expect(result.source).toBe("verified");
    expect(result.billNumber).toBe("INV-2026-0042");
    expect(result.totalInr).toBe("15000");
  });

  it("keeps verification when the AI is unavailable, using record amounts", async () => {
    mockServer({
      "POST /api/bills/extract": () =>
        json(
          extraction({
            billNumber: {
              value: "INV-2026-0042",
              evidence: { lineNumber: 3, text: "Bill No: INV-2026-0042" },
            },
          }),
        ),
      ...verifiedRoutes({
        "POST /api/bills/explain": () =>
          json({ error: { code: "explanation_unavailable", message: "No key." } }, 503),
      }),
    });

    const result = await analyzeBill(file(), "en", undefined, { accessCode: "CODE-123" });

    expect(result.source).toBe("verified");
    expect(result.totalInr).toBe("15000");
    expect(result.items.every((item) => item.id in recordAmounts)).toBe(true);
  });

  it("does not invent record amounts when verification succeeds but no figures can be loaded", async () => {
    mockServer({
      "POST /api/bills/extract": () =>
        json(
          extraction({
            billNumber: {
              value: "INV-2026-0042",
              evidence: { lineNumber: 3, text: "Bill No: INV-2026-0042" },
            },
          }),
        ),
      ...verifiedRoutes({
        "POST /api/bills/explain": () => json({ error: { code: "explanation_failed" } }, 500),
        "GET /api/bills/financials": () => json({ error: { code: "verification_failed" } }, 500),
      }),
    });

    const result = await analyzeBill(file(), "en", undefined, { accessCode: "CODE-123" });

    expect(result.source).toBe("document");
    expect(result.verification.state).toBe("unavailable");
    expect(result.totalInr).toBe("2750");
    expect(JSON.stringify(result)).not.toContain("15000");
  });
});

describe("demo data is explicit only", () => {
  it("never returns demo data from analyzeBill", async () => {
    mockServer({
      "POST /api/bills/extract": () => json({ error: { code: "extraction_failed", message: "bad" } }, 500),
    });

    const result = await analyzeBill(file(), "en");

    expect(result.source).not.toBe("demo");
    expect(result.totalInr).toBeNull();
  });

  it("keeps the sample bill available through getDemoBill, clearly labelled", () => {
    const demo = getDemoBill("en");
    expect(demo.source).toBe("demo");
    expect(demo.verification.message).toMatch(/sample/i);
    expect(demo.hospitalName).toMatch(/sample/i);
    expect(demo.warnings.join(" ")).toMatch(/sample/i);
  });

  it("does not hand out sample data from bill-number lookup without a code", async () => {
    const fetchMock = mockServer({});
    const response = await lookupBillByNumber("INV-2026-0042", "en");

    expect(response.status).toBe("not_found");
    expect(response.result).toBeUndefined();
    expect(response.message).toMatch(/access code/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("failures never become a fabricated report", () => {
  it("returns no figures and no bill identity when reading times out", async () => {
    vi.useFakeTimers();
    try {
      // A request that only ends when the client aborts, which is exactly what
      // the extraction timeout does. No response ever arrives.
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (_input: RequestInfo | URL, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () =>
                reject(new DOMException("The operation was aborted.", "AbortError")),
              );
            }),
        ),
      );

      const pending = analyzeBill(file(), "en");
      await vi.advanceTimersByTimeAsync(120_000);
      const result = await pending;

      expect(result.readStatus).toBe("unavailable");
      expect(result.verification.state).toBe("unavailable");
      expect(result.totalInr).toBeNull();
      expect(result.items).toEqual([]);
      expect(result.hospitalName).toBeNull();
      expect(result.billNumber).toBeNull();
      expect(JSON.stringify(result)).not.toContain("3100");
      expect(JSON.stringify(result)).not.toContain("Sunrise");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the record's amounts when the explanation request never answers", async () => {
    mockServer({
      "POST /api/bills/extract": () =>
        json(
          extraction({
            billNumber: {
              value: "INV-2026-0042",
              evidence: { lineNumber: 3, text: "Bill No: INV-2026-0042" },
            },
          }),
        ),
      ...verifiedRoutes({
        "POST /api/bills/explain": () => {
          throw new TypeError("network timeout");
        },
      }),
    });

    const result = await analyzeBill(file(), "en", undefined, { accessCode: "CODE-123" });

    // The verified record is authoritative; the failure only removes the AI
    // prose, never the figures and never a substitute sample.
    expect(result.source).toBe("verified");
    expect(result.totalInr).toBe("15000");
    expect(result.items.every((item) => item.id in recordAmounts)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("3100");
  });

  it("says so when the hospital cannot be reached to verify", async () => {
    mockServer({
      "POST /api/bills/extract": () => json(extraction()),
      "POST /api/bills/access/challenge": () => {
        throw new TypeError("connection refused");
      },
    });

    const result = await analyzeBill(file(), "en", undefined, { accessCode: "CODE-123" });

    expect(result.source).toBe("document");
    expect(result.verification.state).toBe("unavailable");
    expect(result.verification.message).toMatch(/no hospital record was checked/i);
    // Only the figures printed on the uploaded bill survive.
    expect(result.totalInr).toBe("2750");
    expect(JSON.stringify(result)).not.toContain("15000");
    expect(JSON.stringify(result)).not.toContain("3100");
  });
});
