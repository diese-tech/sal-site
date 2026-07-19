export const PUBLIC_ASSISTANT_API_VERSION = "1" as const;
export const PUBLIC_ASSISTANT_MODEL = "openrouter/free" as const;

export const RULING_DEEP_LINKS = {
  requestAnchor: "/rules#request-a-ruling",
  adminTicketPathTemplate: "/admin/tickets/{ticketId}",
  publicTicketStatusPathTemplate: null,
} as const;

declare const publicSafeModelInputBrand: unique symbol;
export type PublicSafeModelInput = string & { readonly [publicSafeModelInputBrand]: true };

export type AssistantSourceType = "published_rule" | "sanitized_precedent" | "public_faq";

export interface AssistantQuestionRequest {
  question: string;
}

export interface AssistantCitation {
  sourceId: string;
  sourceType: AssistantSourceType;
  title: string;
  ruleSetId: string;
  releaseId: string;
  version: string;
  current: boolean;
  conflictState: "none" | "detected" | "under_review" | "resolved";
  publicUrl: string;
}

export interface DeterministicAssessment {
  classification: "deterministic";
  validator: "published-rules-engine";
  verified: true;
  ruleVersion: string;
}

export interface AmbiguousAssessment {
  classification: "ambiguous";
  validator: "published-rules-engine";
  verified: false;
  ruleVersion: null;
}

export type AssistantDeterminism = DeterministicAssessment | AmbiguousAssessment;

export interface AssistantEscalation {
  available: boolean;
  requestPath: typeof RULING_DEEP_LINKS.requestAnchor;
  adminTicketPath: string | null;
  publicStatusPath: string | null;
}

export interface DeterministicGuidanceResponse {
  ok: true;
  apiVersion: typeof PUBLIC_ASSISTANT_API_VERSION;
  kind: "deterministic_guidance";
  authority: "advisory";
  answer: string;
  citations: AssistantCitation[];
  determinism: DeterministicAssessment;
  modelConfidence: number;
  model: typeof PUBLIC_ASSISTANT_MODEL;
  escalation: AssistantEscalation;
}

export interface AmbiguousGuidanceResponse {
  ok: true;
  apiVersion: typeof PUBLIC_ASSISTANT_API_VERSION;
  kind: "ambiguous_guidance";
  authority: "advisory";
  answer: string;
  citations: AssistantCitation[];
  determinism: AmbiguousAssessment;
  modelConfidence: number | null;
  model: typeof PUBLIC_ASSISTANT_MODEL;
  escalation: AssistantEscalation;
}

export type AssistantAnswerResponse = DeterministicGuidanceResponse | AmbiguousGuidanceResponse;

export type AssistantUnavailableReason =
  | "durable_feature_flag_missing"
  | "sanitized_sources_missing"
  | "sanitized_source_version_mismatch"
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
  | AssistantUnavailableResponse
  | AssistantValidationErrorResponse;
