import { describe, expect, it } from "vitest";
import {
  orderSanitizedSources,
  sanitizedAssistantSourceSchema,
  verifySanitizedSourceReadiness,
  type SanitizedAssistantSource,
} from "./sources";

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
    scope: { global: true, seasonIds: [], divisionIds: [] },
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
        scope: { global: false, seasonIds: [], divisionIds: [] },
        expiresAt: "2026-07-17T12:00:00Z",
        supersededBy: "rule-next",
        publicUrl: "javascript:alert(1)",
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
});
