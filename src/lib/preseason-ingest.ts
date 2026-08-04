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

  // This flow is specifically "Ingest from PRESEASON" — allowing an arbitrary
  // active/post-season/offseason source would let an admin copy a live or
  // historical season's roster into another season, which isn't what this
  // action is for and bypasses the intended preseason→real-season model
  // (Codex review, #230).
  if (source.season.status !== "pre-season") {
    throw new Error(`Source season "${source.season.name}" is not a preseason season.`);
  }

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

  const captainByTeam = new Map<string, string>();
  for (const row of rosterRows) {
    if (row.is_captain && row.org_id && row.division_id) {
      const key = `${row.org_id}:${row.division_id}`;
      if (!captainByTeam.has(key)) captainByTeam.set(key, row.player_id);
    }
  }

  const divisions: PreseasonIngestDivisionPreview[] = source.divisions.map((division) => {
    const orgs = source.orgAssignments
      .filter((assignment) => assignment.division_id === division.id)
      .flatMap((assignment) => {
        const org = orgById.get(assignment.org_id);
        if (!org) return [];
        const captainId = captainByTeam.get(`${assignment.org_id}:${assignment.division_id}`) ?? null;
        const captainIgn = captainId ? playerById.get(captainId)?.ign ?? null : null;
        return [{ orgId: org.id, orgName: org.name, orgTag: org.tag, captainId, captainIgn }];
      })
      .sort((a, b) => a.orgName.localeCompare(b.orgName));

    // Only captains keep their org on ingest (see ingestSeasonFromPreseason) —
    // an ordinary org-affiliated preseason player (sub/starter) lands as a
    // free agent in the target season, so the preview must show them here
    // rather than silently carrying an assignment the admin never saw
    // (Codex review, #230).
    const freeAgents = rosterRows
      .filter((row) => !row.is_captain && row.division_id === division.id)
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
    freeAgentCount: rosterRows.filter((row) => !row.is_captain).length,
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
      // Default carry-forward rules (#230): only captains keep their org —
      // an ordinary org-affiliated preseason player (sub/starter) must land
      // as a team-unassigned free agent in the target season's draft pool.
      orgId: row.is_captain ? row.org_id : null,
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
