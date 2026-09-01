import type { ExtractedGame, ExtractedPlayer } from "@/types/match-report";

/**
 * Rebuilds the per-game view of a completed report from the stat rows that
 * were actually published.
 *
 * `match_reports.extracted_data` is *not* the record of what was submitted —
 * it holds the AI/host extraction, and the admin's corrections in the review
 * screen never write back to it. `player_match_stats` is the authoritative
 * row set, so a completed report is displayed from that instead.
 */

export interface PublishedStatRow {
  match_report_id: string;
  game_number: number;
  player_ign: string;
  player_id: string | null;
  org_id: string | null;
  won: boolean;
  kills: number;
  deaths: number;
  assists: number;
  god_played: string | null;
  role: string | null;
  damage_dealt: number | null;
  damage_mitigated: number | null;
}

function toPlayer(row: PublishedStatRow, homeOrgId: string): ExtractedPlayer {
  return {
    ign: row.player_ign,
    playerId: row.player_id ?? undefined,
    side: row.org_id === homeOrgId ? "home" : "away",
    god: row.god_played ?? undefined,
    role: row.role ?? undefined,
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists,
    damageDealt: row.damage_dealt ?? undefined,
    damageMitigated: row.damage_mitigated ?? undefined,
  };
}

export function groupPublishedStats(rows: PublishedStatRow[], homeOrgId: string): ExtractedGame[] {
  const byGame = new Map<number, ExtractedPlayer[]>();
  for (const row of rows) {
    const players = byGame.get(row.game_number) ?? [];
    players.push(toPlayer(row, homeOrgId));
    byGame.set(row.game_number, players);
  }

  return [...byGame.entries()]
    .sort(([a], [b]) => a - b)
    .map(([gameNumber, players]) => {
      // The winning side is the side of any row carrying the won flag. A game
      // with no winning row is reported as "unknown" rather than silently
      // defaulting to home.
      const winningRow = rows.find((r) => r.game_number === gameNumber && r.won);
      return {
        gameNumber,
        winningSide: winningRow ? (winningRow.org_id === homeOrgId ? "home" : "away") : "unknown",
        players,
      } satisfies ExtractedGame;
    });
}

/** Groups rows spanning several reports by their report id. */
export function groupRowsByReport(rows: PublishedStatRow[]): Map<string, PublishedStatRow[]> {
  const byReport = new Map<string, PublishedStatRow[]>();
  for (const row of rows) {
    const list = byReport.get(row.match_report_id) ?? [];
    list.push(row);
    byReport.set(row.match_report_id, list);
  }
  return byReport;
}
