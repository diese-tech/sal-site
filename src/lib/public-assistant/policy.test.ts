import { describe, expect, it } from "vitest";
import { PUBLIC_ASSISTANT_MODEL } from "@/types/public-assistant";
import { evaluateAssistantAvailability, evaluateDeterminism } from "./policy";

describe("public assistant policy", () => {
  it("fails closed until every durable launch gate is ready", () => {
    expect(
      evaluateAssistantAvailability({
        durableFeatureFlagEnabled: false,
        sanitizedSourceRepositoryReady: false,
        sanitizedSourceVersionVerified: false,
        privacyGuardReady: false,
        durableRateLimiterReady: false,
        model: PUBLIC_ASSISTANT_MODEL,
      }),
    ).toEqual({
      enabled: false,
      reasons: [
        "durable_feature_flag_missing",
        "sanitized_sources_missing",
        "privacy_guard_missing",
        "durable_rate_limiter_missing",
      ],
    });
  });

  it("does not permit a model outside the free launch contract", () => {
    expect(
      evaluateAssistantAvailability({
        durableFeatureFlagEnabled: true,
        sanitizedSourceRepositoryReady: true,
        sanitizedSourceVersionVerified: true,
        privacyGuardReady: true,
        durableRateLimiterReady: true,
        model: "paid/provider-model",
      }),
    ).toEqual({
      enabled: false,
      reasons: ["free_model_contract_mismatch"],
    });
  });

  it("rejects a ready repository when its approved version is not verified", () => {
    expect(
      evaluateAssistantAvailability({
        durableFeatureFlagEnabled: true,
        sanitizedSourceRepositoryReady: true,
        sanitizedSourceVersionVerified: false,
        privacyGuardReady: true,
        durableRateLimiterReady: true,
        model: PUBLIC_ASSISTANT_MODEL,
      }),
    ).toEqual({ enabled: false, reasons: ["sanitized_source_version_mismatch"] });
  });

  it("classifies guidance as deterministic only after every non-model gate passes", () => {
    expect(
      evaluateDeterminism({
        directPublishedRuleMatch: true,
        requiredFactsPresent: true,
        sourceConflictPresent: false,
        exactRuleVersion: "rules-v3",
        deterministicValidatorConfirmed: true,
      }),
    ).toEqual({
      classification: "deterministic",
      validator: "published-rules-engine",
      verified: true,
      ruleVersion: "rules-v3",
    });
  });

  it("routes a published-rule and precedent conflict to ambiguous review", () => {
    expect(
      evaluateDeterminism({
        directPublishedRuleMatch: true,
        requiredFactsPresent: true,
        sourceConflictPresent: true,
        exactRuleVersion: "rules-v3",
        deterministicValidatorConfirmed: true,
      }),
    ).toMatchObject({ classification: "ambiguous", verified: false, ruleVersion: null });
  });
});
