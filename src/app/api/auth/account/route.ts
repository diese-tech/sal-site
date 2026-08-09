import { NextResponse } from "next/server";
import { getPlayerByDiscordId } from "@/lib/league-data";
import {
  getAuthUser,
  getDiscordId,
  getDiscordUsername,
} from "@/lib/supabase-auth-server";

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json(
      { error: "Not signed in." },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const discordId = getDiscordId(user);
  const discordUsername = getDiscordUsername(user);
  if (!discordId || !discordUsername) {
    return NextResponse.json(
      { error: "A trusted Discord identity was not found in this session." },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const player = await getPlayerByDiscordId(discordId);

  return NextResponse.json(
    {
      discordUsername,
      player: player ? { id: player.id, ign: player.ign } : null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
