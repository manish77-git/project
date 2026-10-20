/**
 * Bounded request-body reading for the JSON and multipart endpoints.
 *
 * Why this exists: `request.json()` and `request.formData()` read the whole
 * body before anyone can look at it. A `content-length` check alone does not
 * close that hole, because a client is free to send a chunked body with no
 * `content-length` at all — the framework would then buffer however many bytes
 * arrive before the handler gets a say. On an endpoint that costs CPU (OCR) or
 * money (a model call) per request, that is a cheap way to exhaust a process.
 *
 * These helpers therefore enforce the limit while reading:
 *
 *   - a declared `content-length` over the limit is refused without touching
 *     the stream at all (the cheap, common case);
 *   - a streamed body is counted chunk by chunk, and reading stops as soon as
 *     the limit is crossed, so an oversized upload is never fully buffered;
 *   - a body that cannot be read is reported as such, not as invalid content.
 *
 * Limits are per call site: JSON bodies are tiny, while an upload legitimately
 * carries megabytes of image data.
 */

/** Generous ceiling for a JSON request body: the largest contract is ~2 KB. */
export const MAX_JSON_BODY_BYTES = 64 * 1024;

/** Patient-safe wording for a refusal, identical on every endpoint. */
export const BODY_TOO_LARGE_MESSAGE = "The request body is too large.";

/** Room for multipart boundaries and field names on top of an image. */
export const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export type BodyReadFailure = "too_large" | "unreadable";

export type BodyRead =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; reason: BodyReadFailure };

export type JsonReadFailure = BodyReadFailure | "invalid_json";

export type JsonRead =
  | { ok: true; value: unknown }
  | { ok: false; reason: JsonReadFailure };

export type MultipartRead =
  | { ok: true; form: FormData }
  | { ok: false; reason: BodyReadFailure | "invalid_body" };

/** The size a client *claims*, or null when it claims nothing usable. */
function declaredLength(header: string | null): number | null {
  if (header === null) return null;
  const value = Number.parseInt(header, 10);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

/**
 * True when the declared length already exceeds the limit.
 *
 * A missing or unparseable header returns false rather than true: it means the
 * size is unknown, and the streaming counter below is what enforces the limit
 * in that case.
 */
export function exceedsDeclaredLength(header: string | null, limitBytes: number): boolean {
  const declared = declaredLength(header);
  return declared !== null && declared > limitBytes;
}

/** Reads a request body, stopping as soon as it exceeds `limitBytes`. */
export async function readBodyWithLimit(
  request: Request,
  limitBytes: number,
): Promise<BodyRead> {
  if (exceedsDeclaredLength(request.headers.get("content-length"), limitBytes)) {
    return { ok: false, reason: "too_large" };
  }

  const body = request.body;
  if (!body) return { ok: true, bytes: new Uint8Array(0) };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      total += value.byteLength;
      if (total > limitBytes) {
        // Stop pulling immediately: the rest of the body is never buffered.
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "unreadable" };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Already released by cancel(); nothing to do.
    }
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

/**
 * Reads and parses a JSON body under a size limit.
 *
 * An empty body is `invalid_json`: every caller here requires a JSON document,
 * and none of them should silently treat "nothing was sent" as `{}`.
 */
export async function readJsonBody(
  request: Request,
  limitBytes: number = MAX_JSON_BODY_BYTES,
): Promise<JsonRead> {
  const body = await readBodyWithLimit(request, limitBytes);
  if (!body.ok) return body;

  const text = new TextDecoder().decode(body.bytes);
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}

/**
 * Parses a multipart body while counting bytes, so the limit holds even with no
 * `content-length`.
 *
 * The body is wrapped in a counting stream and handed to the platform parser:
 * the limit is enforced during parsing, not after the whole upload has been
 * buffered.
 */
export async function readMultipartFormData(
  request: Request,
  limitBytes: number,
): Promise<MultipartRead> {
  if (exceedsDeclaredLength(request.headers.get("content-length"), limitBytes)) {
    return { ok: false, reason: "too_large" };
  }

  const contentType = request.headers.get("content-type");
  const body = request.body;
  if (!contentType || !body) return { ok: false, reason: "invalid_body" };

  const reader = body.getReader();
  let total = 0;
  let tooLarge = false;
  let unreadable = false;

  const counted = new ReadableStream<Uint8Array>({
    async pull(controller) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        unreadable = true;
        controller.error(new Error("The request body could not be read."));
        return;
      }

      if (chunk.done) {
        controller.close();
        return;
      }

      if (chunk.value && chunk.value.byteLength > 0) {
        total += chunk.value.byteLength;
        if (total > limitBytes) {
          tooLarge = true;
          controller.error(new Error("The request body is too large."));
          return;
        }
        controller.enqueue(chunk.value);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });

  try {
    const form = await new Response(counted, {
      headers: { "content-type": contentType },
    }).formData();
    return { ok: true, form };
  } catch {
    if (tooLarge) return { ok: false, reason: "too_large" };
    if (unreadable) return { ok: false, reason: "unreadable" };
    return { ok: false, reason: "invalid_body" };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Already released; nothing to do.
    }
  }
}
