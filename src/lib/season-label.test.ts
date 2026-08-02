import { describe, expect, it } from "vitest";
import { formatSeasonLabel } from "./season-label";

describe("formatSeasonLabel", () => {
  it.each([
    ["Preseason 2", "pre-season", "Preseason 2 · Pre-Season"],
    ["Season 1", "active", "Season 1 · Active"],
    ["Season 1", "post-season", "Season 1 · Post-Season"],
    ["Season 2", "offseason", "Season 2 · Offseason"],
  ] as const)("formats %s in the %s state", (name, status, expected) => {
    expect(formatSeasonLabel({ name, status })).toBe(expected);
  });
});
