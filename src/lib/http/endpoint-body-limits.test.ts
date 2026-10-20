/**
 * Cross-endpoint guard: no route buffers a body it has not bounded.
 *
 * The unit tests in `request-body.test.ts` cover the reader itself. These drive
 * the real handlers, because the defect being pinned down lived at the call
 * sites: `request.json()` / `request.formData()` read everything first and let
 * the handler decide afterwards, which a chunked request with no
 * `content-length` can exploit.
 */
import { describe, expect, it } from "vitest";
import { grantAccess, TEST_NOW, TEST_SECRET } from "@/lib/access/__fixtures__/test-access";
import { handleChallengeRequest, handleChallengeVerificationRequest } from "@/lib/access/handler";
import { createInMemoryAccessStore, type AccessStore } from "@/lib/access/store";
import {
  fakeOcrEngine,
  SYNTHETIC_BILL_TEXT,
} from "@/lib/identification/__fixtures__/fake-ocr-engine";
import { syntheticBillPng } from "@/lib/identification/__fixtures__/synthetic-image";
import { handleIdentifyRequest } from "@/lib/identification/handler";
import { MAX_UPLOAD_BODY_BYTES } from "@/lib/identification/image-input";
import { createMockHospitalRecordRepository } from "@/lib/records/mock-records";
import { handleVerifyRequest } from "@/lib/verification/handler";
import { handleExplanationRequest } from "@/lib/explanation/handler";
import { createFakeExplanationProvider, structuredDraftResponse } from "@/lib/explanation/__fixtures__/fake-explanation-provider";

const repository = createMockHospitalRecordRepository();
const validPng = syntheticBillPng(["SYNTHETIC HOSPITAL"]);

function jsonRequest(url: string, body: unknown, token?: string): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** A streamed multipart body with no `content-length`, reporting bytes pulled. */
function streamedUpload(chunkBytes: number, chunkCount: number): {
  request: Request;
  pulled: () => number;
} {
  const chunk = new Uint8Array(chunkBytes);
  chunk.set(validPng.subarray(0, Math.min(8, chunkBytes)), 0);

  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled >= chunkBytes * chunkCount) {
        controller.close();
        return;
      }
      pulled += chunkBytes;
      controller.enqueue(chunk);
    },
  });

  const request = new Request("http://localhost:3000/api/bills/identify", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=probe" },
    body: stream,
    // Node requires this when a request body is a stream.
    duplex: "half",
  } as RequestInit);

  return { request, pulled: () => pulled };
}

async function accessToken(): Promise<{ store: AccessStore; token: string }> {
  const store = createInMemoryAccessStore();
  const grant = await grantAccess(store, { billNumber: "INV-2026-0042" });
  return { store, token: grant.accessToken };
}

const OVERSIZED_JSON = JSON.stringify({ padding: "x".repeat(70 * 1024) });

describe("identification body limits", () => {
  it("refuses an oversized streamed upload without content-length", async () => {
    const { request, pulled } = streamedUpload(256 * 1024, 64);
    const engine = fakeOcrEngine({ text: SYNTHETIC_BILL_TEXT });

    const response = await handleIdentifyRequest(request, { engine });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: { code: "payload_too_large", message: expect.any(String) },
    });
    expect(engine.received).toHaveLength(0);
    // The whole 16 MiB body is never pulled: reading stops at the cap.
    expect(pulled()).toBeLessThan(MAX_UPLOAD_BODY_BYTES + 1024 * 1024);
  });

  it("refuses an oversized JSON body", async () => {
    const response = await handleIdentifyRequest(jsonRequest("http://localhost:3000/api/bills/identify", OVERSIZED_JSON), {
      engine: fakeOcrEngine({ text: SYNTHETIC_BILL_TEXT }),
    });

    expect(response.status).toBe(413);
  });
});

describe("access body limits", () => {
  it("refuses an oversized challenge body", async () => {
    const response = await handleChallengeRequest(
      jsonRequest("http://localhost:3000/api/bills/access/challenge", OVERSIZED_JSON),
      { store: createInMemoryAccessStore(), secret: TEST_SECRET, now: () => TEST_NOW },
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: { code: "payload_too_large", message: "The request body is too large." },
    });
  });

  it("refuses an oversized answer body", async () => {
    const response = await handleChallengeVerificationRequest(
      jsonRequest("http://localhost:3000/api/bills/access/verify", OVERSIZED_JSON),
      { store: createInMemoryAccessStore(), secret: TEST_SECRET, now: () => TEST_NOW },
    );

    expect(response.status).toBe(413);
  });
});

describe("verification body limits", () => {
  it("refuses an oversized verify body for an authorised session", async () => {
    const { store, token } = await accessToken();

    const response = await handleVerifyRequest(
      jsonRequest("http://localhost:3000/api/bills/verify", OVERSIZED_JSON, token),
      { store, secret: TEST_SECRET, repository, now: () => TEST_NOW },
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: { code: "payload_too_large", message: expect.any(String) },
    });
  });
});

describe("explanation body limits", () => {
  it("refuses an oversized explain body", async () => {
    const { store, token } = await accessToken();

    const response = await handleExplanationRequest(
      jsonRequest("http://localhost:3000/api/bills/explain", OVERSIZED_JSON, token),
      {
        store,
        secret: TEST_SECRET,
        provider: createFakeExplanationProvider(() =>
          structuredDraftResponse("This field is explained in simple words."),
        ),
        repository,
        now: () => TEST_NOW,
      },
    );

    expect(response.status).toBe(413);
  });
});
