import { z } from "zod";
import {
  RULING_CONFIRMATION_NOTICE_VERSION,
  RULING_REQUEST_API_VERSION,
  type RulingRequestResponse,
  type RulingRequestUnavailableResponse,
} from "@/types/ruling-request";
import { isSafePublicUrl } from "@/lib/public-assistant/safe-url";

const entityIdSchema = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._:-]+$/, "Use a stable SAL record ID.");

export const officialRulingRequestSchema = z
  .object({
    question: z.string().trim().min(6).max(2_000),
    bindingCase: z
      .object({
        caseType: z.enum(["eligibility", "roster", "game_day", "conduct", "other"]),
        urgency: z.enum(["normal", "game_day_urgent"]),
        seasonId: entityIdSchema,
        divisionId: entityIdSchema.optional(),
        matchId: entityIdSchema.optional(),
        affectedParties: z
          .array(
            z
              .object({
                type: z.enum(["player", "team", "match", "organization"]),
                id: entityIdSchema,
              })
              .strict(),
          )
          .min(1)
          .max(10),
        facts: z
          .array(
            z
              .object({
                key: z.string().trim().min(1).max(120),
                value: z.string().trim().min(1).max(2_000),
              })
              .strict(),
          )
          .min(1)
          .max(30),
      })
      .strict(),
    confirmation: z
      .object({
        accepted: z.literal(true),
        noticeVersion: z.literal(RULING_CONFIRMATION_NOTICE_VERSION),
      })
      .strict(),
  })
  .strict();

export const rulingRequestHeadersSchema = z
  .object({
    idempotencyKey: z.string().min(16).max(128).regex(/^[A-Za-z0-9._:-]+$/),
    csrfToken: z.string().min(32).max(512).regex(/^\S+$/),
  })
  .strict();

const rulingTicketCreatedResponseSchema = z
  .object({
    ok: z.literal(true),
    apiVersion: z.literal(RULING_REQUEST_API_VERSION),
    kind: z.literal("ruling_ticket_created"),
    ticketId: entityIdSchema,
    adminTicketPath: z.string().refine(isSafePublicUrl),
    status: z.literal("pending_admin_review"),
  })
  .strict();

const rulingRequestUnavailableResponseSchema = z
  .object({
    ok: z.literal(false),
    apiVersion: z.literal(RULING_REQUEST_API_VERSION),
    kind: z.literal("ruling_request_unavailable"),
    code: z.literal("RULING_REQUESTS_DISABLED"),
    message: z.string().min(1).max(1_000),
    retryable: z.literal(false),
  })
  .strict();

const rulingRequestErrorResponseSchema = z
  .object({
    ok: z.literal(false),
    apiVersion: z.literal(RULING_REQUEST_API_VERSION),
    kind: z.literal("ruling_request_error"),
    code: z.enum(["SIGN_IN_REQUIRED", "INVALID_REQUEST", "INVALID_CSRF_TOKEN"]),
    message: z.string().min(1).max(1_000),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  })
  .strict();

export const rulingRequestResponseSchema = z.discriminatedUnion("kind", [
  rulingTicketCreatedResponseSchema,
  rulingRequestUnavailableResponseSchema,
  rulingRequestErrorResponseSchema,
]);

export function parseOfficialRulingRequest(input: unknown) {
  return officialRulingRequestSchema.safeParse(input);
}

export function parseRulingRequestHeaders(headers: Headers) {
  return rulingRequestHeadersSchema.safeParse({
    idempotencyKey: headers.get("Idempotency-Key"),
    csrfToken: headers.get("X-CSRF-Token"),
  });
}

export function assertRulingRequestResponse(input: unknown): RulingRequestResponse {
  return rulingRequestResponseSchema.parse(input) as RulingRequestResponse;
}

export function buildRulingRequestUnavailableResponse(): RulingRequestUnavailableResponse {
  return assertRulingRequestResponse({
    ok: false,
    apiVersion: RULING_REQUEST_API_VERSION,
    kind: "ruling_request_unavailable",
    code: "RULING_REQUESTS_DISABLED",
    message:
      "Official ruling requests are not available yet. Once secure sign-in, case facts, CSRF protection, idempotent ticketing, and admin review are connected, confirmed requests will be stored as tracked tickets. No ticket was created.",
    retryable: false,
  }) as RulingRequestUnavailableResponse;
}
