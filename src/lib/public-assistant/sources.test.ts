import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicSafeModelInput } from "@/types/public-assistant";
import {
  getSanitizedSourceRetriever,
  orderSanitizedSources,
  sanitizedAssistantSourceSchema,
  selectEligibleSources,
  verifySanitizedSourceReadiness,
  selectRelevantRulebookExcerpt,
  type SanitizedAssistantSource,
} from "./sources";

afterEach(() => {
  vi.unstubAllGlobals();
});

function source(
  id: string,
  sourceType: SanitizedAssistantSource["sourceType"],
  effectiveAt: string,
): SanitizedAssistantSource {
  return {
    id,
    sourceType,
    title: id,
    canonicalText: "Approved public-safe text.",
    ruleSetId: "rules-2026",
    releaseId: "rules-2026.1",
    sourceVersion: "1.0.0",
    approvalVersion: "approval-4",
    scope: { global: true, seasonIds: [], divisionScopes: [] },
    effectiveAt,
    expiresAt: null,
    status: "published",
    supersededBy: null,
    conflictState: "none",
    visibility: "public_sanitized",
    publicUrl: `/rules#${id}`,
  };
}

const expectedContract = {
  ruleSetId: "rules-2026",
  releaseId: "rules-2026.1",
  approvalVersion: "approval-4",
};

describe("sanitized assistant sources", () => {
  it("sends the model the relevant rulebook sections instead of the full document", () => {
    const text = [
      "1.0 Purpose\nGeneral league purpose and conduct.",
      "9.0 Pause Rules\nEach team may pause once per set for technical issues.",
      "26.0 Rulebook Disclaimer\nSAL admins make binding rulings.",
    ].join("\n\n");

    const excerpt = selectRelevantRulebookExcerpt(text, "How often can a team pause for technical reasons?");
    expect(excerpt).toContain("9.0 Pause Rules");
    expect(excerpt).not.toContain("1.0 Purpose");
  });

  it("retrieves the validated Google Doc rulebook and approved Terra precedent", async () => {
    const exportedRulebook = [
      "1.0 Purpose",
      "Published competition rules. ".repeat(45),
      "8.0 Seeding",
      "Round-robin league points.",
      "26.0 Rulebook Disclaimer",
    ].join("\n");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(exportedRulebook, { status: 200 })));

    const retriever = getSanitizedSourceRetriever();
    await expect(retriever?.readiness()).resolves.toMatchObject({ ready: true, sourceCount: 2 });
    const sources = await retriever?.search({
      question: "How does Terra work?" as PublicSafeModelInput,
      scope: { kind: "global" },
      limit: 8,
      sourceTypes: ["published_rule", "sanitized_precedent"],
    });

    expect(sources?.map(({ id }) => id)).toEqual(["sal-rulebook-google-doc", "terra-solar-adaptation"]);
    expect(sources?.some(({ sourceType }) => sourceType === "public_faq")).toBe(false);
  });

  it("always ranks current published rules ahead of precedent and FAQ material", () => {
    const ordered = orderSanitizedSources([
      source("faq", "public_faq", "2026-07-18T12:00:00Z"),
      source("precedent", "sanitized_precedent", "2026-07-18T12:00:00Z"),
      source("rule", "published_rule", "2026-01-01T12:00:00Z"),
    ]);

    expect(ordered.map(({ id }) => id)).toEqual(["rule", "precedent", "faq"]);
  });

  it("rejects invalid scope, expiry, supersession, and unsafe source URLs", () => {
    expect(
      sanitizedAssistantSourceSchema.safeParse({
        ...source("bad", "published_rule", "2026-07-18T12:00:00Z"),
        scope: { global: false, seasonIds: [], divisionScopes: [] },
        expiresAt: "2026-07-17T12:00:00Z",
        supersededBy: "rule-next",
        publicUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
    expect(
      sanitizedAssistantSourceSchema.safeParse({
        ...source("mixed-scope", "published_rule", "2026-07-18T12:00:00Z"),
        scope: { global: true, seasonIds: ["season-3"], divisionScopes: [] },
      }).success,
    ).toBe(false);
    expect(
      sanitizedAssistantSourceSchema.safeParse({
        ...source("division-without-season", "published_rule", "2026-07-18T12:00:00Z"),
        scope: {
          global: false,
          seasonIds: [],
          divisionScopes: [{ seasonId: "", divisionId: "solar" }],
        },
      }).success,
    ).toBe(false);
  });

  it("verifies exact rule-set, release, and approval versions before enablement", () => {
    expect(
      verifySanitizedSourceReadiness(
        {
          ready: true,
          ruleSetId: "rules-2026",
          releaseId: "rules-2026.1",
          approvalVersion: "approval-4",
          sourceCount: 12,
          verifiedAt: "2026-07-18T12:00:00Z",
        },
        expectedContract,
      ),
    ).toEqual({ verified: true, reasons: [] });
  });

  it("fails readiness when the approved release drifts", () => {
    expect(
      verifySanitizedSourceReadiness(
        {
          ready: true,
          ruleSetId: "rules-2026",
          releaseId: "rules-2025.9",
          approvalVersion: "approval-4",
          sourceCount: 12,
          verifiedAt: "2026-07-18T12:00:00Z",
        },
        expectedContract,
      ),
    ).toEqual({ verified: false, reasons: ["release_mismatch"] });
  });

  it("binds sources to the exact release, current time, scope, supersession, and conflict contract", () => {
    const eligibleRule = {
      ...source("eligible-rule", "published_rule", "2026-07-01T12:00:00Z"),
      scope: {
        global: false,
        seasonIds: [],
        divisionScopes: [{ seasonId: "season-3", divisionId: "solar" }],
      },
    };
    const eligiblePrecedent = {
      ...source("eligible-precedent", "sanitized_precedent", "2026-07-10T12:00:00Z"),
      conflictState: "resolved" as const,
    };
    const candidates = [
      eligiblePrecedent,
      eligibleRule,
      { ...source("stale", "published_rule", "2026-01-01T12:00:00Z"), status: "superseded" as const, supersededBy: "eligible-rule" },
      source("future", "published_rule", "2026-08-01T12:00:00Z"),
      { ...source("expired", "published_rule", "2026-01-01T12:00:00Z"), expiresAt: "2026-07-17T12:00:00Z" },
      {
        ...source("out-of-scope", "published_rule", "2026-01-01T12:00:00Z"),
        scope: {
          global: false,
          seasonIds: [],
          divisionScopes: [{ seasonId: "season-2", divisionId: "lunar" }],
        },
      },
      { ...source("different-release", "published_rule", "2026-01-01T12:00:00Z"), releaseId: "rules-2025.9" },
      { ...source("conflict", "published_rule", "2026-01-01T12:00:00Z"), conflictState: "under_review" as const },
    ];

    const selected = selectEligibleSources(candidates, {
      contract: expectedContract,
      scope: { kind: "division", seasonId: "season-3", divisionId: "solar" },
      now: "2026-07-18T12:00:00Z",
    });

    expect(selected.eligible.map(({ id }) => id)).toEqual(["eligible-rule", "eligible-precedent"]);
    expect(Object.fromEntries(selected.rejected.map(({ id, reasons }) => [id, reasons]))).toMatchObject({
      stale: ["superseded"],
      future: ["not_yet_effective"],
      expired: ["expired"],
      "out-of-scope": ["out_of_scope"],
      "different-release": ["release_mismatch"],
      conflict: ["unresolved_conflict"],
    });
  });

  it("does not expose season or division material to a global request", () => {
    const scoped = {
      ...source("season-only", "published_rule", "2026-07-01T12:00:00Z"),
      scope: { global: false, seasonIds: ["season-3"], divisionScopes: [] },
    };
    expect(
      selectEligibleSources([scoped], {
        contract: expectedContract,
        scope: { kind: "global" },
        now: "2026-07-18T12:00:00Z",
      }).eligible,
    ).toEqual([]);
  });

  it("preserves explicit season and division pairings without creating cross-pair matches", () => {
    const paired = {
      ...source("paired-divisions", "sanitized_precedent", "2026-07-01T12:00:00Z"),
      scope: {
        global: false,
        seasonIds: [],
        divisionScopes: [
          { seasonId: "season-1", divisionId: "solar" },
          { seasonId: "season-2", divisionId: "lunar" },
        ],
      },
    };

    const exactPair = selectEligibleSources([paired], {
      contract: expectedContract,
      scope: { kind: "division", seasonId: "season-1", divisionId: "solar" },
      now: "2026-07-18T12:00:00Z",
    });
    const crossedPair = selectEligibleSources([paired], {
      contract: expectedContract,
      scope: { kind: "division", seasonId: "season-1", divisionId: "lunar" },
      now: "2026-07-18T12:00:00Z",
    });

    expect(exactPair.eligible.map(({ id }) => id)).toEqual(["paired-divisions"]);
    expect(crossedPair.eligible).toEqual([]);
    expect(crossedPair.rejected).toEqual([
      { id: "paired-divisions", reasons: ["out_of_scope"] },
    ]);
  });
});
