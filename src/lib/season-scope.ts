import type { DivisionId, LeaguePlayer, Org } from "@/types/league";

export interface SeasonOrgAssignment {
  org_id: string;
  division_id: DivisionId;
}

export interface SeasonRosterAssignment {
  player_id: string;
  org_id: string | null;
  division_id: DivisionId | null;
  is_captain: boolean;
}

export function scopeSeasonEntities(
  orgCatalog: Org[],
  playerCatalog: LeaguePlayer[],
  orgAssignments: SeasonOrgAssignment[],
  rosterAssignments: SeasonRosterAssignment[],
): { orgs: Org[]; players: LeaguePlayer[] } {
  const orgById = new Map(orgCatalog.map((org) => [org.id, org]));
  const playerById = new Map(playerCatalog.map((player) => [player.id, player]));
  const captainByTeam = new Map<string, string>();
  for (const assignment of rosterAssignments) {
    if (assignment.is_captain && assignment.org_id && assignment.division_id) {
      const key = `${assignment.org_id}:${assignment.division_id}`;
      if (!captainByTeam.has(key)) captainByTeam.set(key, assignment.player_id);
    }
  }

  const orgs = orgAssignments.flatMap((assignment) => {
    const org = orgById.get(assignment.org_id);
    return org
      ? [{
          ...org,
          divisionId: assignment.division_id,
          captainId: captainByTeam.get(`${assignment.org_id}:${assignment.division_id}`),
        }]
      : [];
  });
  const players = rosterAssignments.flatMap((assignment) => {
    const player = playerById.get(assignment.player_id);
    return player
      ? [{
          ...player,
          orgId: assignment.org_id ?? undefined,
          divisionId: assignment.division_id ?? undefined,
          isCaptain: assignment.is_captain,
        }]
      : [];
  });

  return { orgs, players };
}

// Admin Teams catalog view: season-scoped orgs already carry one row per org-division
// team (an org can field independent teams in multiple divisions). The full identity
// catalog is unfiltered by season enrollment, so only fold in the orgs missing from the
// season — a just-created or not-yet-enrolled team — without clobbering the per-division
// rows already resolved for the current season.
export function mergeSeasonAndCatalogOrgs(seasonOrgs: Org[], catalogOrgs: Org[]): Org[] {
  const seasonOrgIds = new Set(seasonOrgs.map((org) => org.id));
  return [...seasonOrgs, ...catalogOrgs.filter((org) => !seasonOrgIds.has(org.id))];
}
