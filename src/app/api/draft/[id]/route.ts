import { NextRequest, NextResponse } from "next/server";
import { buildDraftState } from "@/lib/draft-data";
import { getCaptainSessionFromRequest } from "@/lib/captain-auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await buildDraftState(id);
  if (!state) return NextResponse.json({ error: "Draft not found." }, { status: 404 });

  // Include whether the requester is a captain for this draft
  const session = getCaptainSessionFromRequest(request);
  const isCaptain = session?.draftRoomId === id;
  const captainOrgId = isCaptain ? session?.orgId : null;

  return NextResponse.json({ state, captainOrgId });
}
