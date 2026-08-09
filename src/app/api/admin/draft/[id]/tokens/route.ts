import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/admin-auth";
import { generateCaptainToken, getDraftRoom } from "@/lib/draft-data";
import { writeAuditLog } from "@/lib/league-data";
import { reportError } from "@/lib/error-monitor";

const delegatedAccessSchema = z.object({ orgId: z.string().trim().min(1) }).strict();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  const room = await getDraftRoom(id);
  if (!room) return NextResponse.json({ error: "Draft room not found." }, { status: 404 });
  if (room.baseOrder.length === 0) return NextResponse.json({ error: "Set pick order before generating tokens." }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (body !== null) {
    const parsed = delegatedAccessSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "A valid organization is required." }, { status: 400 });
    }
    if (!room.baseOrder.includes(parsed.data.orgId)) {
      return NextResponse.json({ error: "Organization is not in this draft room." }, { status: 400 });
    }

    let token: string;
    try {
      token = await generateCaptainToken(id, parsed.data.orgId);
    } catch (error) {
      reportError("draft delegate token generation failed", error, {
        draftRoomId: id,
        orgId: parsed.data.orgId,
      });
      return NextResponse.json({ error: "Failed to generate access link." }, { status: 500 });
    }
    await writeAuditLog("draft_delegate_token_generated", "draft_room", id, {
      orgCount: 1,
      orgId: parsed.data.orgId,
      accessPurpose: "captain_or_org_owner",
    });
    return NextResponse.json({ tokens: { [parsed.data.orgId]: token } });
  }

  const tokens: Record<string, string> = {};
  for (const orgId of room.baseOrder) {
    const token = await generateCaptainToken(id, orgId);
    tokens[orgId] = token;
  }
  await writeAuditLog("draft_tokens_generated", "draft_room", id, { orgCount: Object.keys(tokens).length });
  return NextResponse.json({ tokens });
}
