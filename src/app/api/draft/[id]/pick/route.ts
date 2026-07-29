import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildDraftState, getSeasonDraftedPlayerIds, removePlayerFromAllShortlists, submitPickAtomic } from "@/lib/draft-data";
import { getCaptainSessionFromRequest } from "@/lib/captain-auth";
import { buildPickSequence } from "@/types/draft";
import { getLeagueData, writeAuditLog, LeagueDataUnavailableError } from "@/lib/league-data";
import { reportError } from "@/lib/error-monitor";

const pickSchema = z.object({
  playerId: z.string().min(1),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Verify captain session
  const session = getCaptainSessionFromRequest(request);
  if (!session || session.draftRoomId !== id) {
    return NextResponse.json({ error: "Captain session required for this draft." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const result = pickSchema.safeParse(body);
  if (!result.success) return NextResponse.json({ error: result.error.issues[0]?.message }, { status: 400 });
  const { playerId } = result.data;

  const state = await buildDraftState(id);
  if (!state) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  const { room } = state;

  if (room.status !== "active") {
    return NextResponse.json({ error: `Draft is ${room.status}, picks are not allowed.` }, { status: 400 });
  }

  const sequence = buildPickSequence(room.baseOrder, room.rounds);
  const expectedOrgId = sequence[room.currentPickIndex];
  if (session.orgId !== expectedOrgId) {
    return NextResponse.json({ error: "It is not your turn to pick." }, { status: 403 });
  }

  // Division lock: every player drafts within their own division
  let leagueData;
  try {
    leagueData = await getLeagueData();
  } catch (err) {
    if (err instanceof LeagueDataUnavailableError) {
      return NextResponse.json({ error: "League data is temporarily unavailable — please check back shortly." }, { status: 503 });
    }
    throw err;
  }
  // A player must belong to this room's division to be draftable. Players
  // with no division are ineligible everywhere — both draft UIs already hide
  // them, and allowing them server-side would let two sibling-division rooms
  // race the season-wide drafted check on the same player.
  const playerData = leagueData.players.find((p) => p.id === playerId);
  if (!playerData || playerData.divisionId !== room.divisionId) {
    return NextResponse.json(
      { error: `Only ${room.divisionId} division players can be drafted in this room.` },
      { status: 400 },
    );
  }

  // Verify player hasn't already been picked in any room this season — a
  // second same-division room can exist after an earlier one completed.
  const draftedIds = await getSeasonDraftedPlayerIds(room.seasonId);
  if (draftedIds.has(playerId)) {
    return NextResponse.json({ error: "Player has already been drafted this season." }, { status: 400 });
  }

  // Atomic insert + index advance; a concurrent pick for the same slot
  // fails the in-transaction index re-check and returns 409.
  const pickNumber = room.currentPickIndex + 1;
  const submitted = await submitPickAtomic(id, session.orgId, playerId, room.currentPickIndex, sequence.length);
  if (!submitted.ok) {
    if (submitted.conflict) {
      return NextResponse.json({ error: "Another pick was recorded first. Refresh and try again." }, { status: 409 });
    }
    reportError("draft pick submission failed", new Error(submitted.message), {
      draftRoomId: id,
      orgId: session.orgId,
      playerId,
      pickNumber,
    });
    return NextResponse.json({ error: submitted.message }, { status: 500 });
  }
  const isComplete = submitted.isComplete;
  await removePlayerFromAllShortlists(id, playerId);

  await writeAuditLog("draft_pick", "draft_pick", `${id}-${pickNumber}`, {
    draftRoomId: id,
    pickNumber,
    orgId: session.orgId,
    playerId,
    isComplete,
  });

  return NextResponse.json({ ok: true, pickNumber, complete: isComplete });
}
