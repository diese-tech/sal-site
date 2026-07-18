import { z } from "zod";
import {
  PUBLIC_ASSISTANT_API_VERSION,
  PUBLIC_ASSISTANT_MODEL,
  RULING_DEEP_LINKS,
  type AssistantUnavailableReason,
  type AssistantUnavailableResponse,
  type AssistantValidationErrorResponse,
} from "@/types/public-assistant";

export const assistantQuestionRequestSchema = z
  .object({
    question: z.string().trim().min(6, "Ask a complete question.").max(2_000, "Keep the question under 2,000 characters."),
    intent: z.enum(["guidance", "request_official_ruling"]),
    rulingRequestConfirmed: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.intent === "request_official_ruling" && value.rulingRequestConfirmed !== true) {
      context.addIssue({
        code: "custom",
        path: ["rulingRequestConfirmed"],
        message: "Confirm the advisory notice before requesting an official ruling.",
      });
    }
  });

export function parseAssistantQuestion(input: unknown) {
  return assistantQuestionRequestSchema.safeParse(input);
}

export function buildUnavailableResponse(reasons: AssistantUnavailableReason[]): AssistantUnavailableResponse {
  return {
    ok: false,
    apiVersion: PUBLIC_ASSISTANT_API_VERSION,
    kind: "assistant_unavailable",
    code: "PUBLIC_ASSISTANT_DISABLED",
    message:
      "The public rules assistant is not available yet. SAL will not generate or submit a ruling until approved rule sources and the durable feature gate are ready.",
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
  };
}

export function buildValidationError(fieldErrors: Record<string, string[]>): AssistantValidationErrorResponse {
  return {
    ok: false,
    apiVersion: PUBLIC_ASSISTANT_API_VERSION,
    kind: "validation_error",
    code: "INVALID_ASSISTANT_REQUEST",
    message: "Review the highlighted request details and try again.",
    fieldErrors,
  };
}
