import { z } from "zod";
import { languageCodeSchema } from "./common";

/**
 * Callback request schemas, split in two on purpose:
 *
 *  1. callbackRequestSchema — what the PATIENT submits. Strict: it rejects
 *     any client-supplied ticketId, createdAt or status, because those are
 *     server-owned. Consent must be explicitly true — there is no default.
 *
 *  2. callbackTicketSchema — what the SERVER stores. It adds the generated
 *     ticketId, createdAt and the initial status "new". The future callback
 *     endpoint validates the request with (1), then builds the ticket with
 *     (2) before writing it to the database.
 */

export const callbackTimeSchema = z.enum([
  "call_me_now",
  "morning",
  "afternoon",
  "evening",
]);
export type CallbackTime = z.infer<typeof callbackTimeSchema>;

/** Indian mobile numbers, optional leading +91 / 0 prefix, 10–15 digits. */
export const phoneNumberSchema = z
  .string()
  .trim()
  .regex(
    /^(?:\+?91)?[6-9]\d{9}$|^\d{10,15}$/,
    "Must be a valid phone number (10–15 digits, optional +91 prefix)",
  );
export type PhoneNumber = z.infer<typeof phoneNumberSchema>;

export const callbackRequestSchema = z
  .object({
    preferredLanguage: languageCodeSchema,
    callbackTime: callbackTimeSchema,
    reason: z.string().trim().min(3).max(1000),
    patientName: z.string().trim().min(2).max(200),
    phoneNumber: phoneNumberSchema,
    /** Explicit consent. Must be present and true — never defaults to true. */
    consentToCallback: z.literal(true),
  })
  .strict();
export type CallbackRequest = z.infer<typeof callbackRequestSchema>;

export const callbackTicketStatusSchema = z.enum([
  "new",
  "callback_scheduled",
  "contacted",
  "resolved",
]);
export type CallbackTicketStatus = z.infer<typeof callbackTicketStatusSchema>;

export const callbackTicketSchema = z
  .object({
    /** Server-generated opaque ID. */
    ticketId: z.string().trim().min(1).max(100),
    /** Server-generated ISO timestamp with timezone. */
    createdAt: z.iso.datetime({ offset: true }),
    status: callbackTicketStatusSchema,
    // Validated patient submission, spread into the stored ticket:
    preferredLanguage: languageCodeSchema,
    callbackTime: callbackTimeSchema,
    reason: z.string().trim().min(3).max(1000),
    patientName: z.string().trim().min(2).max(200),
    phoneNumber: phoneNumberSchema,
    consentToCallback: z.literal(true),
  })
  .strict();
export type CallbackTicket = z.infer<typeof callbackTicketSchema>;

/**
 * Helper for the future callback endpoint: build a "new" ticket from a
 * validated submission. ticketId and createdAt MUST be generated on the
 * server (e.g. crypto.randomUUID() and new Date().toISOString()).
 */
export function createCallbackTicket(input: {
  ticketId: string;
  createdAt: string;
  request: CallbackRequest;
}): CallbackTicket {
  const parsed = callbackTicketSchema.safeParse({
    ticketId: input.ticketId,
    createdAt: input.createdAt,
    status: "new" as const,
    ...input.request,
  });
  if (!parsed.success) {
    throw new Error(
      `Invalid callback ticket: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data;
}
