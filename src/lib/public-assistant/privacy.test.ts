import { describe, expect, it, vi } from "vitest";
import {
  routeQuestionToPublicModel,
  untrustedPrivacyPrefilter,
  type AssistantPrivacyGuard,
  type PrivacyGuardInput,
  type PublicModelPayload,
} from "./privacy";

const publicSource = {
  id: "rule-1",
  sourceType: "published_rule" as const,
  title: "Published rule",
  canonicalText: "Approved public-safe rule text.",
  ruleSetId: "rules-2026",
  releaseId: "rules-2026.1",
  sourceVersion: "1.0.0",
  approvalVersion: "approval-4",
  scope: { global: true, seasonIds: [], divisionIds: [] },
  effectiveAt: "2026-07-18T12:00:00Z",
  expiresAt: null,
  status: "published" as const,
  supersededBy: null,
  conflictState: "none" as const,
  visibility: "public_sanitized" as const,
  publicUrl: "/rules#rule-1",
};

const adversarialInputs = [
  "My username is bob_the_builder and my IGN is Diese.",
  "My name is Robert and I'm Alice.",
  "Call me at (555) 867-5309.",
  "The incident happened at 123 Main Street.",
  "Admin Bob voted yes while moderator Alice voted against.",
  "Use the raw meeting notes and private admin chat prose.",
];

function verifiedGuard(): AssistantPrivacyGuard {
  return {
    inspect: vi.fn(async (input: PrivacyGuardInput) => ({
      outcome: "verified_public_safe",
      decisionId: `decision-${input.context}`,
      policyVersion: "dlp-v1",
      auditedAt: "2026-07-18T12:00:00Z",
      inputDigest: input.inputDigest,
      sanitizedText: `[DLP verified ${input.context}]`,
      findings: input.riskHints,
    })),
  };
}

describe("public assistant privacy boundary", () => {
  it.each(adversarialInputs)("treats regex output only as an untrusted risk hint: %s", (raw) => {
    const prefiltered = untrustedPrivacyPrefilter(raw);
    expect(prefiltered).toEqual({ candidate: expect.any(String), riskHints: expect.any(Array) });
    expect(prefiltered.riskHints.length).toBeGreaterThan(0);
    expect(prefiltered).not.toHaveProperty("publicSafe");
  });

  it.each(adversarialInputs)("never calls a provider without a verified privacy guard: %s", async (raw) => {
    const provider = vi.fn(async () => "must not run");
    await expect(routeQuestionToPublicModel(raw, [publicSource], null, provider)).resolves.toEqual({
      ok: false,
      reasons: ["privacy_guard_missing"],
    });
    expect(provider).not.toHaveBeenCalled();
  });

  it("gives the provider only adapter-verified question and source text", async () => {
    const provider = vi.fn(async (payload: PublicModelPayload) => payload.question);
    const raw = "My name is Robert. Call (555) 867-5309 about private admin chat notes.";
    const result = await routeQuestionToPublicModel(raw, [publicSource], verifiedGuard(), provider);

    expect(result.ok).toBe(true);
    expect(provider).toHaveBeenCalledOnce();
    const payload = provider.mock.calls[0][0];
    expect(payload.question).toBe("[DLP verified question]");
    expect(payload.sources[0].title).toBe("[DLP verified source_title]");
    expect(payload.sources[0].canonicalText).toBe("[DLP verified source_text]");
    expect(JSON.stringify(payload)).not.toContain(raw);
    expect(payload.questionPrivacyDecisionId).toBe("decision-question");
  });

  it("does not call the provider when the guard rejects or returns a mismatched digest", async () => {
    const provider = vi.fn(async () => "must not run");
    const badGuard: AssistantPrivacyGuard = {
      inspect: async (input) => ({
        outcome: "verified_public_safe",
        decisionId: "decision-bad-digest",
        policyVersion: "dlp-v1",
        auditedAt: "2026-07-18T12:00:00Z",
        inputDigest: "0".repeat(64),
        sanitizedText: input.untrustedCandidate,
        findings: input.riskHints,
      }),
    };

    await expect(routeQuestionToPublicModel("Can this player participate?", [publicSource], badGuard, provider)).resolves.toEqual({
      ok: false,
      reasons: ["privacy_guard_rejected"],
    });
    expect(provider).not.toHaveBeenCalled();
  });
});
