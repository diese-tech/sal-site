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
  const captainByOrg = new Map<string, string>();
  for (const assignment of rosterAssignments) {
    if (assignment.is_captain && assignment.org_id && !captainByOrg.has(assignment.org_id)) {
      captainByOrg.set(assignment.org_id, assignment.player_id);
    }
  }

  const orgs = orgAssignments.flatMap((assignment) => {
    const org = orgById.get(assignment.org_id);
    return org
      ? [{
          ...org,
          divisionId: assignment.division_id,
          captainId: captainByOrg.get(assignment.org_id),
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
