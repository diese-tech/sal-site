import { describe, expect, it } from "vitest";
import { evaluateDraftTeamOrder, formatDraftTeamLabel } from "./draft-team";

describe("formatDraftTeamLabel", () => {
  it("distinguishes one organization across every division", () => {
    expect(formatDraftTeamLabel("Baba's Kitchen", "lunar")).toBe("Baba's Kitchen - LD");
    expect(formatDraftTeamLabel("Baba's Kitchen", "terra")).toBe("Baba's Kitchen - TD");
    expect(formatDraftTeamLabel("Baba's Kitchen", "solar")).toBe("Baba's Kitchen - SD");
  });
});

describe("evaluateDraftTeamOrder", () => {
  it("accepts a team enrolled in the draft season and division regardless of the org's legacy division", () => {
    const result = evaluateDraftTeamOrder({
      baseOrder: ["org-baba"],
      divisionId: "solar",
      organizations: [{ id: "org-baba", name: "Baba's Kitchen" }],
      seasonTeams: [{ orgId: "org-baba", divisionId: "solar", status: "active" }],
    });

    expect(result).toEqual({ valid: true, invalidTeamLabels: [] });
  });

  it("describes an invalid saved team with its readable season-team label", () => {
    const result = evaluateDraftTeamOrder({
      baseOrder: ["org-baba"],
      divisionId: "solar",
      organizations: [{ id: "org-baba", name: "Baba's Kitchen" }],
      seasonTeams: [{ orgId: "org-baba", divisionId: "lunar", status: "active" }],
    });

    expect(result).toEqual({
      valid: false,
      invalidTeamLabels: ["Baba's Kitchen - LD"],
    });
  });
});
