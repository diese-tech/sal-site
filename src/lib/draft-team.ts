import type { DivisionId } from "@/types/league";

const DRAFT_DIVISION_DETAILS: Record<DivisionId, { name: string; abbreviation: string }> = {
  solar: { name: "Solar Division", abbreviation: "SD" },
  lunar: { name: "Lunar Division", abbreviation: "LD" },
  terra: { name: "Terra Division", abbreviation: "TD" },
};

export function formatDraftTeamLabel(organizationName: string, divisionId: DivisionId): string {
  return `${organizationName} - ${DRAFT_DIVISION_DETAILS[divisionId].abbreviation}`;
}

export function draftDivisionName(divisionId: DivisionId): string {
  return DRAFT_DIVISION_DETAILS[divisionId].name;
}

export function evaluateDraftTeamOrder(input: {
  baseOrder: string[];
  divisionId: DivisionId;
  organizations: Array<{ id: string; name: string }>;
  seasonTeams: Array<{ orgId: string; divisionId: DivisionId; status: string }>;
}): { valid: boolean; invalidTeamLabels: string[] } {
  const validOrgIds = new Set(
    input.seasonTeams
      .filter((team) => team.status === "active" && team.divisionId === input.divisionId)
      .map((team) => team.orgId),
  );
  const invalidOrgIds = input.baseOrder.filter((orgId) => !validOrgIds.has(orgId));
  const organizationNames = new Map(input.organizations.map((org) => [org.id, org.name]));
  const invalidTeamLabels = invalidOrgIds.flatMap((orgId) => {
    const organizationName = organizationNames.get(orgId);
    if (!organizationName) return ["Unknown saved team"];

    const activeDivisions = input.seasonTeams
      .filter((team) => team.orgId === orgId && team.status === "active")
      .map((team) => team.divisionId);
    if (activeDivisions.length === 0) return [`${organizationName} (not enrolled this season)`];
    return activeDivisions.map((divisionId) => formatDraftTeamLabel(organizationName, divisionId));
  });

  return { valid: invalidOrgIds.length === 0, invalidTeamLabels };
}
