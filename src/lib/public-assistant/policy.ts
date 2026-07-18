import {
  PUBLIC_ASSISTANT_MODEL,
  type AssistantDeterminism,
  type AssistantUnavailableReason,
} from "@/types/public-assistant";

export interface AssistantAvailabilityInput {
  durableFeatureFlagEnabled: boolean;
  sanitizedSourceRepositoryReady: boolean;
  model: string;
}

export interface AssistantAvailability {
  enabled: boolean;
  reasons: AssistantUnavailableReason[];
}

export interface DeterminismInput {
  directPublishedRuleMatch: boolean;
  requiredFactsPresent: boolean;
  sourceConflictPresent: boolean;
  exactRuleVersion: string | null;
  deterministicValidatorConfirmed: boolean;
}

export function evaluateAssistantAvailability(input: AssistantAvailabilityInput): AssistantAvailability {
  const reasons: AssistantUnavailableReason[] = [];

  if (!input.durableFeatureFlagEnabled) reasons.push("durable_feature_flag_missing");
  if (!input.sanitizedSourceRepositoryReady) reasons.push("sanitized_sources_missing");
  if (input.model !== PUBLIC_ASSISTANT_MODEL) reasons.push("free_model_contract_mismatch");

  return { enabled: reasons.length === 0, reasons };
}

/**
 * This decision intentionally accepts no model-confidence value. Confidence may
 * describe an answer, but only published-rule facts and the deterministic
 * validator may classify official guidance as deterministic.
 */
export function evaluateDeterminism(input: DeterminismInput): AssistantDeterminism {
  const verified =
    input.directPublishedRuleMatch &&
    input.requiredFactsPresent &&
    !input.sourceConflictPresent &&
    Boolean(input.exactRuleVersion) &&
    input.deterministicValidatorConfirmed;

  return {
    classification: verified ? "deterministic" : "ambiguous",
    validator: "published-rules-engine",
    verified,
    ruleVersion: verified ? input.exactRuleVersion : null,
  };
}
