import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { buildDraftState, updateDraftRoom } from "@/lib/draft-data";
import { writeAuditLog } from "@/lib/league-data";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { errorMessage } from "@/lib/error-monitor";
import { draftDivisionName, evaluateDraftTeamOrder } from "@/lib/draft-team";
import type { DivisionId } from "@/types/league";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  try {
    const state = await buildDraftState(id);
    if (!state) return NextResponse.json({ error: "Draft room not found." }, { status: 404 });
    if (state.room.status !== "pending") return NextResponse.json({ error: `Cannot start a draft with status "${state.room.status}".` }, { status: 400 });
    if (state.room.baseOrder.length === 0) return NextResponse.json({ error: "Set the pick order before starting the draft." }, { status: 400 });
    // Draft teams are season-scoped. orgs.division_id is only a legacy/default
    // display value and cannot validate a multi-division organization's team.
    const supabase = getSupabaseServerClient();
    if (supabase && state.room.baseOrder.length > 0) {
      const [seasonTeamResult, organizationResult] = await Promise.all([
        supabase
          .from("season_orgs")
          .select("org_id, division_id, status")
          .eq("season_id", state.room.seasonId)
          .in("org_id", state.room.baseOrder),
        supabase
          .from("orgs")
          .select("id, name")
          .in("id", state.room.baseOrder),
      ]);
      if (seasonTeamResult.error) throw seasonTeamResult.error;
      if (organizationResult.error) throw organizationResult.error;

      const evaluation = evaluateDraftTeamOrder({
        baseOrder: state.room.baseOrder,
        divisionId: state.room.divisionId,
        organizations: organizationResult.data ?? [],
        seasonTeams: (seasonTeamResult.data ?? []).map((team) => ({
          orgId: team.org_id,
          divisionId: team.division_id as DivisionId,
          status: team.status,
        })),
      });
      if (!evaluation.valid) {
        console.warn("[draft-start] rejected invalid season-team pick order", {
          draftRoomId: id,
          seasonId: state.room.seasonId,
          divisionId: state.room.divisionId,
          savedOrganizationIds: state.room.baseOrder,
        });
        return NextResponse.json(
          {
            error: `Some teams in the saved pick order do not belong to the ${draftDivisionName(state.room.divisionId)}. Remove or replace them before starting the draft. Affected teams: ${evaluation.invalidTeamLabels.join(", ")}.`,
          },
          { status: 400 }
        );
      }
    }
    const now = new Date().toISOString();
    const room = await updateDraftRoom(id, { status: "active", startedAt: now, pickStartedAt: now, currentPickIndex: 0 });
    await writeAuditLog("draft_started", "draft_room", id, { divisionId: state.room.divisionId });
    return NextResponse.json({ room });
  } catch (err) {
    const message = errorMessage(err, "Failed to start draft.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
