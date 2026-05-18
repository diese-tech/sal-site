import { NextRequest, NextResponse } from "next/server";
import type { Match } from "@/types/league";
import { isAdminRequest } from "@/lib/admin-auth";
import { saveMatch } from "@/lib/league-data";

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const match = await request.json().catch(() => null) as Match | null;
  if (!match?.id || !match.divisionId || !match.homeOrgId || !match.awayOrgId || !match.scheduledDate || !match.scheduledTime) {
    return NextResponse.json({ error: "Missing required match fields." }, { status: 400 });
  }

  await saveMatch({
    ...match,
    week: Number(match.week),
    homeScore: match.homeScore === undefined || match.homeScore === null ? undefined : Number(match.homeScore),
    awayScore: match.awayScore === undefined || match.awayScore === null ? undefined : Number(match.awayScore),
  });
  return NextResponse.json({ ok: true });
}
