import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { isAdminRequest } from "@/lib/admin-auth";
import { savePlayersBulk, writeAuditLog } from "@/lib/league-data";
import { reportError } from "@/lib/error-monitor";

const playerSchema = z.object({
  id: z.string().min(1),
  ign: z.string().min(1).max(64),
  discordUsername: z.string().min(1).max(64),
  primaryRole: z.enum(["Solo", "Jungle", "Mid", "Carry", "Support", "Flex"]),
  secondaryRoles: z.array(z.enum(["Solo", "Jungle", "Mid", "Carry", "Support", "Flex"])).default([]),
  orgId: z.string().optional(),
  divisionId: z.enum(["solar", "lunar", "gaia"]).optional(),
  avatarInitials: z.string().min(1).max(4),
  avatarGradient: z.string().min(1),
  isStarter: z.boolean().default(false),
  isCaptain: z.boolean().default(false),
  status: z.enum(["free-agent", "org-affiliated", "drafted", "queued-ghost", "active"]).default("free-agent"),
  stats: z.object({
    kills: z.number().int().min(0),
    deaths: z.number().int().min(0),
    assists: z.number().int().min(0),
    gamesPlayed: z.number().int().min(0),
    wins: z.number().int().min(0),
  }).optional(),
});

const bodySchema = z.object({
  players: z.array(playerSchema).min(1).max(500),
});

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const raw = await request.json().catch(() => null);
  if (!raw) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  }

  const players = parsed.data.players;

  // Cross-row deduplication: duplicate IGNs (case-insensitive) or ids within
  // one upload would silently overwrite each other — reject with row errors.
  const seenIgns = new Map<string, string>();
  const dupErrors: Array<{ ign: string; error: string }> = [];
  for (const player of players) {
    const key = player.ign.trim().toLowerCase();
    if (seenIgns.has(key)) {
      dupErrors.push({ ign: player.ign, error: `Duplicate IGN in upload (also row with IGN "${seenIgns.get(key)}").` });
    } else {
      seenIgns.set(key, player.ign);
    }
  }
  if (dupErrors.length > 0) {
    return NextResponse.json({ imported: 0, errors: dupErrors }, { status: 400 });
  }

  // All-or-nothing: one bulk upsert statement — any row failure (e.g. an IGN
  // unique-index collision with an existing player) rolls back the batch.
  try {
    await savePlayersBulk(players);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed.";
    reportError("player import failed", err, { rowCount: players.length });
    return NextResponse.json(
      { imported: 0, errors: [{ ign: "(batch)", error: `Nothing was imported — ${message}` }] },
      { status: 500 },
    );
  }

  revalidateTag("league-data", {});
  await writeAuditLog("players_imported", "player_import", null, { imported: players.length, errorCount: 0 });
  return NextResponse.json({ imported: players.length, errors: [] });
}
