import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildDraftState, finalizeDraftRosters, getDraftPicks, removePlayerFromAllShortlists, submitPickAtomic } from "@/lib/draft-data";
import { getCaptainSessionFromRequest } from "@/lib/captain-auth";
import { buildPickSequence } from "@/types/draft";
import { getLeagueData, writeAuditLog } from "@/lib/league-data";
import { reportError } from "@/lib/error-monitor";

const DIVISION_TIER: Record<string, number> = { gaia: 1, solar: 2, lunar: 3 };

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

  // Division eligibility: captain cannot draft from a higher-tier division
  const roomTier = DIVISION_TIER[room.divisionId] ?? 999;
  const leagueData = await getLeagueData();
  const playerData = leagueData.players.find((p) => p.id === playerId);
  if (playerData?.divisionId) {
    const playerTier = DIVISION_TIER[playerData.divisionId] ?? 999;
    if (playerTier < roomTier) {
      return NextResponse.json(
        { error: `Cannot draft a ${playerData.divisionId} division player in a ${room.divisionId} draft.` },
        { status: 400 },
      );
    }
  }

  // Verify player hasn't already been picked
  const existingPicks = await getDraftPicks(id);
  if (existingPicks.some((p) => p.playerId === playerId)) {
    return NextResponse.json({ error: "Player has already been drafted." }, { status: 400 });
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

  if (isComplete) {
    // Propagate picks to team rosters now that the draft is complete (#62)
    const { assigned } = await finalizeDraftRosters(id);
    await writeAuditLog("draft_finalized", "draft_room", id, { draftRoomId: id, assigned });
  }

  await writeAuditLog("draft_pick", "draft_pick", `${id}-${pickNumber}`, {
    draftRoomId: id,
    pickNumber,
    orgId: session.orgId,
    playerId,
    isComplete,
  });

  return NextResponse.json({ ok: true, pickNumber, complete: isComplete });
}
