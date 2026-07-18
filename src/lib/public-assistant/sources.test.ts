import { describe, expect, it } from "vitest";
import { orderSanitizedSources, type SanitizedAssistantSource } from "./sources";

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
    version: "v1",
    effectiveAt,
    publicUrl: `/rules#${id}`,
    status: "published",
    visibility: "public_sanitized",
  };
}

describe("sanitized assistant sources", () => {
  it("always ranks current published rules ahead of precedent and FAQ material", () => {
    const ordered = orderSanitizedSources([
      source("faq", "public_faq", "2026-07-18T12:00:00Z"),
      source("precedent", "sanitized_precedent", "2026-07-18T12:00:00Z"),
      source("rule", "published_rule", "2026-01-01T12:00:00Z"),
    ]);

    expect(ordered.map(({ id }) => id)).toEqual(["rule", "precedent", "faq"]);
  });
});
