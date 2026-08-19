import { callOpenRouterVision } from "@/lib/openrouter-vision";
import type { ExtractedGame } from "@/types/match-report";

const SMITE_ROLES = ["Solo", "Jungle", "Mid", "Carry", "Support"] as const;

function nonNegativeInteger(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function extractionPrompt(input: {
  homeOrgName: string;
  homeIgns: string[];
  awayOrgName: string;
  awayIgns: string[];
}) {
  return `
You are analyzing a SMITE 2 end-of-match DETAILS tab screenshot. Extract the scoreboard data.

Home team: ${input.homeOrgName}
Known home players: ${input.homeIgns.length > 0 ? input.homeIgns.join(", ") : "(unknown roster)"}

Away team: ${input.awayOrgName}
Known away players: ${input.awayIgns.length > 0 ? input.awayIgns.join(", ") : "(unknown roster)"}

Return ONLY valid JSON in this exact format, no other text:
{
  "winner": "home" | "away" | "unknown",
  "players": [{
    "ign": "string", "side": "home" | "away", "god": "string or null",
    "role": "Solo" | "Jungle" | "Mid" | "Carry" | "Support" | null,
    "kills": number, "deaths": number, "assists": number,
    "damageDealt": number or null, "damageMitigated": number or null
  }]
}

Match each player to home or away using the known rosters. If a player is not in either roster,
assign by scoreboard column. Extract all numbers exactly, determine the winner from the visible
VICTORY/DEFEAT text or icons, and include all ten visible players.
`.trim();
}

export async function extractMatchReportGames(input: {
  screenshotUrls: string[];
  homeOrgName: string;
  homeIgns: string[];
  awayOrgName: string;
  awayIgns: string[];
}): Promise<ExtractedGame[]> {
  const games: ExtractedGame[] = [];
  for (let index = 0; index < input.screenshotUrls.length; index++) {
    try {
      const imageResponse = await fetch(input.screenshotUrls[index]!);
      if (!imageResponse.ok) throw new Error(`HTTP ${imageResponse.status}`);
      const contentType = imageResponse.headers.get("content-type") ?? "image/jpeg";
      const mimeType = contentType.includes("png")
        ? "image/png"
        : contentType.includes("webp") ? "image/webp" : "image/jpeg";
      const encoded = Buffer.from(await imageResponse.arrayBuffer()).toString("base64");
      const text = await callOpenRouterVision([{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${encoded}` } },
          { type: "text", text: extractionPrompt(input) },
        ],
      }], { maxTokens: 2048, title: "SAL Match Report" });
      const parsed = JSON.parse(text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim()) as {
        winner?: string;
        players?: Array<{
          ign?: string; side?: string; god?: string | null; role?: string | null;
          kills?: number; deaths?: number; assists?: number;
          damageDealt?: number | null; damageMitigated?: number | null;
        }>;
      };
      games.push({
        gameNumber: index + 1,
        winningSide: parsed.winner === "home" ? "home" : parsed.winner === "away" ? "away" : "unknown",
        players: (parsed.players ?? []).map((player) => ({
          ign: player.ign ?? "",
          side: player.side === "away" ? "away" : "home",
          god: player.god ?? undefined,
          role: SMITE_ROLES.includes(player.role as (typeof SMITE_ROLES)[number]) ? player.role ?? undefined : undefined,
          kills: nonNegativeInteger(player.kills),
          deaths: nonNegativeInteger(player.deaths),
          assists: nonNegativeInteger(player.assists),
          damageDealt: player.damageDealt == null ? undefined : nonNegativeInteger(player.damageDealt),
          damageMitigated: player.damageMitigated == null ? undefined : nonNegativeInteger(player.damageMitigated),
        })),
      });
    } catch (error) {
      console.error(`Match-report OCR failed for game ${index + 1}:`, error);
      games.push({ gameNumber: index + 1, winningSide: "unknown", players: [] });
    }
  }
  return games;
}
