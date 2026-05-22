import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getAdminLeagueData } from "@/lib/league-data";
import type { ExtractedGame } from "@/types/match-report";
import Anthropic from "@anthropic-ai/sdk";

const SMITE_ROLES = ["Solo", "Jungle", "Mid", "Carry", "Support"] as const;

const EXTRACTION_PROMPT = (homeOrgName: string, homeIgns: string[], awayOrgName: string, awayIgns: string[]) => `
You are analyzing a SMITE 2 end-of-match DETAILS tab screenshot. Extract the scoreboard.

Home team: ${homeOrgName}
Known home players: ${homeIgns.length > 0 ? homeIgns.join(", ") : "(unknown roster)"}

Away team: ${awayOrgName}
Known away players: ${awayIgns.length > 0 ? awayIgns.join(", ") : "(unknown roster)"}

Return ONLY valid JSON in this exact format, no other text:
{
  "winner": "home" | "away" | "unknown",
  "players": [
    {
      "ign": "string",
      "side": "home" | "away",
      "god": "string or null",
      "role": "Solo" | "Jungle" | "Mid" | "Carry" | "Support" | null,
      "kills": number,
      "deaths": number,
      "assists": number,
      "damageDealt": number or null,
      "damageMitigated": number or null
    }
  ]
}

Instructions:
- Match each player to home or away using the known rosters above
- If a player is not in either roster, assign based on which column they appear in (left column vs right column)
- Extract kills, deaths, assists exactly as shown (integers)
- Extract damage numbers without commas (integers)
- "winner" is "home" if the home team won this game, "away" if away team won
- Look for VICTORY/DEFEAT text or trophy icons to determine winner
- Include all 10 players (5 per side) if visible
`.trim();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI extraction not configured (ANTHROPIC_API_KEY missing).", aiUnavailable: true }, { status: 503 });
  }

  // Load report + match context
  const { data: report, error: reportErr } = await supabase
    .from("match_reports")
    .select("*")
    .eq("id", id)
    .single();
  if (reportErr || !report) return NextResponse.json({ error: "Report not found." }, { status: 404 });

  const r = report as { screenshot_urls: string[]; match_id: string; status: string };
  if (!r.screenshot_urls?.length) return NextResponse.json({ error: "No screenshots uploaded yet." }, { status: 400 });

  // Mark as extracting
  await supabase.from("match_reports").update({ status: "extracting" }).eq("id", id);

  try {
    const leagueData = await getAdminLeagueData();
    const match = leagueData.matches.find((m) => m.id === r.match_id);
    const homeOrg = leagueData.orgs.find((o) => o.id === match?.homeOrgId);
    const awayOrg = leagueData.orgs.find((o) => o.id === match?.awayOrgId);
    const homePlayers = leagueData.players.filter((p) => p.orgId === match?.homeOrgId).map((p) => p.ign);
    const awayPlayers = leagueData.players.filter((p) => p.orgId === match?.awayOrgId).map((p) => p.ign);

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const games: ExtractedGame[] = [];

    for (let i = 0; i < r.screenshot_urls.length; i++) {
      const url = r.screenshot_urls[i];
      let imageBase64: string;
      let mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" = "image/jpeg";

      try {
        const imgRes = await fetch(url);
        if (!imgRes.ok) throw new Error(`Failed to fetch screenshot: ${imgRes.status}`);
        const buffer = await imgRes.arrayBuffer();
        imageBase64 = Buffer.from(buffer).toString("base64");
        const ct = imgRes.headers.get("content-type") ?? "";
        if (ct.includes("png")) mediaType = "image/png";
        else if (ct.includes("webp")) mediaType = "image/webp";
      } catch (err) {
        console.error(`Failed to fetch screenshot ${i + 1}:`, err);
        games.push({ gameNumber: i + 1, winningSide: "unknown", players: [] });
        continue;
      }

      try {
        const response = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 2048,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: { type: "base64", media_type: mediaType, data: imageBase64 },
                },
                {
                  type: "text",
                  text: EXTRACTION_PROMPT(
                    homeOrg?.name ?? "Home Team",
                    homePlayers,
                    awayOrg?.name ?? "Away Team",
                    awayPlayers,
                  ),
                },
              ],
            },
          ],
        });

        const text = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
        // Strip markdown code fences if present
        const jsonText = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
        const parsed = JSON.parse(jsonText) as {
          winner?: string;
          players?: Array<{
            ign?: string;
            side?: string;
            god?: string | null;
            role?: string | null;
            kills?: number;
            deaths?: number;
            assists?: number;
            damageDealt?: number | null;
            damageMitigated?: number | null;
          }>;
        };

        games.push({
          gameNumber: i + 1,
          winningSide: parsed.winner === "home" ? "home" : parsed.winner === "away" ? "away" : "unknown",
          players: (parsed.players ?? []).map((p) => ({
            ign: p.ign ?? "",
            side: p.side === "away" ? "away" : "home",
            god: p.god ?? undefined,
            role: SMITE_ROLES.includes(p.role as (typeof SMITE_ROLES)[number]) ? (p.role as string) : undefined,
            kills: Number(p.kills ?? 0),
            deaths: Number(p.deaths ?? 0),
            assists: Number(p.assists ?? 0),
            damageDealt: p.damageDealt != null ? Number(p.damageDealt) : undefined,
            damageMitigated: p.damageMitigated != null ? Number(p.damageMitigated) : undefined,
          })),
        });
      } catch (err) {
        console.error(`AI extraction failed for game ${i + 1}:`, err);
        games.push({ gameNumber: i + 1, winningSide: "unknown", players: [] });
      }
    }

    // Store extracted data and mark as review
    await supabase
      .from("match_reports")
      .update({ status: "review", extracted_data: games })
      .eq("id", id);

    return NextResponse.json({ games });
  } catch (err) {
    // Reset to pending on failure so admin can retry
    await supabase.from("match_reports").update({ status: "pending" }).eq("id", id);
    const message = err instanceof Error ? err.message : "Extraction failed.";
    console.error("extract route error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
