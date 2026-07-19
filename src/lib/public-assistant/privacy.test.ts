import { describe, expect, it, vi } from "vitest";
import { preparePublicSafeModelInput, routeQuestionToPublicModel, type PublicModelPayload } from "./privacy";

const publicSource = {
  id: "rule-1",
  sourceType: "published_rule",
  title: "Published rule",
  canonicalText: "Approved public-safe rule text. Contact source@example.com only through the public process.",
  ruleSetId: "rules-2026",
  releaseId: "rules-2026.1",
  sourceVersion: "1.0.0",
  approvalVersion: "approval-4",
  scope: { global: true, seasonIds: [], divisionIds: [] },
  effectiveAt: "2026-07-18T12:00:00Z",
  expiresAt: null,
  status: "published",
  supersededBy: null,
  conflictState: "none",
  visibility: "public_sanitized",
  publicUrl: "/rules#rule-1",
};

describe("public assistant privacy boundary", () => {
  it("redacts Discord identifiers and email before branding model input", () => {
    const prepared = preparePublicSafeModelInput(
      "Can <@146116042182098944> contact player@example.com about 881999605259178045?",
    );

    expect(prepared.ok).toBe(true);
    if (prepared.ok) {
      expect(prepared.value).not.toContain("146116042182098944");
      expect(prepared.value).not.toContain("881999605259178045");
      expect(prepared.value).not.toContain("player@example.com");
      expect(prepared.redactions).toEqual(["discord_identifier", "email_address"]);
    }
  });

  it.each([
    "api_key=super-secret-value-12345",
    "Bearer abcdefghijklmnopqrstuvwxyz",
    "Please use the raw meeting notes to answer this.",
    "https://discord.com/api/webhooks/123456789012345678/token-value",
  ])("rejects prohibited provider input: %s", (question) => {
    expect(preparePublicSafeModelInput(question)).toMatchObject({ ok: false });
  });

  it("never gives a provider the raw prohibited identifiers", async () => {
    const provider = vi.fn(async (payload: PublicModelPayload) => payload.question);
    const raw = "Can <@146116042182098944> email player@example.com about this rule?";
    const result = await routeQuestionToPublicModel(raw, [publicSource], provider);

    expect(result.ok).toBe(true);
    expect(provider).toHaveBeenCalledOnce();
    const payload = provider.mock.calls[0][0];
    expect(payload.question).not.toContain("146116042182098944");
    expect(payload.question).not.toContain("player@example.com");
    expect(payload.question).toContain("[redacted Discord identifier]");
    expect(provider.mock.calls[0][0].sources[0].canonicalText).not.toContain("source@example.com");
  });

  it("does not call the provider when private evidence is detected", async () => {
    const provider = vi.fn(async () => "should not run");
    const result = await routeQuestionToPublicModel("Use private evidence from the admin chat.", [publicSource], provider);

    expect(result).toEqual({ ok: false, reasons: ["private_evidence"] });
    expect(provider).not.toHaveBeenCalled();
  });
});
