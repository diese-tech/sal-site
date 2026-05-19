import { createHash, randomBytes } from "crypto";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { buildPickSequence, type DraftPick, type DraftRoom, type DraftState } from "@/types/draft";
import type { DivisionId } from "@/types/league";

// ---- DB row types --------------------------------------------------------

type DbDraftRoom = {
  id: string;
  season_id: string;
  division_id: string;
  status: string;
  rounds: number;
  pick_timer_seconds: number;
  base_order: string[];
  current_pick_index: number;
  pick_started_at: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

type DbDraftPick = {
  id: number;
  draft_room_id: string;
  pick_number: number;
  org_id: string;
  player_id: string;
  picked_at: string;
};

// ---- Converters ----------------------------------------------------------

function fromDbRoom(row: DbDraftRoom): DraftRoom {
  return {
    id: row.id,
    seasonId: row.season_id,
    divisionId: row.division_id as DivisionId,
    status: row.status as DraftRoom["status"],
    rounds: row.rounds,
    pickTimerSeconds: row.pick_timer_seconds,
    baseOrder: row.base_order,
    currentPickIndex: row.current_pick_index,
    pickStartedAt: row.pick_started_at ?? undefined,
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
  };
}

function fromDbPick(row: DbDraftPick): DraftPick {
  return {
    id: row.id,
    draftRoomId: row.draft_room_id,
    pickNumber: row.pick_number,
    orgId: row.org_id,
    playerId: row.player_id,
    pickedAt: row.picked_at,
  };
}

// ---- Read ----------------------------------------------------------------

export async function getDraftRooms(seasonId?: string): Promise<DraftRoom[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];
  let q = supabase.from("draft_rooms").select("*").order("created_at", { ascending: false });
  if (seasonId) q = q.eq("season_id", seasonId);
  const { data, error } = await q;
  if (error) { console.error("getDraftRooms:", error.message); return []; }
  return (data as DbDraftRoom[]).map(fromDbRoom);
}

export async function getDraftRoom(id: string): Promise<DraftRoom | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("draft_rooms").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return fromDbRoom(data as DbDraftRoom);
}

export async function getDraftPicks(draftRoomId: string): Promise<DraftPick[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("draft_picks")
    .select("*")
    .eq("draft_room_id", draftRoomId)
    .order("pick_number");
  if (error) { console.error("getDraftPicks:", error.message); return []; }
  return (data as DbDraftPick[]).map(fromDbPick);
}

export async function buildDraftState(draftRoomId: string): Promise<DraftState | null> {
  const [room, picks] = await Promise.all([getDraftRoom(draftRoomId), getDraftPicks(draftRoomId)]);
  if (!room) return null;

  const pickSequence = buildPickSequence(room.baseOrder, room.rounds);
  const totalPicks = pickSequence.length;
  const currentOrgId = room.status === "active" && room.currentPickIndex < totalPicks
    ? (pickSequence[room.currentPickIndex] ?? null)
    : null;

  let secondsRemaining: number | null = null;
  if (room.status === "active" && room.pickStartedAt) {
    const elapsed = (Date.now() - new Date(room.pickStartedAt).getTime()) / 1000;
    secondsRemaining = Math.max(0, room.pickTimerSeconds - elapsed);
  }

  return { room, picks, pickSequence, currentOrgId, totalPicks, secondsRemaining };
}

// ---- Write ---------------------------------------------------------------

export async function createDraftRoom(input: {
  id: string;
  seasonId: string;
  divisionId: DivisionId;
  rounds?: number;
  pickTimerSeconds?: number;
}): Promise<DraftRoom> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase env is missing.");
  const row = {
    id: input.id,
    season_id: input.seasonId,
    division_id: input.divisionId,
    rounds: input.rounds ?? 5,
    pick_timer_seconds: input.pickTimerSeconds ?? 120,
  };
  const { data, error } = await supabase.from("draft_rooms").insert(row).select().single();
  if (error) throw error;
  return fromDbRoom(data as DbDraftRoom);
}

export async function updateDraftRoom(id: string, patch: Partial<{
  status: DraftRoom["status"];
  baseOrder: string[];
  currentPickIndex: number;
  pickStartedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  rounds: number;
  pickTimerSeconds: number;
}>): Promise<DraftRoom> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase env is missing.");
  const dbPatch: Record<string, unknown> = {};
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.baseOrder !== undefined) dbPatch.base_order = patch.baseOrder;
  if (patch.currentPickIndex !== undefined) dbPatch.current_pick_index = patch.currentPickIndex;
  if (Object.prototype.hasOwnProperty.call(patch, "pickStartedAt")) dbPatch.pick_started_at = patch.pickStartedAt;
  if (Object.prototype.hasOwnProperty.call(patch, "startedAt")) dbPatch.started_at = patch.startedAt;
  if (Object.prototype.hasOwnProperty.call(patch, "completedAt")) dbPatch.completed_at = patch.completedAt;
  if (patch.rounds !== undefined) dbPatch.rounds = patch.rounds;
  if (patch.pickTimerSeconds !== undefined) dbPatch.pick_timer_seconds = patch.pickTimerSeconds;
  const { data, error } = await supabase.from("draft_rooms").update(dbPatch).eq("id", id).select().single();
  if (error) throw error;
  return fromDbRoom(data as DbDraftRoom);
}

export async function recordPick(draftRoomId: string, pickNumber: number, orgId: string, playerId: string): Promise<DraftPick> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase env is missing.");
  const { data, error } = await supabase
    .from("draft_picks")
    .insert({ draft_room_id: draftRoomId, pick_number: pickNumber, org_id: orgId, player_id: playerId })
    .select()
    .single();
  if (error) throw error;
  return fromDbPick(data as DbDraftPick);
}

// ---- Captain tokens ------------------------------------------------------

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function generateCaptainToken(draftRoomId: string, orgId: string): Promise<string> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase env is missing.");
  const token = randomBytes(24).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
  await supabase
    .from("captain_tokens")
    .upsert({ id: token, draft_room_id: draftRoomId, org_id: orgId, token_hash: tokenHash, expires_at: expiresAt });
  return token;
}

export async function verifyCaptainToken(token: string): Promise<{ draftRoomId: string; orgId: string } | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const tokenHash = hashToken(token);
  const { data, error } = await supabase
    .from("captain_tokens")
    .select("draft_room_id, org_id, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at as string) < new Date()) return null;
  return { draftRoomId: data.draft_room_id as string, orgId: data.org_id as string };
}
