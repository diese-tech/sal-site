import { NextResponse, type NextRequest } from "next/server";
import {
  approveRegistrationAfterProfileClaim,
  claimPlayerByDiscordUsername,
  getPlayerByDiscordId,
  getRegistrationByDiscordId,
} from "@/lib/league-data";
import { getAuthUser, getDiscordAvatarUrl, getDiscordId, getDiscordUsername } from "@/lib/supabase-auth-server";
import { checkRateLimit, getRateLimitIdentifier, retryAfterSeconds } from "@/lib/rate-limit";

async function finishClaim(discordId: string, playerId: string, alreadyLinked = false) {
  const registration = await getRegistrationByDiscordId(discordId);
  if (registration?.status === "pending") {
    try {
      await approveRegistrationAfterProfileClaim(registration.id, discordId, playerId);
    } catch {
      return NextResponse.json(
        {
          code: "claim_reconciliation_failed",
          error: "Your player profile is linked, but registration cleanup did not finish. Please retry.",
        },
        { status: 503 },
      );
    }
  }

  return NextResponse.json({ ok: true, alreadyLinked });
}

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

  // A prior attempt may have linked the player before registration cleanup
  // failed or the response was lost. Repair that pending row idempotently.
  const alreadyClaimed = await getPlayerByDiscordId(discordId);
  if (alreadyClaimed) {
    return finishClaim(discordId, alreadyClaimed.id, true);
  }

  // Match entirely server-side by discord_username — no client-supplied playerId
  // accepted, which prevents cross-profile identity theft (issue #57).
  const result = await claimPlayerByDiscordUsername(discordId, discordUsername, getDiscordAvatarUrl(user));
  if (!result.ok) {
    const msgs: Record<string, string> = {
      not_found: "No player profile found matching your Discord username. Contact an admin if you believe this is incorrect.",
      already_claimed: "This player profile is already claimed by another account.",
      discord_taken: "This Discord account is already linked to a different player profile.",
      ambiguous: "Multiple player profiles match your Discord username. An admin needs to reconcile — please contact support.",
    };
    return NextResponse.json({ error: msgs[result.reason] ?? "Claim failed." }, { status: 409 });
  }

  return finishClaim(discordId, result.playerId);
}
