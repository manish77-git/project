import { describe, expect, it } from "vitest";
import { billVerificationSchema, verificationOutcomeSchema } from "./verification";

const base = {
  safeMessage: "Bill details match hospital records.",
  discrepancyFieldKeys: [] as string[],
};

describe("billVerificationSchema", () => {
  it("accepts each of the four allowed outcomes (case 4)", () => {
    const messages: Record<(typeof verificationOutcomeSchema.options)[number], string> = {
      verified: "Bill details match hospital records.",
      amounts_differ: "Some amounts on the bill differ from hospital records.",
      bill_not_found: "We could not find this bill number in hospital records.",
      hospital_not_registered: "This hospital is not registered with us yet.",
    };
    for (const outcome of verificationOutcomeSchema.options) {
      const result = billVerificationSchema.safeParse({
        outcome,
        safeMessage: messages[outcome],
        discrepancyFieldKeys: [],
      });
      expect(result.success, `outcome ${outcome}`).toBe(true);
    }
  });

  it("rejects 'unreadable_image' as a verification outcome (case 5)", () => {
    const result = billVerificationSchema.safeParse({
      ...base,
      outcome: "unreadable_image",
    });
    expect(result.success).toBe(false);
  });

  it("rejects identification statuses used as verification outcomes (case 5)", () => {
    for (const status of ["identified", "partial", "invalid_input"] as const) {
      const result = billVerificationSchema.safeParse({ ...base, outcome: status });
      expect(result.success, `status ${status}`).toBe(false);
    }
  });

  it("accepts discrepancy field keys for amounts_differ", () => {
    const result = billVerificationSchema.safeParse({
      outcome: "amounts_differ",
      safeMessage: "Some amounts on the bill differ from hospital records.",
      discrepancyFieldKeys: ["printedAmountDue", "insurancePaidOrCredited"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects monetary amounts in a verification response", () => {
    const withAmounts = {
      outcome: "verified",
      ...base,
      amountRupees: "15000",
      printedAmountDue: "15000",
    };
    expect(billVerificationSchema.safeParse(withAmounts).success).toBe(false);
  });

  it("defaults discrepancyFieldKeys to an empty array", () => {
    const result = billVerificationSchema.safeParse({
      outcome: "bill_not_found",
      safeMessage: "We could not find this bill number in hospital records.",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.discrepancyFieldKeys).toEqual([]);
    }
  });

  it("rejects an empty or missing safe message", () => {
    expect(billVerificationSchema.safeParse({ ...base, outcome: "verified", safeMessage: "" }).success).toBe(false);
    const withoutMessage = { discrepancyFieldKeys: base.discrepancyFieldKeys };
    expect(billVerificationSchema.safeParse({ ...withoutMessage, outcome: "verified" }).success).toBe(false);
  });
});
