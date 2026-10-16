import { describe, expect, it } from "vitest";
import { billIdentificationSchema } from "@/lib/schemas";
import {
  BILL_NUMBER_FIELD_NAME,
  IMAGE_FIELD_NAME,
  handleIdentifyRequest,
} from "./handler";
import { MAX_IMAGE_BYTES } from "./image-input";
import { WARNING_MANUAL_BILL_NUMBER_USED, WARNING_NO_HOSPITAL_NAME } from "./extract";
import { WARNING_MANUAL_ENTRY_ONLY } from "./service";
import {
  SYNTHETIC_BILL_TEXT,
  crashingOcrEngine,
  fakeOcrEngine,
  unavailableOcrEngine,
} from "./__fixtures__/fake-ocr-engine";
import { syntheticBillPng } from "./__fixtures__/synthetic-image";

const ENDPOINT = "http://localhost:3000/api/bills/identify";
const validPng = syntheticBillPng(["SYNTHETIC HOSPITAL"]);
const encoder = new TextEncoder();

function multipartRequest(fields: {
  file?: { bytes: Uint8Array; name?: string; type?: string } | string;
  billNumber?: string;
}): Request {
  const form = new FormData();
  if (typeof fields.file === "string") {
    form.set(IMAGE_FIELD_NAME, fields.file);
  } else if (fields.file) {
    form.set(
      IMAGE_FIELD_NAME,
      new File([fields.file.bytes.slice()], fields.file.name ?? "bill.png", {
        type: fields.file.type ?? "image/png",
      }),
    );
  }
  if (fields.billNumber !== undefined) {
    form.set(BILL_NUMBER_FIELD_NAME, fields.billNumber);
  }
  return new Request(ENDPOINT, { method: "POST", body: form });
}

function jsonRequest(body: unknown): Request {
  return new Request(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/bills/identify — image upload", () => {
  it("identifies a readable bill image (case 1: successful identification)", async () => {
    const response = await handleIdentifyRequest(multipartRequest({ file: { bytes: validPng } }), {
      engine: fakeOcrEngine({ text: SYNTHETIC_BILL_TEXT }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.json();
    expect(body).toEqual({
      hospitalNameCandidate: "CITY GENERAL HOSPITAL",
      hospitalIdentifierCandidate: null,
      billNumberCandidate: "INV-2026-0042",
      identificationStatus: "identified",
      warnings: [],
    });
    expect(billIdentificationSchema.safeParse(body).success).toBe(true);
  });

  it("returns only identification fields over HTTP — no amounts, insurance or diagnoses (case 4)", async () => {
    const engine = fakeOcrEngine({
      text: [
        "CITY GENERAL HOSPITAL",
        "Bill No: INV-2026-0042",
        "Insurance approved: Rs 5000",
        "Patient paid: Rs 10000",
        "Diagnosis: Viral fever",
      ].join("\n"),
    });

    const response = await handleIdentifyRequest(multipartRequest({ file: { bytes: validPng } }), {
      engine,
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual([
      "billNumberCandidate",
      "hospitalIdentifierCandidate",
      "hospitalNameCandidate",
      "identificationStatus",
      "warnings",
    ]);
    const serialised = JSON.stringify(body);
    for (const forbidden of ["5000", "10000", "insurance", "diagnosis", "outcome"]) {
      expect(serialised.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("reports an unreadable image as a result, not a fabricated identification (case 6)", async () => {
    const response = await handleIdentifyRequest(multipartRequest({ file: { bytes: validPng } }), {
      engine: fakeOcrEngine({ text: "", meanConfidence: 0 }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.identificationStatus).toBe("unreadable_image");
    expect(body.billNumberCandidate).toBeNull();
    expect(body.hospitalNameCandidate).toBeNull();
    expect((body.warnings as string[]).length).toBeGreaterThan(0);
  });

  it("rejects a file that is not an image with 415 (case: invalid file type)", async () => {
    const engine = fakeOcrEngine({ text: SYNTHETIC_BILL_TEXT });
    const response = await handleIdentifyRequest(
      multipartRequest({
        file: { bytes: encoder.encode("<html>not an image</html>"), name: "bill.png", type: "image/png" },
      }),
      { engine },
    );

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({
      error: { code: "unsupported_media_type", message: expect.any(String) },
    });
    expect(engine.received).toHaveLength(0);
  });

  it("rejects an oversized image with 413 (case: oversized files)", async () => {
    const bytes = new Uint8Array(MAX_IMAGE_BYTES + 1);
    bytes.set(validPng.subarray(0, 8), 0);

    const response = await handleIdentifyRequest(multipartRequest({ file: { bytes } }), {
      engine: fakeOcrEngine({ text: SYNTHETIC_BILL_TEXT }),
    });

    expect(response.status).toBe(413);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("payload_too_large");
  });

  it("rejects an oversized body before reading it", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0x2d, 0x2d]));
        controller.close();
      },
    });
    const request = new Request(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=x",
        "content-length": String(MAX_IMAGE_BYTES + 1024 * 1024),
      },
      body: stream,
      // Required by Node when streaming a request body.
      duplex: "half",
    } as RequestInit);

    const response = await handleIdentifyRequest(request, {
      engine: fakeOcrEngine({ text: SYNTHETIC_BILL_TEXT }),
    });

    expect(response.status).toBe(413);
  });

  it("rejects a request with no image and no bill number", async () => {
    const response = await handleIdentifyRequest(multipartRequest({}), {
      engine: fakeOcrEngine({ text: SYNTHETIC_BILL_TEXT }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.message).toContain(IMAGE_FIELD_NAME);
  });

  it("rejects an uploaded file sent as a text field", async () => {
    const response = await handleIdentifyRequest(
      multipartRequest({ file: "i-am-a-string-not-a-file" }),
      { engine: fakeOcrEngine({ text: SYNTHETIC_BILL_TEXT }) },
    );

    expect(response.status).toBe(400);
  });

  it("treats a typed number with an empty file input as manual entry", async () => {
    const response = await handleIdentifyRequest(
      multipartRequest({ billNumber: "AB/1234/2026" }),
      { engine: fakeOcrEngine({ text: SYNTHETIC_BILL_TEXT }) },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.billNumberCandidate).toBe("AB/1234/2026");
    expect(body.warnings).toEqual([WARNING_MANUAL_ENTRY_ONLY, WARNING_NO_HOSPITAL_NAME]);
  });

  it("falls back to the typed number when the image yields none (case: missing bill number)", async () => {
    const response = await handleIdentifyRequest(
      multipartRequest({ file: { bytes: validPng }, billNumber: "ab-1234-2026" }),
      { engine: fakeOcrEngine({ text: "CITY GENERAL HOSPITAL" }) },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.billNumberCandidate).toBe("AB-1234-2026");
    expect(body.warnings).toContain(WARNING_MANUAL_BILL_NUMBER_USED);
  });

  it("holds the typed fallback to the same rule as JSON entry", async () => {
    // The same bad number must get the same answer whichever route it arrives
    // by. Regression: the multipart fallback once accepted anything and echoed
    // it back as `billNumberCandidate`.
    const engine = fakeOcrEngine({ text: "" });
    const badNumber = "<script>alert(1)</script>";

    const viaMultipart = await handleIdentifyRequest(
      multipartRequest({ file: { bytes: validPng }, billNumber: badNumber }),
      { engine },
    );
    const viaJson = await handleIdentifyRequest(jsonRequest({ billNumber: badNumber }), { engine });

    expect(viaMultipart.status).toBe(400);
    expect(viaJson.status).toBe(400);
    expect(await viaMultipart.json()).toEqual(await viaJson.json());
  });

  it("rejects an over-long typed number instead of silently truncating it", async () => {
    const response = await handleIdentifyRequest(
      multipartRequest({ file: { bytes: validPng }, billNumber: "A".repeat(150) }),
      { engine: fakeOcrEngine({ text: "" }) },
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_request");
  });

  it("rejects an invalid typed number before spending any OCR work", async () => {
    const engine = fakeOcrEngine({ text: SYNTHETIC_BILL_TEXT });
    const response = await handleIdentifyRequest(
      multipartRequest({ file: { bytes: validPng }, billNumber: "AB" }),
      { engine },
    );

    expect(response.status).toBe(400);
    expect(engine.received).toHaveLength(0);
  });
});

describe("POST /api/bills/identify — manual entry", () => {
  it("accepts a typed bill number as JSON (case 1: manual entry)", async () => {
    const response = await handleIdentifyRequest(jsonRequest({ billNumber: "inv-2026-0042" }), {
      engine: fakeOcrEngine({ text: "" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.billNumberCandidate).toBe("INV-2026-0042");
    expect(body.identificationStatus).toBe("partial");
    expect(billIdentificationSchema.safeParse(body).success).toBe(true);
  });

  it("rejects malformed JSON", async () => {
    const response = await handleIdentifyRequest(jsonRequest("{ not json"), {
      engine: fakeOcrEngine({ text: "" }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_request");
  });

  it.each([
    ["a missing bill number", {}],
    ["an empty bill number", { billNumber: "" }],
    ["a too-short bill number", { billNumber: "12" }],
    ["an unsupported character", { billNumber: "INV#42#2026" }],
    ["an extra protected field", { billNumber: "INV-2026-0042", amountRupees: "15000" }],
  ])("rejects %s with 400", async (_label, body) => {
    const response = await handleIdentifyRequest(jsonRequest(body), {
      engine: fakeOcrEngine({ text: "" }),
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe("invalid_request");
  });
});

describe("POST /api/bills/identify — unsupported requests and engine failures", () => {
  it("rejects a content type it cannot read with 415", async () => {
    const request = new Request(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "hello",
    });

    const response = await handleIdentifyRequest(request, {
      engine: fakeOcrEngine({ text: SYNTHETIC_BILL_TEXT }),
    });
    expect(response.status).toBe(415);
  });

  it("reports an unavailable OCR engine as 503 without leaking internals", async () => {
    const response = await handleIdentifyRequest(multipartRequest({ file: { bytes: validPng } }), {
      engine: unavailableOcrEngine(),
    });

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("ocr_unavailable");
    expect(body.error.message).not.toContain("engine could not start");
  });

  it("reports an unexpected engine error as 500", async () => {
    const response = await handleIdentifyRequest(multipartRequest({ file: { bytes: validPng } }), {
      engine: crashingOcrEngine(),
    });

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("extraction_failed");
  });

  it("never returns a verification outcome from an identification request", async () => {
    const response = await handleIdentifyRequest(multipartRequest({ file: { bytes: validPng } }), {
      engine: fakeOcrEngine({ text: SYNTHETIC_BILL_TEXT }),
    });

    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body)).not.toContain("outcome");
    expect(Object.keys(body)).not.toContain("discrepancyKeys");
  });
});
