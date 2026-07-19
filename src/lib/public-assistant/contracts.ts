import { z } from "zod";
import {
  PUBLIC_ASSISTANT_API_VERSION,
  PUBLIC_ASSISTANT_MODEL,
  RULING_DEEP_LINKS,
  type AssistantUnavailableReason,
  type AssistantUnavailableResponse,
  type AssistantValidationErrorResponse,
  type PublicAssistantResponse,
} from "@/types/public-assistant";
import { isSafePublicUrl } from "./safe-url";

const safePublicUrlSchema = z.string().min(1).refine(isSafePublicUrl, "Citation URL must be relative or HTTPS without credentials.");
const publicSourceIdSchema = z
  .string()
  .min(1)
  .max(160)
  .refine((value) => !/^\d{17,20}$/.test(value), "Public citations cannot expose Discord snowflakes.");

const assistantEscalationSchema = z
  .object({
    available: z.boolean(),
    requestPath: z.literal(RULING_DEEP_LINKS.requestAnchor),
    adminTicketPath: z.string().min(1).nullable(),
    publicStatusPath: z.string().min(1).nullable(),
  })
  .strict();

export const assistantCitationSchema = z
  .object({
    sourceId: publicSourceIdSchema,
    sourceType: z.enum(["published_rule", "sanitized_precedent", "public_faq"]),
    title: z.string().min(1).max(240),
    ruleSetId: publicSourceIdSchema,
    releaseId: publicSourceIdSchema,
    version: z.string().min(1).max(80),
    current: z.boolean(),
    conflictState: z.enum(["none", "detected", "under_review", "resolved"]),
    publicUrl: safePublicUrlSchema,
  })
  .strict();

export const assistantQuestionRequestSchema = z
  .object({
    question: z.string().trim().min(6, "Ask a complete question.").max(2_000, "Keep the question under 2,000 characters."),
    scope: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("global") }).strict(),
      z.object({ kind: z.literal("season"), seasonId: publicSourceIdSchema }).strict(),
      z
        .object({ kind: z.literal("division"), seasonId: publicSourceIdSchema, divisionId: publicSourceIdSchema })
        .strict(),
    ]),
  })
  .strict();

const deterministicGuidanceResponseSchema = z
  .object({
    ok: z.literal(true),
    apiVersion: z.literal(PUBLIC_ASSISTANT_API_VERSION),
    kind: z.literal("deterministic_guidance"),
    authority: z.literal("advisory"),
    answer: z.string().min(1).max(12_000),
    citations: z.array(assistantCitationSchema).min(1),
    determinism: z
      .object({
        classification: z.literal("deterministic"),
        validator: z.literal("published-rules-engine"),
        verified: z.literal(true),
        ruleVersion: z.string().min(1).max(80),
      })
      .strict(),
    modelConfidence: z.number().min(0).max(1),
    model: z.literal(PUBLIC_ASSISTANT_MODEL),
    escalation: assistantEscalationSchema,
  })
  .strict()
  .superRefine((response, context) => {
    const controllingCitation = response.citations.some(
      (citation) =>
        citation.sourceType === "published_rule" &&
        citation.current &&
        (citation.conflictState === "none" || citation.conflictState === "resolved") &&
        citation.version === response.determinism.ruleVersion,
    );

    if (!controllingCitation) {
      context.addIssue({
        code: "custom",
        path: ["citations"],
        message: "Deterministic guidance requires a conflict-free current published rule matching ruleVersion.",
      });
    }
  });

const ambiguousGuidanceResponseSchema = z
  .object({
    ok: z.literal(true),
    apiVersion: z.literal(PUBLIC_ASSISTANT_API_VERSION),
    kind: z.literal("ambiguous_guidance"),
    authority: z.literal("advisory"),
    answer: z.string().min(1).max(12_000),
    citations: z.array(assistantCitationSchema),
    determinism: z
      .object({
        classification: z.literal("ambiguous"),
        validator: z.literal("published-rules-engine"),
        verified: z.literal(false),
        ruleVersion: z.null(),
      })
      .strict(),
    modelConfidence: z.number().min(0).max(1).nullable(),
    model: z.literal(PUBLIC_ASSISTANT_MODEL),
    escalation: assistantEscalationSchema,
  })
  .strict();

const assistantUnavailableResponseSchema = z
  .object({
    ok: z.literal(false),
    apiVersion: z.literal(PUBLIC_ASSISTANT_API_VERSION),
    kind: z.literal("assistant_unavailable"),
    code: z.literal("PUBLIC_ASSISTANT_DISABLED"),
    message: z.string().min(1).max(1_000),
    reasons: z.array(
      z.enum([
        "durable_feature_flag_missing",
        "sanitized_sources_missing",
        "sanitized_source_version_mismatch",
        "privacy_guard_missing",
        "durable_rate_limiter_missing",
        "free_model_contract_mismatch",
      ]),
    ),
    retryable: z.literal(false),
    model: z.literal(PUBLIC_ASSISTANT_MODEL),
    paidFallback: z.literal(false),
    escalation: assistantEscalationSchema,
  })
  .strict();

const assistantValidationErrorResponseSchema = z
  .object({
    ok: z.literal(false),
    apiVersion: z.literal(PUBLIC_ASSISTANT_API_VERSION),
    kind: z.literal("validation_error"),
    code: z.literal("INVALID_ASSISTANT_REQUEST"),
    message: z.string().min(1).max(1_000),
    fieldErrors: z.record(z.string(), z.array(z.string())),
  })
  .strict();

export const publicAssistantResponseSchema = z.discriminatedUnion("kind", [
  deterministicGuidanceResponseSchema,
  ambiguousGuidanceResponseSchema,
  assistantUnavailableResponseSchema,
  assistantValidationErrorResponseSchema,
]);

export function parseAssistantQuestion(input: unknown) {
  return assistantQuestionRequestSchema.safeParse(input);
}

export function parsePublicAssistantResponse(input: unknown): PublicAssistantResponse | null {
  const parsed = publicAssistantResponseSchema.safeParse(input);
  return parsed.success ? (parsed.data as PublicAssistantResponse) : null;
}

export function assertPublicAssistantResponse(input: unknown): PublicAssistantResponse {
  return publicAssistantResponseSchema.parse(input) as PublicAssistantResponse;
}

export function buildUnavailableResponse(reasons: AssistantUnavailableReason[]): AssistantUnavailableResponse {
  return assertPublicAssistantResponse({
    ok: false,
    apiVersion: PUBLIC_ASSISTANT_API_VERSION,
    kind: "assistant_unavailable",
    code: "PUBLIC_ASSISTANT_DISABLED",
    message:
      "The public rules assistant is disabled. Once it launches, it will use approved public-safe sources only. No guidance or ticket was created from this request.",
    reasons,
    retryable: false,
    model: PUBLIC_ASSISTANT_MODEL,
    paidFallback: false,
    escalation: {
      available: false,
      requestPath: RULING_DEEP_LINKS.requestAnchor,
      adminTicketPath: null,
      publicStatusPath: RULING_DEEP_LINKS.publicTicketStatusPathTemplate,
    },
  }) as AssistantUnavailableResponse;
}

export function buildValidationError(fieldErrors: Record<string, string[]>): AssistantValidationErrorResponse {
  return assertPublicAssistantResponse({
    ok: false,
    apiVersion: PUBLIC_ASSISTANT_API_VERSION,
    kind: "validation_error",
    code: "INVALID_ASSISTANT_REQUEST",
    message: "Review the highlighted request details and try again.",
    fieldErrors,
  }) as AssistantValidationErrorResponse;
}
