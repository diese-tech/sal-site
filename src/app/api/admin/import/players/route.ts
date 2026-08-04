import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { isAdminRequest } from "@/lib/admin-auth";
import { savePlayersBulk, savePlayer, saveSeasonOrgAssignment, saveSeasonRosterAssignment, writeAuditLog } from "@/lib/league-data";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { errorMessage, reportError } from "@/lib/error-monitor";

const importDivisionSchema = z.enum(["solar", "lunar", "terra"]);

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
  divisionId: z.enum(["solar", "lunar", "terra"]).optional(),
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
  // Import-level season + division context (#230): the current operational
  // process uploads one sheet per division, so admins pick season/division
  // once for the whole batch instead of every row repeating it. A per-row
  // divisionId (from a legacy Division column) still overrides this when present.
  seasonId: z.string().min(1),
  divisionId: importDivisionSchema,
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

  const supabase = getSupabaseServerClient();

  // Validate the target season actually exists before touching players — a
  // typo'd/stale seasonId must not silently report success while enrollment
  // is impossible (#230 acceptance: don't falsely report success).
  if (supabase) {
    const { data: seasonRow, error: seasonErr } = await supabase
      .from("seasons")
      .select("id")
      .eq("id", parsed.data.seasonId)
      .maybeSingle();
    if (seasonErr) {
      return NextResponse.json({ error: `Unable to verify season: ${seasonErr.message}` }, { status: 500 });
    }
    if (!seasonRow) {
      return NextResponse.json({ error: `Season "${parsed.data.seasonId}" does not exist.` }, { status: 400 });
    }
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

  // An import upsert must never resurrect an archived identity implicitly.
  // Surface those collisions row-by-row so an admin can deliberately restore
  // the player before attempting season enrollment again.
  const errors: Array<{ ign: string; error: string }> = [];
  let importCandidates = parsed.data.players;
  if (supabase) {
    const { data: existingPlayers, error: playerLookupError } = await supabase
      .from("players")
      .select("id, archived_at")
      .in("id", parsed.data.players.map((player) => player.id));
    if (playerLookupError) {
      return NextResponse.json(
        { error: `Unable to verify player availability: ${playerLookupError.message}` },
        { status: 500 },
      );
    }

    const archivedPlayerIds = new Set(
      ((existingPlayers ?? []) as Array<{ id: string; archived_at: string | null }>)
        .filter((player) => player.archived_at !== null)
        .map((player) => player.id),
    );
    if (archivedPlayerIds.size > 0) {
      for (const player of parsed.data.players) {
        if (archivedPlayerIds.has(player.id)) {
          errors.push({
            ign: player.ign,
            error: "Player already exists but is archived. Restore the player before enrolling them.",
          });
        }
      }
      importCandidates = parsed.data.players.filter((player) => !archivedPlayerIds.has(player.id));
    }
  }

  // Resolve sheet "Team" values against real orgs by id, name, or tag.
  // Unknown teams import as free agents with a per-row warning instead of
  // failing the row on a foreign-key violation. Queries the orgs table
  // directly — getAdminLeagueData()'s mock fallback must not leak fake ids.
  const orgLookup = new Map<string, string>();
  if (supabase) {
    const { data: orgRows } = await supabase
      .from("orgs")
      .select("id, name, tag")
      .is("archived_at", null);
    for (const org of (orgRows ?? []) as Array<{ id: string; name: string; tag: string }>) {
      orgLookup.set(org.id.toLowerCase(), org.id);
      orgLookup.set(org.name.toLowerCase(), org.id);
      orgLookup.set(org.tag.toLowerCase(), org.id);
    }
  }

  const warnings: Array<{ ign: string; warning: string }> = [];
  const players = importCandidates.map((player) => {
    if (!player.orgId) return player;
    const resolved = orgLookup.get(player.orgId.trim().toLowerCase());
    if (resolved) return { ...player, orgId: resolved };
    warnings.push({ ign: player.ign, warning: `Unknown team "${player.orgId}" — imported as free agent. Create the team first, then re-import to assign.` });
    return { ...player, orgId: undefined, status: "free-agent" as const };
  });

  // A resolved org may exist globally but not yet be enrolled in the selected
  // season+division's season_orgs — saveSeasonRosterAssignment's enrollment
  // check requires that row to exist, so ensure it does before assigning
  // players to it (idempotent upsert; a failure here just surfaces as a
  // per-row enrollment error below instead of crashing the whole import).
  //
  // An org's own division_id column is only its legacy/default display
  // division, not this batch's target — an org that already fields a team in
  // one division must still be enrollable into a *second* division here, so
  // enroll the actual (org, division) pairs the batch's players resolve to
  // (a per-row divisionId override takes precedence over the batch default).
  const orgDivisionPairsToEnroll = new Map(
    players
      .filter((player) => player.orgId)
      .map((player) => {
        const divisionId = player.divisionId ?? parsed.data.divisionId;
        return [`${player.orgId}:${divisionId}`, { orgId: player.orgId as string, divisionId }] as const;
      }),
  );
  for (const { orgId, divisionId } of orgDivisionPairsToEnroll.values()) {
    try {
      await saveSeasonOrgAssignment(parsed.data.seasonId, orgId, divisionId);
    } catch {
      // Swallowed: players pointing at this org will fail the season
      // enrollment step below and surface as an explicit row error instead.
    }
  }

  // Fast path: one bulk upsert. If the batch fails (e.g. an IGN unique
  // collision with an existing player), fall back to per-row saves so the
  // valid rows still import — partial importing is allowed by design.
  const savedPlayers: typeof players = [];
  if (players.length > 0) {
    try {
      await savePlayersBulk(players);
      savedPlayers.push(...players);
    } catch {
      for (const player of players) {
        try {
          await savePlayer(player);
          savedPlayers.push(player);
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
  }

  // Enroll every saved player into the selected preseason/division as a
  // free agent (or, if the sheet's Team column matched a real org, straight
  // into that org's roster). Bulk import must mean both an upserted player
  // identity AND season participation — an identity with no season_rosters
  // row stays invisible to every season-scoped query (#230).
  let imported = 0;
  for (const player of savedPlayers) {
    try {
      await saveSeasonRosterAssignment({
        seasonId: parsed.data.seasonId,
        playerId: player.id,
        orgId: player.orgId ?? null,
        divisionId: player.divisionId ?? parsed.data.divisionId,
        isCaptain: false,
      });
      imported++;
    } catch (err) {
      errors.push({ ign: player.ign, error: `Saved player but failed to enroll in season: ${errorMessage(err, "Unknown error.")}` });
    }
  }
  if (imported < savedPlayers.length) {
    reportError("player import: season enrollment failed for some rows", new Error(`${savedPlayers.length - imported}/${savedPlayers.length} rows failed enrollment`), {
      seasonId: parsed.data.seasonId,
    });
  }

  if (imported > 0) revalidateTag("league-data", {});
  await writeAuditLog("players_imported", "player_import", null, {
    seasonId: parsed.data.seasonId,
    divisionId: parsed.data.divisionId,
    imported,
    errorCount: errors.length,
    warningCount: warnings.length,
  });
  return NextResponse.json({ imported, errors, warnings });
}
