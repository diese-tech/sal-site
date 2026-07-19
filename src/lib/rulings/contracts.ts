import { z } from "zod";
import {
  RULING_CONFIRMATION_NOTICE_VERSION,
  RULING_REQUEST_API_VERSION,
  type RulingRequestResponse,
  type RulingRequestUnavailableResponse,
} from "@/types/ruling-request";
import { isSafePublicUrl } from "@/lib/public-assistant/safe-url";

const entityIdSchema = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._:-]+$/, "Use a stable SAL record ID.");
const urgencySchema = z.enum(["normal", "game_day_urgent"]);
const factsSchema = z
  .array(
    z
      .object({
        key: z.string().trim().min(1).max(120),
        value: z.string().trim().min(1).max(2_000),
      })
      .strict(),
  )
  .min(1)
  .max(30);
const partySchema = z
  .object({
    type: z.enum(["player", "team", "match", "organization"]),
    id: entityIdSchema,
  })
  .strict();
const commonCaseFields = {
  seasonId: entityIdSchema,
  divisionId: entityIdSchema.optional(),
  facts: factsSchema,
};

const bindingCaseSchema = z.discriminatedUnion("caseType", [
  z
    .object({
      caseType: z.literal("eligibility"),
      urgency: urgencySchema,
      ...commonCaseFields,
      playerId: entityIdSchema,
      teamId: entityIdSchema,
      matchId: entityIdSchema.optional(),
    })
    .strict(),
  z
    .object({
      caseType: z.literal("roster"),
      urgency: urgencySchema,
      ...commonCaseFields,
      playerId: entityIdSchema,
      teamId: entityIdSchema,
      rosterAction: z.enum(["add", "remove", "substitute", "transfer"]),
      matchId: entityIdSchema.optional(),
    })
    .strict(),
  z
    .object({
      caseType: z.literal("game_day"),
      urgency: z.literal("game_day_urgent"),
      ...commonCaseFields,
      matchId: entityIdSchema,
      requestingTeamId: entityIdSchema,
      opponentTeamId: entityIdSchema,
      gameNumber: z.number().int().positive().max(99).optional(),
    })
    .strict(),
  z
    .object({
      caseType: z.literal("conduct"),
      urgency: urgencySchema,
      ...commonCaseFields,
      subject: partySchema,
      matchId: entityIdSchema.optional(),
    })
    .strict(),
  z
    .object({
      caseType: z.literal("other"),
      urgency: urgencySchema,
      ...commonCaseFields,
      affectedParties: z.array(partySchema).min(1).max(10),
      matchId: entityIdSchema.optional(),
    })
    .strict(),
]).superRefine((request, context) => {
  if (request.caseType === "game_day" && request.requestingTeamId === request.opponentTeamId) {
    context.addIssue({ code: "custom", path: ["opponentTeamId"], message: "Opponent must be a different team." });
  }
});

export const officialRulingRequestSchema = z
  .object({
    question: z.string().trim().min(6).max(2_000),
    bindingCase: bindingCaseSchema,
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
