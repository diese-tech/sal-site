import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/admin-auth";
import { getDraftRoom, issueTeamAccessCode, listTeamAccessCodes } from "@/lib/draft-data";
import { writeAuditLog } from "@/lib/league-data";
import { reportError } from "@/lib/error-monitor";

const rotateSchema = z.object({ orgId: z.string().trim().min(1) }).strict();

/**
 * Current access code for every seat in the room.
 *
 * Codes are re-readable rather than shown once: the old show-once links forced
 * admins to reissue mid-draft whenever a captain lost theirs, and each reissue
 * collided with the one-credential-per-seat constraint.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  const room = await getDraftRoom(id);
  if (!room) return NextResponse.json({ error: "Draft room not found." }, { status: 404 });

  const issued = await listTeamAccessCodes(id);
  const byOrg = new Map(issued.map((entry) => [entry.orgId, entry]));
  // Report a row per seat in the room, so the UI can show which teams still
  // have no code without cross-referencing.
  const codes = room.baseOrder.map((orgId) => byOrg.get(orgId) ?? null);
  return NextResponse.json({
    codes: room.baseOrder.map((orgId, index) => ({ orgId, entry: codes[index] })),
  });
}

/**
 * Issue or rotate access codes. With `{ orgId }` only that seat rotates; with
 * no body every seat in the room is (re)issued.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  const room = await getDraftRoom(id);
  if (!room) return NextResponse.json({ error: "Draft room not found." }, { status: 404 });
  if (room.baseOrder.length === 0) return NextResponse.json({ error: "Set pick order before issuing team codes." }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (body !== null) {
    const parsed = rotateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "A valid organization is required." }, { status: 400 });
    }
    if (!room.baseOrder.includes(parsed.data.orgId)) {
      return NextResponse.json({ error: "Organization is not in this draft room." }, { status: 400 });
    }

    let code: string;
    try {
      code = await issueTeamAccessCode(id, parsed.data.orgId);
    } catch (error) {
      reportError("draft team access code rotation failed", error, {
        draftRoomId: id,
        orgId: parsed.data.orgId,
      });
      return NextResponse.json({ error: "Failed to issue team code." }, { status: 500 });
    }
    await writeAuditLog("draft_team_code_issued", "draft_room", id, {
      orgCount: 1,
      orgId: parsed.data.orgId,
      accessPurpose: "captain_or_org_owner",
    });
    return NextResponse.json({ codes: { [parsed.data.orgId]: code } });
  }

  const codes: Record<string, string> = {};
  for (const orgId of room.baseOrder) {
    try {
      codes[orgId] = await issueTeamAccessCode(id, orgId);
    } catch (error) {
      // One bad seat must not abandon the rest half-issued with no report of
      // which ones landed; return what succeeded alongside the failure.
      reportError("draft team access code rotation failed", error, { draftRoomId: id, orgId });
      return NextResponse.json(
        { error: `Failed to issue a code for ${orgId}. Codes already issued in this run remain valid.`, codes },
        { status: 500 },
      );
    }
  }
  await writeAuditLog("draft_team_codes_issued", "draft_room", id, { orgCount: Object.keys(codes).length });
  return NextResponse.json({ codes });
}
