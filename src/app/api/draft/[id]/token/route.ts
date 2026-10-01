import { NextRequest, NextResponse } from "next/server";
import { exchangeToken, getCaptainSeatsFromRequest, grantCaptainSeat } from "@/lib/captain-auth";

/**
 * Legacy `?token=` link redemption.
 *
 * Team access codes entered at the draft room replaced these links, but tokens
 * already handed out stay redeemable here until they expire. Redemption is no
 * longer destructive, so an old link now works on more than one device too.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null) as { token?: string } | null;
  if (!body?.token) return NextResponse.json({ error: "Token required." }, { status: 400 });

  const session = await exchangeToken(body.token);
  if (!session || session.draftRoomId !== id) {
    return NextResponse.json({ error: "Invalid or expired captain link. Ask an admin for your team code." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, orgId: session.orgId });
  grantCaptainSeat(response, getCaptainSeatsFromRequest(request), session);
  return response;
}
