import { NextResponse, type NextRequest } from "next/server";
import {
  claimPlayerByDiscordUsername,
  getPlayerByDiscordId,
  getRegistrationByDiscordId,
} from "@/lib/league-data";
import { getAuthUser, getDiscordId, getDiscordUsername } from "@/lib/supabase-auth-server";
import { checkRateLimit, getRateLimitIdentifier, retryAfterSeconds } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const ip = getRateLimitIdentifier(request);
  const rate = checkRateLimit(`auth-claim:${ip}`);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many profile claim attempts. Try again later." },
      { status: 429, headers: { "Retry-After": retryAfterSeconds(rate.resetAt) } },
    );
  }

  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const discordId = getDiscordId(user);
  if (!discordId) return NextResponse.json({ error: "Discord ID not found in session." }, { status: 400 });

  const discordUsername = getDiscordUsername(user);
  if (!discordUsername) return NextResponse.json({ error: "Discord username not found in session." }, { status: 400 });

  // Prevent double-claiming
  const alreadyClaimed = await getPlayerByDiscordId(discordId);
  if (alreadyClaimed) {
    return NextResponse.json({ error: "This Discord account is already linked to a player profile." }, { status: 409 });
  }

  // Match entirely server-side by discord_username — no client-supplied playerId
  // accepted, which prevents cross-profile identity theft (issue #57).
  const result = await claimPlayerByDiscordUsername(discordId, discordUsername);
  if (!result.ok) {
    const msgs: Record<string, string> = {
      not_found: "No player profile found matching your Discord username. Contact an admin if you believe this is incorrect.",
      already_claimed: "This player profile is already claimed by another account.",
      discord_taken: "This Discord account is already linked to a different player profile.",
      ambiguous: "Multiple player profiles match your Discord username. An admin needs to reconcile — please contact support.",
    };
    return NextResponse.json({ error: msgs[result.reason] ?? "Claim failed." }, { status: 409 });
  }

  // If a Flow B registration exists for this discord, mark it approved/linked
  const reg = await getRegistrationByDiscordId(discordId);
  if (reg && reg.status === "pending") {
    const { updateRegistrationStatus } = await import("@/lib/league-data");
    await updateRegistrationStatus(reg.id, "approved", "Auto-approved via profile claim");
  }

  return NextResponse.json({ ok: true });
}
