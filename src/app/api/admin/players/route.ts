import { NextRequest, NextResponse } from "next/server";
import type { LeaguePlayer } from "@/types/league";
import { isAdminRequest } from "@/lib/admin-auth";
import { savePlayer } from "@/lib/league-data";

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const player = await request.json().catch(() => null) as LeaguePlayer | null;
  if (!player?.id || !player.ign || !player.discordUsername || !player.primaryRole) {
    return NextResponse.json({ error: "Missing required player fields." }, { status: 400 });
  }

  await savePlayer(player);
  return NextResponse.json({ ok: true });
}
