import { describe, expect, it } from "vitest";
import type { AccessSession } from "@/lib/access/store";
import {
  createMockHospitalRecordRepository,
  MOCK_HOSPITAL_RECORDS,
  type HospitalRecord,
  type HospitalRecordRepository,
} from "@/lib/records/mock-records";
import { EXPLANATION_NOTICE, type VerificationOutcome } from "@/lib/schemas";
import {
  createFakeExplanationProvider,
  structuredDraftResponse,
  validProviderSections,
  type FakeExplanationProvider,
} from "./__fixtures__/fake-explanation-provider";
import { ExplanationProviderError } from "./provider";
import { EXPLANATION_MESSAGES, generateExplanation } from "./service";

const NOW = new Date("2026-10-18T10:00:00.000Z");
const VALID_BILL = "INV-2026-0042";
const DISCREPANT_BILL = "INV-2026-0043";
const UNREGISTERED_BILL = "SUN-2026-7781";

const GOOD_TEXT = "This field is explained in simple words.";

function recordFor(billNumber: string): HospitalRecord {
  const found = MOCK_HOSPITAL_RECORDS.find((entry) => entry.billNumber === billNumber);
  if (!found) throw new Error(`missing fixture ${billNumber}`);
  return found;
}

function session(overrides: Partial<AccessSession> = {}): AccessSession {
  return {
    sessionId: "session-1",
    billNumber: VALID_BILL,
    createdAt: NOW,
    expiresAt: new Date(NOW.getTime() + 15 * 60_000),
    outcome: "verified",
    outcomeAt: NOW,
    ...overrides,
  };
}

function run(
  options: {
    session?: AccessSession;
    language?: unknown;
    repository?: HospitalRecordRepository;
    provider?: FakeExplanationProvider;
  } = {},
) {
  const provider =
    options.provider ??
    createFakeExplanationProvider(() => structuredDraftResponse(GOOD_TEXT));
  return {
    provider,
    result: generateExplanation({
      session: options.session ?? session(),
      language: options.language === undefined ? "en" : options.language,
      repository: options.repository ?? createMockHospitalRecordRepository(),
      provider,
      now: NOW,
    }),
  };
}

describe("generateExplanation — languages", () => {
  it("supports English, Hindi and Kannada and localizes headings", async () => {
    const headings = new Set<string>();
    const safeText = {
      en: GOOD_TEXT,
      hi: "यह जानकारी अस्पताल के रिकॉर्ड में दी गई राशि का अर्थ समझाती है।",
      kn: "ಈ ಮಾಹಿತಿಯು ಆಸ್ಪತ್ರೆಯ ದಾಖಲೆಯಲ್ಲಿರುವ ಮೊತ್ತದ ಅರ್ಥವನ್ನು ವಿವರಿಸುತ್ತದೆ.",
    } as const;

    for (const language of ["en", "hi", "kn"] as const) {
      const text = safeText[language];
      const { provider, result } = run({
        language,
        provider: createFakeExplanationProvider(() => structuredDraftResponse(text)),
      });
      const resolved = await result;

      expect(resolved.kind, language).toBe("explanation");
      if (resolved.kind !== "explanation") continue;

      expect(resolved.response.explanation.language).toBe(language);
      expect(resolved.response.sections[0]?.explanation).toBe(text);
      expect(provider.calls).toHaveLength(1);
      expect(provider.calls[0]?.language).toBe(language);

      const heading = resolved.response.sections[0]?.heading;
      expect(heading, language).toBeTruthy();
      if (heading) headings.add(heading);
    }

    expect(headings.size).toBe(3);
  });

  it("rejects unsupported languages before any record reaches the provider", async () => {
    for (const language of ["ta", "English", "", null, 42]) {
      const { provider, result } = run({ language });
      const resolved = await result;

      expect(resolved.kind, String(language)).toBe("error");
      if (resolved.kind !== "error") continue;
      expect(resolved.error.code).toBe("unsupported_language");
      expect(resolved.error.message).toBe(EXPLANATION_MESSAGES.unsupported_language);
      expect(provider.calls).toHaveLength(0);
    }
  });
});

describe("generateExplanation — authorization", () => {
  it("refuses a session that has not been verified", async () => {
    const { provider, result } = run({ session: session({ outcome: null }) });
    const resolved = await result;

    expect(resolved.kind).toBe("error");
    if (resolved.kind !== "error") return;
    expect(resolved.error.code).toBe("verification_required");
    expect(provider.calls).toHaveLength(0);
  });

  it("refuses an expired session", async () => {
    const { provider, result } = run({
      session: session({ expiresAt: new Date(NOW.getTime() - 1) }),
    });
    const resolved = await result;

    expect(resolved.kind).toBe("error");
    if (resolved.kind !== "error") return;
    expect(resolved.error.code).toBe("session_expired");
    expect(provider.calls).toHaveLength(0);
  });

  it("refuses every non-authorized verification outcome", async () => {
    const outcomes: VerificationOutcome[] = [
      "amounts_differ",
      "bill_not_found",
      "hospital_not_registered",
    ];

    for (const outcome of outcomes) {
      const { provider, result } = run({
        session: session({
          billNumber:
            outcome === "hospital_not_registered" ? UNREGISTERED_BILL : VALID_BILL,
          outcome,
        }),
      });
      const resolved = await result;

      expect(resolved.kind, outcome).toBe("error");
      if (resolved.kind !== "error") continue;
      expect(resolved.error.code).toBe(outcome);
      expect(provider.calls).toHaveLength(0);
    }
  });

  it("refuses a bill with no authoritative record", async () => {
    const { provider, result } = run({
      session: session({ billNumber: "MISS-2026-0001", outcome: "verified" }),
    });
    const resolved = await result;

    expect(resolved.kind).toBe("error");
    if (resolved.kind !== "error") return;
    expect(resolved.error.code).toBe("bill_not_found");
    expect(provider.calls).toHaveLength(0);
  });

  it("re-checks the record, so a stale verified session cannot open a discrepancy", async () => {
    const { provider, result } = run({
      session: session({ billNumber: DISCREPANT_BILL, outcome: "verified" }),
    });
    const resolved = await result;

    expect(resolved.kind).toBe("error");
    if (resolved.kind !== "error") return;
    expect(resolved.error.code).toBe("amounts_differ");
    expect(resolved.error.discrepancyKeys).toEqual([
      "insuranceApprovedButNotPaid",
      "patientPayments",
      "printedAmountDue",
    ]);
    expect(provider.calls).toHaveLength(0);
  });
});

describe("generateExplanation — validated response", () => {
  it("renders all facts from the record and marks the response validated", async () => {
    const { result } = run();
    const resolved = await result;

    expect(resolved.kind).toBe("explanation");
    if (resolved.kind !== "explanation") return;

    const response = resolved.response;
    expect(response.validation).toBe("validated");
    expect(response.sections).toHaveLength(5);
    expect(response.explanation.financialFactsUsed).toHaveLength(5);
    expect(response.explanation.datesUsed).toEqual([]);
    expect(response.explanation.notice).toBe(EXPLANATION_NOTICE);
    expect(response.explanation.verifiedRecordReference).toEqual({
      recordId: `mock:${VALID_BILL}`,
      billNumber: VALID_BILL,
    });

    const record = recordFor(VALID_BILL);
    for (const section of response.sections) {
      expect(section.amountRupees).toBe(record.recordAmounts[section.fieldKey]);
      expect(section.status).toBe(
        section.amountRupees === null ? "missing" : "found",
      );
    }

    expect(response.explanation.explanationText).toContain("Bill total after discounts");
    expect(response.explanation.explanationText).toContain("INR 15,000");
    expect(response.explanation.warnings.some((warning) => warning.includes("no dates"))).toBe(
      true,
    );
  });

  it("sends only keys and availability to the provider — no amounts or identifiers", async () => {
    const { provider, result } = run();
    await result;

    const sent = provider.calls[0];
    expect(sent?.fields).toHaveLength(5);
    expect(sent?.fields.every((field) => "status" in field && !("amountRupees" in field))).toBe(
      true,
    );

    const serialised = JSON.stringify(sent);
    expect(serialised).not.toContain(VALID_BILL);
    expect(serialised).not.toContain("CITY GENERAL HOSPITAL");
    expect(serialised).not.toContain("accessToken");
    expect(serialised).not.toContain("accessCode");
    expect(serialised).not.toContain("session-1");
    expect(serialised).not.toContain("15000");
    expect(serialised).not.toContain("10000");
  });

  it("keeps a missing amount null and describes it as unknown", async () => {
    const base = recordFor(VALID_BILL);
    const incomplete: HospitalRecord = {
      ...base,
      printedAmounts: { ...base.printedAmounts, printedAmountDue: null },
      recordAmounts: { ...base.recordAmounts, printedAmountDue: null },
    };

    const { provider, result } = run({
      repository: createMockHospitalRecordRepository([incomplete]),
    });
    const resolved = await result;

    expect(resolved.kind).toBe("explanation");
    if (resolved.kind !== "explanation") return;

    const section = resolved.response.sections.find(
      (entry) => entry.fieldKey === "printedAmountDue",
    );
    expect(section?.amountRupees).toBeNull();
    expect(section?.status).toBe("missing");
    expect(
      resolved.response.explanation.warnings.some((warning) =>
        warning.includes("unknown, not as zero"),
      ),
    ).toBe(true);
    expect(resolved.response.explanation.explanationText).toContain(
      "not available in the hospital record",
    );

    const sentField = provider.calls[0]?.fields.find(
      (field) => field.fieldKey === "printedAmountDue",
    );
    expect(sentField?.status).toBe("missing");
  });
});

describe("generateExplanation — draft safety", () => {
  it("falls back to a server template for numeric claims in the prose", async () => {
    const cases = [
      "The total is 15,000.",
      "The amount is १५०००.",
      "The amount is ೧೫೦೦೦.",
      "This is 80% covered.",
      "The bill is from January.",
      "You are eligible for a waiver.",
      "आप पात्र हैं।",
      "ನೀವು ಅರ್ಹರಾಗಿದ್ದೀರಿ.",
      "RAW_DRAFT_SENTINEL 15000",
    ];

    for (const text of cases) {
      const { result } = run({
        provider: createFakeExplanationProvider(() => structuredDraftResponse(text)),
      });
      const resolved = await result;

      expect(resolved.kind, text).toBe("explanation");
      if (resolved.kind !== "explanation") continue;

      expect(resolved.response.validation, text).toBe("server_template");
      expect(resolved.response.explanation.explanationText, text).not.toContain(
        "RAW_DRAFT_SENTINEL",
      );
      expect(resolved.response.explanation.warnings.some((warning) =>
        warning.includes("standard summary"),
      )).toBe(true);
      // The template still carries the authoritative record value.
      expect(resolved.response.sections[0]?.amountRupees).toBe("15000");
    }
  });

  it("falls back for malformed or structurally invalid provider output", async () => {
    const fourSections = validProviderSections().slice(0, 4);
    const duplicate = [...validProviderSections(), validProviderSections()[0]];
    const unknown = [
      ...validProviderSections().slice(0, 4),
      { fieldKey: "someOtherField", explanation: GOOD_TEXT },
    ];

    const responses = [
      "not json",
      "{}",
      JSON.stringify({ sections: fourSections }),
      JSON.stringify({ sections: duplicate }),
      JSON.stringify({ sections: unknown }),
      JSON.stringify({
        sections: validProviderSections().map((section) => ({
          ...section,
          amountRupees: "15000",
        })),
      }),
      JSON.stringify({
        sections: validProviderSections().map((section) => ({
          ...section,
          confirmedByUser: true,
        })),
      }),
      JSON.stringify({
        sections: validProviderSections(),
        verifiedRecordReference: { recordId: "forged", billNumber: VALID_BILL },
      }),
      JSON.stringify({
        sections: validProviderSections(),
        datesUsed: [
          { label: "Bill date", dateIso: "2026-01-01", pageNumber: 1 },
        ],
      }),
    ];

    for (const raw of responses) {
      const { result } = run({
        provider: createFakeExplanationProvider(() => raw),
      });
      const resolved = await result;

      expect(resolved.kind, raw).toBe("explanation");
      if (resolved.kind !== "explanation") continue;
      expect(resolved.response.validation, raw).toBe("server_template");
    }
  });

  it("falls back on provider timeout, error or block", async () => {
    const cases = [
      () => {
        throw new ExplanationProviderError("timeout", "provider detail");
      },
      () => {
        throw new ExplanationProviderError("unavailable", "provider detail");
      },
      () => {
        throw new ExplanationProviderError("blocked", "provider detail");
      },
      () => {
        throw new Error("socket hang up");
      },
    ];

    for (const responder of cases) {
      const { result } = run({
        provider: createFakeExplanationProvider(responder),
      });
      const resolved = await result;

      expect(resolved.kind).toBe("explanation");
      if (resolved.kind !== "explanation") continue;
      expect(resolved.response.validation).toBe("server_template");
      expect(JSON.stringify(resolved.response)).not.toContain("provider detail");
      expect(JSON.stringify(resolved.response)).not.toContain("socket hang up");
    }
  });
});
