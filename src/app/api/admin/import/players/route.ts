import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { isAdminRequest } from "@/lib/admin-auth";
import { savePlayersBulk, savePlayer, writeAuditLog } from "@/lib/league-data";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { errorMessage, reportError } from "@/lib/error-monitor";

const playerSchema = z.object({
  id: z.string().min(1),
  ign: z.string().min(1).max(64),
  // Only IGN is required — rows without a Discord username import with an
  // empty one, and rows without a role default to Flex (#74 follow-up:
  // partial importing allowed per maintainer decision).
  discordUsername: z.string().max(64).optional().default(""),
  primaryRole: z.enum(["Solo", "Jungle", "Mid", "Carry", "Support", "Flex"]).optional().default("Flex"),
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

  // Cross-row deduplication: duplicate IGNs (case-insensitive) within one
  // upload would silently overwrite each other — reject with row errors.
  const seenIgns = new Map<string, string>();
  const dupErrors: Array<{ ign: string; error: string }> = [];
  for (const player of parsed.data.players) {
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

  // Resolve sheet "Team" values against real orgs by id, name, or tag.
  // Unknown teams import as free agents with a per-row warning instead of
  // failing the row on a foreign-key violation. Queries the orgs table
  // directly — getAdminLeagueData()'s mock fallback must not leak fake ids.
  const supabase = getSupabaseServerClient();
  const orgLookup = new Map<string, string>();
  if (supabase) {
    const { data: orgRows } = await supabase.from("orgs").select("id, name, tag");
    for (const org of (orgRows ?? []) as Array<{ id: string; name: string; tag: string }>) {
      orgLookup.set(org.id.toLowerCase(), org.id);
      orgLookup.set(org.name.toLowerCase(), org.id);
      orgLookup.set(org.tag.toLowerCase(), org.id);
    }
  }

  const warnings: Array<{ ign: string; warning: string }> = [];
  const players = parsed.data.players.map((player) => {
    if (!player.orgId) return player;
    const resolved = orgLookup.get(player.orgId.trim().toLowerCase());
    if (resolved) return { ...player, orgId: resolved };
    warnings.push({ ign: player.ign, warning: `Unknown team "${player.orgId}" — imported as free agent. Create the team first, then re-import to assign.` });
    return { ...player, orgId: undefined, status: "free-agent" as const };
  });

  // Fast path: one bulk upsert. If the batch fails (e.g. an IGN unique
  // collision with an existing player), fall back to per-row saves so the
  // valid rows still import — partial importing is allowed by design.
  let imported = 0;
  const errors: Array<{ ign: string; error: string }> = [];
  try {
    await savePlayersBulk(players);
    imported = players.length;
  } catch {
    for (const player of players) {
      try {
        await savePlayer(player);
        imported++;
      } catch (err) {
        errors.push({ ign: player.ign, error: errorMessage(err, "Unknown error.") });
      }
    }
    if (errors.length > 0) {
      reportError("player import: some rows failed", new Error(`${errors.length}/${players.length} rows failed`), {
        firstError: errors[0],
      });
    }
  }

  if (imported > 0) revalidateTag("league-data", {});
  await writeAuditLog("players_imported", "player_import", null, { imported, errorCount: errors.length, warningCount: warnings.length });
  return NextResponse.json({ imported, errors, warnings });
}
