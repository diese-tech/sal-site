import { NextRequest, NextResponse } from "next/server";
import {
  buildDraftState,
  getSeasonDraftedPlayerIds,
  getShortlist,
  getTopShortlistPick,
  removePlayerFromAllShortlists,
  submitPickAtomic,
  updateDraftRoomGuarded,
} from "@/lib/draft-data";
import { buildPickSequence } from "@/types/draft";
import { getCaptainSessionFromRequest } from "@/lib/captain-auth";
import { getLeagueData, writeAuditLog, LeagueDataUnavailableError } from "@/lib/league-data";
import { reportError } from "@/lib/error-monitor";

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
      try {
        const sequence = buildPickSequence(state.room.baseOrder, state.room.rounds);
        const currentOrgId = sequence[state.room.currentPickIndex];
        const nextIndex = state.room.currentPickIndex + 1;
        const isComplete = nextIndex >= sequence.length;

        // Auto-pick must apply the same division lock as the manual pick
        // route — a shortlist can hold stale cross-division entries. If league
        // data is unavailable we cannot validate eligibility, so return the
        // current state untouched instead of picking or burning the turn; the
        // next poll retries.
        let leagueData;
        try {
          leagueData = await getLeagueData();
        } catch (err) {
          if (err instanceof LeagueDataUnavailableError) {
            const shortlist = captainOrgId ? await getShortlist(id, captainOrgId) : undefined;
            return NextResponse.json({ state, captainOrgId, shortlist });
          }
          throw err;
        }
        const isEligible = (playerId: string) => {
          const player = leagueData.players.find((p) => p.id === playerId);
          return !!player && player.divisionId === state.room.divisionId;
        };

        // Try auto-pick from shortlist before skipping
        if (currentOrgId) {
          const topPick = await getTopShortlistPick(id, currentOrgId, state.room.seasonId, isEligible);
          if (topPick) {
            // Verify not already picked anywhere this season (race condition guard)
            const draftedIds = await getSeasonDraftedPlayerIds(state.room.seasonId);
            if (!draftedIds.has(topPick)) {
              const pickNumber = state.room.currentPickIndex + 1;
              // Atomic insert + index advance; if a concurrent request already
              // advanced the draft, just return fresh state without picking.
              const submitted = await submitPickAtomic(id, currentOrgId, topPick, state.room.currentPickIndex, sequence.length);
              if (submitted.ok) {
                await removePlayerFromAllShortlists(id, topPick);
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

        // No shortlist pick available — skip via the guarded update (issue
        // #129): the update only applies while current_pick_index/status
        // still match what we read above, so concurrent racers receive null
        // and no-op instead of double-advancing.
        const now = new Date().toISOString();
        const updated = await updateDraftRoomGuarded(
          id,
          { currentPickIndex: state.room.currentPickIndex, status: "active" },
          {
            currentPickIndex: nextIndex,
            status: isComplete ? "complete" : "active",
            pickStartedAt: isComplete ? null : now,
            completedAt: isComplete ? now : null,
          },
        );
        if (updated !== null) {
          await writeAuditLog("draft_auto_skip", "draft_room", id, {
            draftRoomId: id,
            skippedPickIndex: state.room.currentPickIndex,
            reason: "timer_expired_no_shortlist",
          });
        }
        const updatedState = await buildDraftState(id);
        const shortlist = captainOrgId ? await getShortlist(id, captainOrgId) : undefined;
        return NextResponse.json({ state: updatedState, captainOrgId, shortlist });
      } catch (err) {
        // Any failure resolving the timer expiry (e.g. a database error from
        // the guarded skip) must not wedge every polling client with a 500 —
        // report it and fall through to returning the current, untouched
        // state so the next poll retries.
        reportError("draft-timeout-resolution", err, {
          draftRoomId: id,
          currentPickIndex: state.room.currentPickIndex,
        });
        const shortlist = captainOrgId ? await getShortlist(id, captainOrgId) : undefined;
        return NextResponse.json({ state, captainOrgId, shortlist });
      }
    }
  }

  const shortlist = captainOrgId ? await getShortlist(id, captainOrgId) : undefined;
  return NextResponse.json({ state, captainOrgId, shortlist });
}
