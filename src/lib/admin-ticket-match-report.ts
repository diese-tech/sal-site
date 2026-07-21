import { z } from "zod";
import type { MatchReportResolutionGame } from "@/lib/admin-ticket-actions";

const extractedPlayerSchema = z.object({
  ign: z.string().trim().min(1).max(100),
  side: z.enum(["home", "away"]),
  kills: z.number().int().min(0),
  deaths: z.number().int().min(0),
  assists: z.number().int().min(0),
  god: z.string().trim().min(1).max(100).optional(),
  role: z.string().trim().min(1).max(100).optional(),
  damageDealt: z.number().int().min(0).optional(),
  damageMitigated: z.number().int().min(0).optional(),
});

const extractedGameSchema = z.object({
  gameNumber: z.number().int().min(1),
  winningSide: z.enum(["home", "away"]),
  players: z.array(extractedPlayerSchema).length(10).superRefine((players, context) => {
    if (players.filter((player) => player.side === "home").length !== 5) {
      context.addIssue({ code: "custom", message: "Exactly five home players are required." });
    }
    if (players.filter((player) => player.side === "away").length !== 5) {
      context.addIssue({ code: "custom", message: "Exactly five away players are required." });
    }
    const playerKeys = players.map((player) => player.ign.toLowerCase());
    if (new Set(playerKeys).size !== playerKeys.length) {
      context.addIssue({ code: "custom", message: "Player rows must be unique within a game." });
    }
  }),
});

const extractedGamesSchema = z.array(extractedGameSchema).min(1).max(5).superRefine((games, context) => {
  const gameNumbers = games.map((game) => game.gameNumber);
  if (new Set(gameNumbers).size !== gameNumbers.length) {
    context.addIssue({ code: "custom", message: "Game numbers must be unique." });
  }
  const homeWins = games.filter((game) => game.winningSide === "home").length;
  const awayWins = games.length - homeWins;
  if (homeWins === awayWins) {
    context.addIssue({ code: "custom", message: "A reviewed series cannot end in a tie." });
  }
});

interface MatchReportSource {
  id?: unknown;
  match_id?: unknown;
  status?: unknown;
  screenshot_urls?: unknown;
  extracted_data?: unknown;
  [key: string]: unknown;
}

interface MatchReportLeagueContext {
  matches: Array<{ id: string; homeOrgId: string; awayOrgId: string; status: string }>;
  orgs: Array<{ id: string; name: string; tag: string }>;
  players: Array<{ id: string; ign: string; orgId?: string; archivedAt?: string | null }>;
}

interface ReadOnlyMatchReportActionContext {
  kind: "read_only";
  reason: string;
  workflowHref: "/admin/match-report";
}

export interface ResolvableMatchReportActionContext {
  kind: "resolvable";
  reportId: string;
  matchId: string;
  homeOrg: { name: string; tag: string };
  awayOrg: { name: string; tag: string };
  screenshotLinks: Array<{ label: string; href: string }>;
  games: MatchReportResolutionGame[];
}

export type MatchReportActionContext =
  | ReadOnlyMatchReportActionContext
  | ResolvableMatchReportActionContext;

const resolutionPlayerSchema = z.object({
  playerIgn: z.string().min(1).max(100),
  playerId: z.string().min(1).max(200).optional(),
  side: z.enum(["home", "away"]),
  won: z.boolean(),
  kills: z.number().int().min(0),
  deaths: z.number().int().min(0),
  assists: z.number().int().min(0),
  godPlayed: z.string().min(1).max(100).optional(),
  role: z.string().min(1).max(100).optional(),
  damageDealt: z.number().int().min(0).optional(),
  damageMitigated: z.number().int().min(0).optional(),
}).strict();

const resolutionGameSchema = z.object({
  gameNumber: z.number().int().min(1),
  winningSide: z.enum(["home", "away"]),
  players: z.array(resolutionPlayerSchema).length(10),
}).strict();

const safeHttpUrlSchema = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
});

const matchReportActionContextSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("read_only"),
    reason: z.string().min(1).max(300),
    workflowHref: z.literal("/admin/match-report"),
  }).strict(),
  z.object({
    kind: z.literal("resolvable"),
    reportId: z.string().min(1).max(200),
    matchId: z.string().min(1).max(200),
    homeOrg: z.object({ name: z.string().min(1).max(200), tag: z.string().max(50) }).strict(),
    awayOrg: z.object({ name: z.string().min(1).max(200), tag: z.string().max(50) }).strict(),
    screenshotLinks: z.array(
      z.object({ label: z.string().min(1).max(100), href: safeHttpUrlSchema }).strict(),
    ).max(5),
    games: z.array(resolutionGameSchema).min(1).max(5),
  }).strict(),
]);

export function parseMatchReportActionContext(value: unknown): MatchReportActionContext | null {
  const parsed = matchReportActionContextSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const READ_ONLY_CONTEXT: ReadOnlyMatchReportActionContext = {
  kind: "read_only",
  reason: "Validated extracted stats are unavailable. Continue in Match Report to review or enter them.",
  workflowHref: "/admin/match-report",
};

export function buildMatchReportActionContext(
  source: MatchReportSource,
  league: MatchReportLeagueContext,
): MatchReportActionContext {
  if (
    typeof source.id !== "string" ||
    typeof source.match_id !== "string" ||
    source.status !== "review"
  ) {
    return READ_ONLY_CONTEXT;
  }

  const match = league.matches.find((candidate) => candidate.id === source.match_id);
  if (!match || !["scheduled", "live"].includes(match.status)) return READ_ONLY_CONTEXT;
  const homeOrg = league.orgs.find((org) => org.id === match.homeOrgId);
  const awayOrg = league.orgs.find((org) => org.id === match.awayOrgId);
  if (!homeOrg || !awayOrg) return READ_ONLY_CONTEXT;

  const extracted = extractedGamesSchema.safeParse(source.extracted_data);
  if (!extracted.success) return READ_ONLY_CONTEXT;

  const games: MatchReportResolutionGame[] = extracted.data.map((game) => ({
    gameNumber: game.gameNumber,
    winningSide: game.winningSide,
    players: game.players.map((player) => {
      const expectedOrgId = player.side === "home" ? match.homeOrgId : match.awayOrgId;
      const rosterPlayer = league.players.find(
        (candidate) =>
          !candidate.archivedAt &&
          candidate.orgId === expectedOrgId &&
          candidate.ign.toLowerCase() === player.ign.toLowerCase(),
      );
      return {
        playerIgn: player.ign,
        ...(rosterPlayer ? { playerId: rosterPlayer.id } : {}),
        side: player.side,
        won: player.side === game.winningSide,
        kills: player.kills,
        deaths: player.deaths,
        assists: player.assists,
        ...(player.god ? { godPlayed: player.god } : {}),
        ...(player.role ? { role: player.role } : {}),
        ...(player.damageDealt !== undefined ? { damageDealt: player.damageDealt } : {}),
        ...(player.damageMitigated !== undefined
          ? { damageMitigated: player.damageMitigated }
          : {}),
      };
    }),
  }));

  return {
    kind: "resolvable",
    reportId: source.id,
    matchId: source.match_id,
    homeOrg: { name: homeOrg.name, tag: homeOrg.tag },
    awayOrg: { name: awayOrg.name, tag: awayOrg.tag },
    screenshotLinks: safeScreenshotLinks(source.screenshot_urls),
    games,
  };
}

function safeScreenshotLinks(value: unknown): Array<{ label: string; href: string }> {
  if (!Array.isArray(value)) return [];
  const links: Array<{ label: string; href: string }> = [];
  for (const candidate of value) {
    if (typeof candidate !== "string") continue;
    try {
      const url = new URL(candidate);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      links.push({ label: `Match screenshot ${links.length + 1}`, href: url.toString() });
    } catch {
      // Invalid and non-http(s) evidence never reaches the client.
    }
    if (links.length === 5) break;
  }
  return links;
}
