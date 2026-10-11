import { describe, expect, it } from "vitest";
import { billVerificationSchema, verificationOutcomeSchema } from "./verification";

const base = {
  message: "Bill details match hospital records.",
  discrepancyKeys: [] as string[],
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
        message: messages[outcome],
        discrepancyKeys: [],
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

  it("accepts discrepancy keys for amounts_differ", () => {
    const result = billVerificationSchema.safeParse({
      outcome: "amounts_differ",
      message: "Some amounts on the bill differ from hospital records.",
      discrepancyKeys: ["printedAmountDue", "insurancePaidOrCredited"],
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

  it("defaults discrepancyKeys to an empty array", () => {
    const result = billVerificationSchema.safeParse({
      outcome: "bill_not_found",
      message: "We could not find this bill number in hospital records.",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.discrepancyKeys).toEqual([]);
    }
  });

  it("rejects an empty or missing message", () => {
    expect(billVerificationSchema.safeParse({ ...base, outcome: "verified", message: "" }).success).toBe(false);
    const withoutMessage = { discrepancyKeys: base.discrepancyKeys };
    expect(billVerificationSchema.safeParse({ ...withoutMessage, outcome: "verified" }).success).toBe(false);
  });
});
