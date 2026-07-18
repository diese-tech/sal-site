export const PUBLIC_ASSISTANT_API_VERSION = "1" as const;
export const PUBLIC_ASSISTANT_MODEL = "openrouter/free" as const;

export const RULING_DEEP_LINKS = {
  requestAnchor: "/rules#request-a-ruling",
  adminTicketPathTemplate: "/admin/tickets/{ticketId}",
  publicTicketStatusPathTemplate: null,
} as const;

export type AssistantIntent = "guidance" | "request_official_ruling";
export type AssistantSourceType = "published_rule" | "sanitized_precedent" | "public_faq";

export interface AssistantQuestionRequest {
  question: string;
  intent: AssistantIntent;
  rulingRequestConfirmed?: boolean;
}

export interface AssistantCitation {
  sourceId: string;
  sourceType: AssistantSourceType;
  title: string;
  version: string;
  publicUrl: string;
}

export interface AssistantDeterminism {
  classification: "deterministic" | "ambiguous" | "unresolved";
  validator: "published-rules-engine";
  verified: boolean;
  ruleVersion: string | null;
}

export interface AssistantEscalation {
  available: boolean;
  requestPath: typeof RULING_DEEP_LINKS.requestAnchor;
  adminTicketPath: string | null;
  publicStatusPath: string | null;
}

export interface AssistantAnswerResponse {
  ok: true;
  apiVersion: typeof PUBLIC_ASSISTANT_API_VERSION;
  kind: "deterministic_guidance" | "ambiguous_guidance";
  authority: "advisory";
  answer: string;
  citations: AssistantCitation[];
  determinism: AssistantDeterminism;
  modelConfidence: number | null;
  model: typeof PUBLIC_ASSISTANT_MODEL;
  escalation: AssistantEscalation;
}

export interface AssistantTicketResponse {
  ok: true;
  apiVersion: typeof PUBLIC_ASSISTANT_API_VERSION;
  kind: "ticket_created";
  authority: "official_review_pending";
  ticketId: string;
  message: string;
  escalation: AssistantEscalation;
}

export type AssistantUnavailableReason =
  | "durable_feature_flag_missing"
  | "sanitized_sources_missing"
  | "free_model_contract_mismatch";

export interface AssistantUnavailableResponse {
  ok: false;
  apiVersion: typeof PUBLIC_ASSISTANT_API_VERSION;
  kind: "assistant_unavailable";
  code: "PUBLIC_ASSISTANT_DISABLED";
  message: string;
  reasons: AssistantUnavailableReason[];
  retryable: false;
  model: typeof PUBLIC_ASSISTANT_MODEL;
  paidFallback: false;
  escalation: AssistantEscalation;
}

export interface AssistantValidationErrorResponse {
  ok: false;
  apiVersion: typeof PUBLIC_ASSISTANT_API_VERSION;
  kind: "validation_error";
  code: "INVALID_ASSISTANT_REQUEST";
  message: string;
  fieldErrors: Record<string, string[]>;
}

export type PublicAssistantResponse =
  | AssistantAnswerResponse
  | AssistantTicketResponse
  | AssistantUnavailableResponse
  | AssistantValidationErrorResponse;
