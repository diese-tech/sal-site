import {
  PUBLIC_ASSISTANT_MODEL,
  type AssistantDeterminism,
  type AssistantUnavailableReason,
} from "@/types/public-assistant";

export interface AssistantAvailabilityInput {
  durableFeatureFlagEnabled: boolean;
  sanitizedSourceRepositoryReady: boolean;
  sanitizedSourceVersionVerified: boolean;
  model: string;
}

export interface AssistantAvailability {
  enabled: boolean;
  reasons: AssistantUnavailableReason[];
}

export interface DurablePublicAssistantFeatureGate {
  enabled: boolean;
  sourceContract: {
    ruleSetId: string;
    releaseId: string;
    approvalVersion: string;
  };
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
  if (input.sanitizedSourceRepositoryReady && !input.sanitizedSourceVersionVerified) {
    reasons.push("sanitized_source_version_mismatch");
  }
  if (input.model !== PUBLIC_ASSISTANT_MODEL) reasons.push("free_model_contract_mismatch");

  return { enabled: reasons.length === 0, reasons };
}

/** Release B must replace this with an Owner-controlled, database-backed gate. */
export function getDurablePublicAssistantFeatureGate(): DurablePublicAssistantFeatureGate | null {
  return null;
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

  if (verified) {
    return {
      classification: "deterministic",
      validator: "published-rules-engine",
      verified: true,
      ruleVersion: input.exactRuleVersion as string,
    };
  }

  return {
    classification: "ambiguous",
    validator: "published-rules-engine",
    verified: false,
    ruleVersion: null,
  };
}
