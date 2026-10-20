import { z } from "zod";
import {
  documentWarningsSchema,
  languageCodeSchema,
  monetaryAmountSchema,
} from "./common";
import { financialFieldKeySchema } from "./financial";
import { financialFactSchema, verifiedRecordReferenceSchema } from "./explanation";

/**
 * Bill question answering (`POST /api/bills/questions`).
 *
 * This contract is deliberately separate from the five-section explanation
 * response: an explanation always covers all five tracked fields, while an
 * answer covers the one thing the patient asked about — or refuses.
 *
 * The safety property lives in the cross-field rules below, so it cannot be
 * lost by a later refactor of the service:
 *
 *   - `record_fact` is the ONLY answer type allowed to carry a figure, and it
 *     must name the field the figure belongs to, cite the record it came from,
 *     and repeat that same field and the same decimal string in
 *     `financialFactsUsed`. A fact and its figure cannot drift apart.
 *   - every other answer type must carry `fieldKey`, `amountRupees`,
 *     `verifiedRecordReference` and `financialFactsUsed` empty. A meaning,
 *     discrepancy, clarification, unsupported or unavailable answer can never
 *     smuggle a number through.
 *
 * Nothing in this contract is client-supplied: the question and language are
 * the only accepted inputs, and every other value is decided by the server from
 * the server-side session and the authoritative record.
 *
 * The schema cannot check that a figure EQUALS the record — that comparison
 * happens in `src/lib/questions/validator.ts` against the same field, exactly
 * as the explanation path does it.
 */

/** Fixed notice every answer must carry. Honest for every answer type. */
export const QUESTION_ANSWER_NOTICE =
  "This answer is informational. Amounts come only from the hospital's record." as const;

/** Longest question the endpoint accepts. Longer input is a 400, never truncated. */
export const MAX_QUESTION_LENGTH = 500;

/** The two languages-independent halves of an answer's provenance. */
export const questionAnswerTypeSchema = z.enum([
  /** What a bill term means. No figure, no reference to the record. */
  "meaning",
  /** The value the hospital's record holds for one named field. */
  "record_fact",
  /** The check found a difference between the bill and the record. */
  "discrepancy",
  /** The patient must say which field they mean before anything can be said. */
  "clarification",
  /** Needs information or judgement the record cannot supply. */
  "unsupported",
  /** The provider failed or its answer was rejected; nothing was guessed. */
  "unavailable",
]);
export type QuestionAnswerType = z.infer<typeof questionAnswerTypeSchema>;

export const questionAnswerSchema = z
  .object({
    language: languageCodeSchema,
    /** Echoed back so a screen reader can read the question and answer together. */
    question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
    answerType: questionAnswerTypeSchema,
    answerText: z.string().trim().min(1).max(4000),
    /** Set only for `record_fact`; null on every other answer type. */
    fieldKey: financialFieldKeySchema.nullable(),
    /** Rendered from the record for `fieldKey`. Never taken from model output. */
    amountRupees: monetaryAmountSchema.nullable(),
    /** Set only for `record_fact`, so an answer is traceable to what was checked. */
    verifiedRecordReference: verifiedRecordReferenceSchema.nullable(),
    /** Exactly the one fact a `record_fact` answer used; empty otherwise. */
    financialFactsUsed: z.array(financialFactSchema),
    warnings: documentWarningsSchema,
    notice: z.literal(QUESTION_ANSWER_NOTICE),
  })
  .strict()
  .superRefine((answer, ctx) => {
    if (answer.answerType === "record_fact") {
      if (answer.fieldKey === null) {
        ctx.addIssue({
          code: "custom",
          path: ["fieldKey"],
          message: "A record_fact answer must name the field its figure belongs to.",
        });
      }
      if (answer.verifiedRecordReference === null) {
        ctx.addIssue({
          code: "custom",
          path: ["verifiedRecordReference"],
          message: "A record_fact answer must cite the record it came from.",
        });
      }
      if (answer.financialFactsUsed.length !== 1) {
        ctx.addIssue({
          code: "custom",
          path: ["financialFactsUsed"],
          message: "A record_fact answer carries exactly one fact.",
        });
      }
      const fact = answer.financialFactsUsed[0];
      if (fact && answer.fieldKey !== null) {
        if (fact.fieldKey !== answer.fieldKey) {
          ctx.addIssue({
            code: "custom",
            path: ["financialFactsUsed", 0, "fieldKey"],
            message: "The fact must name the same field as the answer.",
          });
        }
        if (fact.amountRupees !== answer.amountRupees) {
          ctx.addIssue({
            code: "custom",
            path: ["financialFactsUsed", 0, "amountRupees"],
            message: "The fact must repeat the exact decimal string the answer shows.",
          });
        }
      }
      return;
    }

    // Every other answer type is a statement of meaning or a refusal, so it
    // cannot carry a figure or claim a reference to the record.
    if (answer.amountRupees !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["amountRupees"],
        message: "Only a record_fact answer may carry an amount.",
      });
    }
    if (answer.fieldKey !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["fieldKey"],
        message: "Only a record_fact answer may name a field.",
      });
    }
    if (answer.verifiedRecordReference !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["verifiedRecordReference"],
        message: "Only a record_fact answer may cite a record.",
      });
    }
    if (answer.financialFactsUsed.length !== 0) {
      ctx.addIssue({
        code: "custom",
        path: ["financialFactsUsed"],
        message: "Only a record_fact answer may carry facts.",
      });
    }
  });
export type QuestionAnswer = z.infer<typeof questionAnswerSchema>;

/**
 * Public response.
 *
 * `validation` says where the text came from, not whether it was checked:
 *   - `validated`      — model prose that passed every safety check;
 *   - `server_rendered` — written entirely by the server. That covers the
 *     record_fact, discrepancy, clarification, unsupported and unavailable
 *     answers, and it also covers any case where the provider was not usable.
 *
 * A rejected draft is never labelled `validated`.
 */
export const questionAnswerResponseSchema = z
  .object({
    validation: z.enum(["validated", "server_rendered"]),
    answer: questionAnswerSchema,
  })
  .strict();
export type QuestionAnswerResponse = z.infer<typeof questionAnswerResponseSchema>;

/** The only two values a client may send. */
export const questionRequestSchema = z
  .object({
    question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
    language: languageCodeSchema,
  })
  .strict();
export type QuestionRequest = z.infer<typeof questionRequestSchema>;
