import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isAdminRequest, getAdminRequestSession } from "@/lib/admin-auth";
import { finalizeDraftRosters } from "@/lib/draft-data";
import { writeAuditLog } from "@/lib/league-data";

// Manual roster propagation for a completed draft (#62). New drafts finalize
// automatically when the last pick lands; this covers drafts completed before
// auto-finalize existed or re-runs after manual roster corrections.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  try {
    const { assigned } = await finalizeDraftRosters(id);

    const session = getAdminRequestSession(request);
    await writeAuditLog("draft_finalized", "draft_room", id, {
      draftRoomId: id,
      assigned,
      trigger: "admin_manual",
      adminDiscordId: session?.discordId,
    });

    revalidateTag("league-data", {});
    return NextResponse.json({ ok: true, assigned });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to finalize draft.";
    console.error("POST /api/admin/draft/[id]/finalize:", err);
    const status = message === "Draft room not found." ? 404 : message === "Draft is not complete." ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
