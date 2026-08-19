import type { SupabaseClient } from "@supabase/supabase-js";
import { toDatabaseJson } from "@/lib/database-json";
import { extractMatchReportGames } from "@/lib/match-report-extraction";
import type { Database } from "@/types/database.types";
import type { ExtractedGame } from "@/types/match-report";
import type { HostMatchReportReview } from "@/types/match-report-host";
import { readHostMatchReportReview } from "./read-service";

type ErrorShape = { message: string; code?: string } | null;
type UntypedResult = PromiseLike<{ data: unknown; error: ErrorShape }>;
interface UntypedQuery extends UntypedResult {
  select(columns: string): UntypedQuery;
  eq(column: string, value: unknown): UntypedQuery;
  update(values: Record<string, unknown>): UntypedQuery;
  single(): UntypedResult;
}
type UntypedClient = { from(table: string): UntypedQuery };

function failure(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

function blankGames(review: HostMatchReportReview): ExtractedGame[] {
  const gameCount = Math.max(1, review.report.screenshotUrls.length);
  return Array.from({ length: gameCount }, (_, index) => ({
    gameNumber: index + 1,
    winningSide: "unknown" as const,
    players: [
      ...review.match.home.roster.slice(0, 5).map((player) => ({
        ign: player.ign, playerId: player.id, side: "home" as const,
        kills: 0, deaths: 0, assists: 0,
      })),
      ...review.match.away.roster.slice(0, 5).map((player) => ({
        ign: player.ign, playerId: player.id, side: "away" as const,
        kills: 0, deaths: 0, assists: 0,
      })),
    ],
  }));
}

export function completeGamesForHostReview(games: ExtractedGame[], review: HostMatchReportReview) {
  const maps = {
    home: new Map(review.match.home.roster.map((player) => [player.ign.toLowerCase(), player.id])),
    away: new Map(review.match.away.roster.map((player) => [player.ign.toLowerCase(), player.id])),
  };
  return games.map((game) => {
    const players = (["home", "away"] as const).flatMap((side) => {
      const roster = side === "home" ? review.match.home.roster : review.match.away.roster;
      const extracted = game.players
        .filter((player) => player.side === side && player.ign.trim().length > 0)
        .slice(0, 5)
        .map((player) => {
          const ign = player.ign.trim().slice(0, 100);
          return {
            ...player,
            ign,
            god: player.god?.trim().slice(0, 100) || undefined,
            role: player.role?.trim().slice(0, 100) || undefined,
            playerId: maps[side].get(ign.toLowerCase()),
          };
        });
      const usedIds = new Set(extracted.map((player) => player.playerId).filter(Boolean));
      const usedIgns = new Set(extracted.map((player) => player.ign.trim().toLowerCase()));
      for (const rosterPlayer of roster) {
        if (extracted.length === 5) break;
        if (usedIds.has(rosterPlayer.id) || usedIgns.has(rosterPlayer.ign.toLowerCase())) continue;
        extracted.push({
          ign: rosterPlayer.ign,
          playerId: rosterPlayer.id,
          side,
          god: undefined,
          role: undefined,
          kills: 0,
          deaths: 0,
          assists: 0,
        });
      }
      return extracted;
    });
    return { ...game, players };
  });
}

function hasEditableFiveVersusFive(games: ExtractedGame[]) {
  return games.length > 0 && games.every((game) =>
    game.players.length === 10 &&
    game.players.filter((player) => player.side === "home").length === 5 &&
    game.players.filter((player) => player.side === "away").length === 5
  );
}

export async function resetIncompleteExtraction(
  client: unknown,
  input: {
    matchReportId: string;
    hostDiscordId: string;
    extractingRevision: number;
    nextRevision: number;
  },
) {
  const untyped = client as UntypedClient;
  const { data, error } = await untyped
    .from("match_reports")
    .update({ status: "pending", revision: input.nextRevision })
    .eq("id", input.matchReportId)
    .eq("host_discord_id", input.hostDiscordId)
    .eq("revision", input.extractingRevision)
    .select("revision")
    .single();
  if (error || !data) throw failure("40001", "Report changed during extraction reset.");
}

export async function extractHostReviewScreenshots(
  client: SupabaseClient<Database>,
  input: { matchReportId: string; hostDiscordId: string },
) {
  const initial = await readHostMatchReportReview(client, input);
  if (!initial) throw failure("P0002", "Report not found.");
  if (
    initial.report.status === "host_review" ||
    initial.report.status === "done" ||
    initial.report.status === "cancelled"
  ) {
    throw failure("42501", "Report is no longer editable.");
  }
  if (initial.report.screenshotUrls.length < 1) throw failure("22023", "Upload a screenshot first.");

  const untyped = client as unknown as UntypedClient;
  const extractingRevision = initial.report.revision + 1;
  const { data: claimed, error: claimError } = await untyped
    .from("match_reports")
    .update({ status: "extracting", revision: extractingRevision })
    .eq("id", input.matchReportId)
    .eq("host_discord_id", input.hostDiscordId)
    .eq("revision", initial.report.revision)
    .select("revision")
    .single();
  if (claimError || !claimed) throw failure("40001", "Report changed before extraction.");

  const rawGames = process.env.OPENROUTER_API_KEY
    ? await extractMatchReportGames({
        screenshotUrls: initial.report.screenshotUrls,
        homeOrgName: initial.match.home.name,
        homeIgns: initial.match.home.roster.map((player) => player.ign),
        awayOrgName: initial.match.away.name,
        awayIgns: initial.match.away.roster.map((player) => player.ign),
      })
    : blankGames(initial);
  const games = completeGamesForHostReview(rawGames, initial);
  const reviewRevision = extractingRevision + 1;
  if (!hasEditableFiveVersusFive(games)) {
    await resetIncompleteExtraction(untyped, {
      matchReportId: input.matchReportId,
      hostDiscordId: input.hostDiscordId,
      extractingRevision,
      nextRevision: reviewRevision,
    });
    throw failure("55000", "Both season rosters need five players before correction can begin.");
  }
  const { data: saved, error: saveError } = await untyped
    .from("match_reports")
    .update({
      status: "review",
      revision: reviewRevision,
      extracted_data: toDatabaseJson(games),
    })
    .eq("id", input.matchReportId)
    .eq("host_discord_id", input.hostDiscordId)
    .eq("revision", extractingRevision)
    .select("revision")
    .single();
  if (saveError || !saved) throw failure("40001", "Report changed during extraction.");
  const result = await readHostMatchReportReview(client, input);
  if (!result) throw failure("P0002", "Report not found.");
  return result;
}
