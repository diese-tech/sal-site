import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { buildDraftState, updateDraftRoomIfPickIndex } from "@/lib/draft-data";
import { buildPickSequence } from "@/types/draft";
import { writeAuditLog } from "@/lib/league-data";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  const state = await buildDraftState(id);
  if (!state) return NextResponse.json({ error: "Draft room not found." }, { status: 404 });
  if (state.room.status !== "active" && state.room.status !== "paused") {
    return NextResponse.json({ error: "Draft is not in progress." }, { status: 400 });
  }
  const { room } = state;
  const sequence = buildPickSequence(room.baseOrder, room.rounds);
  const nextIndex = room.currentPickIndex + 1;
  const isComplete = nextIndex >= sequence.length;
  const now = new Date().toISOString();
  // Guarded on the pick index read above: a concurrent captain pick or
  // timeout auto-advance changes current_pick_index, and skipping on top of
  // that stale snapshot would silently drop their advance.
  const updated = await updateDraftRoomIfPickIndex(id, room.currentPickIndex, {
    currentPickIndex: nextIndex,
    status: isComplete ? "complete" : room.status === "paused" ? "paused" : "active",
    pickStartedAt: isComplete ? null : now,
    completedAt: isComplete ? now : null,
  });
  if (!updated) {
    return NextResponse.json({ error: "Another action advanced the draft. Refresh and retry." }, { status: 409 });
  }
  await writeAuditLog("draft_pick_skipped", "draft_room", id, { skippedPickIndex: room.currentPickIndex });
  return NextResponse.json({ room: updated, skipped: true, complete: isComplete });
}
