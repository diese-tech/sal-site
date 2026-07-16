import { NextRequest, NextResponse } from "next/server";
import {
  advancePickOnTimeout,
  buildDraftState,
  finalizeDraftRosters,
  getDraftPicks,
  getShortlist,
  getTopShortlistPick,
  removePlayerFromAllShortlists,
  submitPickAtomic,
} from "@/lib/draft-data";
import { buildPickSequence } from "@/types/draft";
import { getCaptainSessionFromRequest } from "@/lib/captain-auth";
import { writeAuditLog } from "@/lib/league-data";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await buildDraftState(id);
  if (!state) return NextResponse.json({ error: "Draft not found." }, { status: 404 });

  const session = getCaptainSessionFromRequest(request);
  const isCaptain = session?.draftRoomId === id;
  const captainOrgId = isCaptain ? session?.orgId : null;

  if (state.room.status === "active" && state.room.pickStartedAt && state.room.pickTimerSeconds > 0) {
    const elapsed = (Date.now() - new Date(state.room.pickStartedAt).getTime()) / 1000;
    if (elapsed >= state.room.pickTimerSeconds) {
      const sequence = buildPickSequence(state.room.baseOrder, state.room.rounds);
      const currentOrgId = sequence[state.room.currentPickIndex];
      const nextIndex = state.room.currentPickIndex + 1;
      const isComplete = nextIndex >= sequence.length;

      // Try auto-pick from shortlist before skipping
      if (currentOrgId) {
        const topPick = await getTopShortlistPick(id, currentOrgId);
        if (topPick) {
          // Verify not already picked (race condition guard)
          const existingPicks = await getDraftPicks(id);
          if (!existingPicks.some((p) => p.playerId === topPick)) {
            const pickNumber = state.room.currentPickIndex + 1;
            // Atomic insert + index advance; if a concurrent request already
            // advanced the draft, just return fresh state without picking.
            const submitted = await submitPickAtomic(id, currentOrgId, topPick, state.room.currentPickIndex, sequence.length);
            if (submitted.ok) {
              await removePlayerFromAllShortlists(id, topPick);
              if (submitted.isComplete) {
                // Propagate picks to team rosters now that the draft is complete (#62)
                const { assigned } = await finalizeDraftRosters(id);
                await writeAuditLog("draft_finalized", "draft_room", id, { draftRoomId: id, assigned });
              }
              await writeAuditLog("draft_auto_pick", "draft_pick", `${id}-${pickNumber}`, {
                draftRoomId: id,
                pickNumber,
                orgId: currentOrgId,
                playerId: topPick,
                reason: "shortlist_auto_pick",
                isComplete,
              });
            } else if (submitted.conflict) {
              await writeAuditLog("draft_auto_pick_conflict", "draft_pick", `${id}-${pickNumber}`, {
                draftRoomId: id,
                pickNumber,
                orgId: currentOrgId,
                attemptedPlayerId: topPick,
                reason: "concurrent_pick_conflict",
              });
            }
            const updatedState = await buildDraftState(id);
            const shortlist = captainOrgId ? await getShortlist(id, captainOrgId) : undefined;
            return NextResponse.json({ state: updatedState, captainOrgId, shortlist });
          }
        }
      }

      // No shortlist pick available — skip atomically (issue #129).
      // advance_pick_on_timeout locks the room row and re-validates index +
      // timer under the lock; concurrent racers receive false and no-op.
      const advanced = await advancePickOnTimeout(id, state.room.currentPickIndex, sequence.length);
      if (advanced) {
        await writeAuditLog("draft_auto_skip", "draft_room", id, {
          draftRoomId: id,
          skippedPickIndex: state.room.currentPickIndex,
          reason: "timer_expired_no_shortlist",
        });
        if (isComplete) {
          // Propagate picks to team rosters now that the draft is complete (#62)
          const { assigned } = await finalizeDraftRosters(id);
          await writeAuditLog("draft_finalized", "draft_room", id, { draftRoomId: id, assigned });
        }
      }
      const updatedState = await buildDraftState(id);
      const shortlist = captainOrgId ? await getShortlist(id, captainOrgId) : undefined;
      return NextResponse.json({ state: updatedState, captainOrgId, shortlist });
    }
  }

  const shortlist = captainOrgId ? await getShortlist(id, captainOrgId) : undefined;
  return NextResponse.json({ state, captainOrgId, shortlist });
}
