import { describe, expect, it } from "vitest";
import { billIdentificationSchema, identificationStatusSchema } from "./identification";

/** Synthetic test data only — never real hospital documents. */
const identified: Record<string, unknown> = {
  hospitalNameCandidate: "City General Hospital",
  hospitalIdentifierCandidate: "KA-REG-12345",
  billNumberCandidate: "INV-2026-0042",
  identificationStatus: "identified",
  warnings: [],
};

const partialWithWarnings: Record<string, unknown> = {
  hospitalNameCandidate: "City General Hospital",
  hospitalIdentifierCandidate: null,
  billNumberCandidate: null,
  identificationStatus: "partial",
  warnings: ["Bill number was smudged and could not be read."],
};

const unreadable: Record<string, unknown> = {
  hospitalNameCandidate: null,
  hospitalIdentifierCandidate: null,
  billNumberCandidate: null,
  identificationStatus: "unreadable_image",
  warnings: ["Image too blurry to read."],
};

describe("billIdentificationSchema", () => {
  it("accepts a fully identified result (case 1)", () => {
    expect(billIdentificationSchema.safeParse(identified).success).toBe(true);
  });

  it("accepts all four identification statuses", () => {
    for (const status of identificationStatusSchema.options) {
      const result = billIdentificationSchema.safeParse({
        hospitalNameCandidate: null,
        hospitalIdentifierCandidate: null,
        billNumberCandidate: null,
        identificationStatus: status,
        warnings: [],
      });
      expect(result.success, `status ${status}`).toBe(true);
    }
  });

  it("allows missing hospital names and bill numbers as null (case 2)", () => {
    expect(billIdentificationSchema.safeParse(partialWithWarnings).success).toBe(true);
    expect(billIdentificationSchema.safeParse(unreadable).success).toBe(true);
  });

  it("rejects an empty string instead of null for missing values", () => {
    const result = billIdentificationSchema.safeParse({
      ...identified,
      billNumberCandidate: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects financial amounts in an identification result (case 3)", () => {
    const withAmount = {
      ...identified,
      amountRupees: "15000",
    };
    expect(billIdentificationSchema.safeParse(withAmount).success).toBe(false);
  });

  it("rejects insurance, payment, and diagnosis fields (case 3)", () => {
    for (const extraKey of [
      "insuranceApproved",
      "insurancePaid",
      "patientPayments",
      "paymentMethod",
      "diagnosis",
      "diagnosisCode",
    ]) {
      const result = billIdentificationSchema.safeParse({
        ...identified,
        [extraKey]: "sensitive value",
      });
      expect(result.success, `extra key ${extraKey}`).toBe(false);
    }
  });

  it("rejects an unknown identification status", () => {
    const result = billIdentificationSchema.safeParse({
      ...identified,
      identificationStatus: "verified",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing required properties", () => {
    const withoutStatus = { ...identified };
    delete withoutStatus.identificationStatus;
    expect(billIdentificationSchema.safeParse(withoutStatus).success).toBe(false);
  });
});
