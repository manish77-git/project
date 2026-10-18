import { describe, expect, it } from "vitest";
import {
  createMockHospitalRecordRepository,
  MOCK_HOSPITAL_RECORDS,
  type HospitalRecord,
} from "@/lib/records/mock-records";
import { baselineDiscrepancies, computeVerification, verifyBill } from "./service";

const repository = createMockHospitalRecordRepository();

function record(billNumber: string): HospitalRecord {
  const found = MOCK_HOSPITAL_RECORDS.find((entry) => entry.billNumber === billNumber);
  if (!found) throw new Error(`missing fixture ${billNumber}`);
  return found;
}

const VALID_BILL = "INV-2026-0042";
const DISCREPANT_BILL = "INV-2026-0043";
const UNREGISTERED_BILL = "SUN-2026-7781";

describe("computeVerification — the four outcomes", () => {
  it("verifies a bill whose amounts match the record", () => {
    const result = computeVerification({ record: record(VALID_BILL), hospitalName: null });
    expect(result.outcome).toBe("verified");
    expect(result.discrepancyKeys).toEqual([]);
    expect(result.message).not.toMatch(/\d/);
  });

  it("reports differing amounts with the field keys, sorted", () => {
    const result = computeVerification({ record: record(DISCREPANT_BILL), hospitalName: null });
    expect(result.outcome).toBe("amounts_differ");
    expect(result.discrepancyKeys).toEqual([
      "insuranceApprovedButNotPaid",
      "patientPayments",
      "printedAmountDue",
    ]);
  });

  it("reports an unregistered hospital", () => {
    const result = computeVerification({ record: record(UNREGISTERED_BILL), hospitalName: null });
    expect(result.outcome).toBe("hospital_not_registered");
    expect(result.discrepancyKeys).toEqual([]);
  });

  it("reports a bill that is not on file at the hospital the caller named", () => {
    const result = computeVerification({
      record: record(VALID_BILL),
      hospitalName: "SUNRISE MULTISPECIALITY HOSPITAL",
    });
    expect(result.outcome).toBe("bill_not_found");
  });

  it("matches the hospital name case-insensitively", () => {
    const result = computeVerification({
      record: record(VALID_BILL),
      hospitalName: "city general hospital",
    });
    expect(result.outcome).toBe("verified");
  });
});

describe("computeVerification — what a caller cannot influence", () => {
  it("cannot hide a server-side discrepancy by supplying matching amounts", () => {
    // The attack this blocks: send the amounts from the hospital's record and
    // turn a mismatch into a "verified" bill — which would also turn the
    // response into an oracle for the record's figures.
    const discrepant = record(DISCREPANT_BILL);
    const result = computeVerification({
      record: discrepant,
      hospitalName: null,
      financialCandidates: [
        { fieldKey: "insuranceApprovedButNotPaid", amountRupees: "8000" },
        { fieldKey: "patientPayments", amountRupees: "7000" },
        { fieldKey: "printedAmountDue", amountRupees: "7000" },
      ],
    });

    expect(result.outcome).toBe("amounts_differ");
    expect(result.discrepancyKeys).toEqual([
      "insuranceApprovedButNotPaid",
      "patientPayments",
      "printedAmountDue",
    ]);
  });

  it("can only add discrepancies, never remove one", () => {
    const result = computeVerification({
      record: record(VALID_BILL),
      hospitalName: null,
      financialCandidates: [{ fieldKey: "printedAmountDue", amountRupees: "9999" }],
    });

    expect(result.outcome).toBe("amounts_differ");
    expect(result.discrepancyKeys).toEqual(["printedAmountDue"]);
  });

  it("accepts candidates that agree with a consistent record", () => {
    const result = computeVerification({
      record: record(VALID_BILL),
      hospitalName: null,
      financialCandidates: [
        { fieldKey: "printedAmountDue", amountRupees: "10000" },
        { fieldKey: "patientPayments", amountRupees: "10000.00" },
      ],
    });

    expect(result.outcome).toBe("verified");
  });

  it("treats an unread amount as unknown rather than as a disagreement", () => {
    const result = computeVerification({
      record: record(VALID_BILL),
      hospitalName: null,
      financialCandidates: [{ fieldKey: "printedAmountDue", amountRupees: null }],
    });

    expect(result.outcome).toBe("verified");
  });

  it("lists the server-side disagreement independently of any caller", () => {
    expect(baselineDiscrepancies(record(VALID_BILL))).toEqual([]);
    expect(baselineDiscrepancies(record(DISCREPANT_BILL))).toHaveLength(3);
  });
});

describe("verifyBill", () => {
  it("returns exactly the three contract fields, with no figures", async () => {
    const result = await verifyBill({
      billNumber: DISCREPANT_BILL,
      repository,
      request: {},
    });

    expect(result.kind).toBe("result");
    if (result.kind !== "result") return;
    expect(Object.keys(result.result).sort()).toEqual([
      "discrepancyKeys",
      "message",
      "outcome",
    ]);
    const serialised = JSON.stringify(result.result);
    for (const figure of ["8000", "7000", "15000"]) {
      expect(serialised).not.toContain(figure);
    }
  });

  it("reports a bill that is missing from the records", async () => {
    const result = await verifyBill({ billNumber: "INV-2026-9999", repository, request: {} });
    expect(result.kind).toBe("result");
    if (result.kind !== "result") return;
    expect(result.result.outcome).toBe("bill_not_found");
  });

  it("takes the bill from its argument, so a request cannot retarget it", async () => {
    const result = await verifyBill({
      billNumber: VALID_BILL,
      repository,
      request: { billNumber: DISCREPANT_BILL },
    });

    // The extra key is refused outright rather than quietly ignored.
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.error.code).toBe("invalid_request");
  });

  it("refuses a verdict, a discrepancy or a verified flag in the request", async () => {
    for (const request of [
      { outcome: "verified" },
      { discrepancyKeys: [] },
      { isVerified: true },
      { confirmedByUser: true },
    ]) {
      const result = await verifyBill({ billNumber: VALID_BILL, repository, request });
      expect(result.kind, JSON.stringify(request)).toBe("error");
    }
  });

  it("refuses two different amounts claimed for the same field", async () => {
    const result = await verifyBill({
      billNumber: VALID_BILL,
      repository,
      request: {
        financialCandidates: [
          { fieldKey: "printedAmountDue", amountRupees: "10000" },
          { fieldKey: "printedAmountDue", amountRupees: "15000" },
        ],
      },
    });

    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.error.code).toBe("invalid_request");
  });

  it("refuses an amount that is not a decimal string", async () => {
    const result = await verifyBill({
      billNumber: VALID_BILL,
      repository,
      request: { financialCandidates: [{ fieldKey: "printedAmountDue", amountRupees: "10,000" }] },
    });
    expect(result.kind).toBe("error");
  });

  it("refuses an unknown field key", async () => {
    const result = await verifyBill({
      billNumber: VALID_BILL,
      repository,
      request: { financialCandidates: [{ fieldKey: "patientAge", amountRupees: "42" }] },
    });
    expect(result.kind).toBe("error");
  });
});
