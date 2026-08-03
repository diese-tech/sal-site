import type { DivisionId } from "@/types/league";
import {
  getAllSeasons,
  getSeasonRosterAdminData,
  saveSeasonOrgAssignment,
  saveSeasonRosterAssignment,
  writeAuditLog,
} from "@/lib/league-data";

/**
 * "Ingest from Preseason" (#230 part 3): carries selected preseason
 * participation (division, org enrollment, captain + captain org) into a
 * newly created real season without re-ingesting player identities or
 * copying preseason stats/history. Preseason and target season remain
 * separate season_id rows — this only creates new season_rosters/season_orgs
 * rows in the target season that reference the same player_ids.
 */

export interface PreseasonIngestOrgPreview {
  orgId: string;
  orgName: string;
  orgTag: string;
  captainId: string | null;
  captainIgn: string | null;
}

export interface PreseasonIngestFreeAgentPreview {
  playerId: string;
  ign: string;
}

export interface PreseasonIngestDivisionPreview {
  divisionId: DivisionId;
  divisionName: string;
  orgs: PreseasonIngestOrgPreview[];
  freeAgents: PreseasonIngestFreeAgentPreview[];
}

export interface PreseasonIngestPreview {
  sourceSeasonId: string;
  sourceSeasonName: string;
  targetSeasonId: string;
  targetSeasonName: string;
  orgCount: number;
  captainCount: number;
  freeAgentCount: number;
  totalPlayers: number;
  divisions: PreseasonIngestDivisionPreview[];
}

async function loadIngestSource(sourceSeasonId: string, targetSeasonId: string) {
  if (sourceSeasonId === targetSeasonId) {
    throw new Error("Source and target season must differ.");
  }
  const [source, seasons] = await Promise.all([
    getSeasonRosterAdminData(sourceSeasonId),
    getAllSeasons(),
  ]);
  const target = seasons.find((season) => season.id === targetSeasonId);
  if (!target) throw new Error(`Target season "${targetSeasonId}" does not exist.`);

  // Inactive rows were explicitly removed from the preseason roster by an
  // admin — carrying them forward would resurrect participation the admin
  // deliberately ended, so only active/free_agent rows ingest.
  const rosterRows = source.rosterAssignments.filter((row) => row.roster_status !== "inactive");
  return { source, target, rosterRows };
}

export async function getPreseasonIngestPreview(
  sourceSeasonId: string,
  targetSeasonId: string,
): Promise<PreseasonIngestPreview> {
  const { source, target, rosterRows } = await loadIngestSource(sourceSeasonId, targetSeasonId);

  const orgById = new Map(source.orgCatalog.map((org) => [org.id, org]));
  const playerById = new Map(source.playerCatalog.map((player) => [player.id, player]));

  const captainByOrg = new Map<string, string>();
  for (const row of rosterRows) {
    if (row.is_captain && row.org_id && !captainByOrg.has(row.org_id)) {
      captainByOrg.set(row.org_id, row.player_id);
    }
  }

  const divisions: PreseasonIngestDivisionPreview[] = source.divisions.map((division) => {
    const orgs = source.orgAssignments
      .filter((assignment) => assignment.division_id === division.id)
      .flatMap((assignment) => {
        const org = orgById.get(assignment.org_id);
        if (!org) return [];
        const captainId = captainByOrg.get(assignment.org_id) ?? null;
        const captainIgn = captainId ? playerById.get(captainId)?.ign ?? null : null;
        return [{ orgId: org.id, orgName: org.name, orgTag: org.tag, captainId, captainIgn }];
      })
      .sort((a, b) => a.orgName.localeCompare(b.orgName));

    const freeAgents = rosterRows
      .filter((row) => !row.org_id && row.division_id === division.id)
      .flatMap((row) => {
        const player = playerById.get(row.player_id);
        return player ? [{ playerId: player.id, ign: player.ign }] : [];
      })
      .sort((a, b) => a.ign.localeCompare(b.ign));

    return { divisionId: division.id, divisionName: division.name, orgs, freeAgents };
  });

  return {
    sourceSeasonId,
    sourceSeasonName: source.season.name,
    targetSeasonId,
    targetSeasonName: target.name,
    orgCount: source.orgAssignments.length,
    captainCount: rosterRows.filter((row) => row.is_captain).length,
    freeAgentCount: rosterRows.filter((row) => !row.org_id).length,
    totalPlayers: rosterRows.length,
    divisions,
  };
}

export async function ingestSeasonFromPreseason(
  sourceSeasonId: string,
  targetSeasonId: string,
): Promise<{ orgsIngested: number; playersIngested: number }> {
  const { source, rosterRows } = await loadIngestSource(sourceSeasonId, targetSeasonId);

  // Orgs must exist in the target season's season_orgs before roster rows are
  // written: saveSeasonRosterAssignment resolves a captain/org player's
  // division via a season_orgs lookup scoped to the TARGET season.
  for (const assignment of source.orgAssignments) {
    await saveSeasonOrgAssignment(targetSeasonId, assignment.org_id, assignment.division_id);
  }

  for (const row of rosterRows) {
    await saveSeasonRosterAssignment({
      seasonId: targetSeasonId,
      playerId: row.player_id,
      orgId: row.org_id,
      divisionId: row.division_id,
      isCaptain: row.is_captain,
    });
  }

  await writeAuditLog("ingest_from_preseason", "season", targetSeasonId, {
    sourceSeasonId,
    orgsIngested: source.orgAssignments.length,
    playersIngested: rosterRows.length,
  });

  return { orgsIngested: source.orgAssignments.length, playersIngested: rosterRows.length };
}
