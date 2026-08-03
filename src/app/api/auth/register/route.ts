import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createRegistration, getCurrentSeasonId, getRegistrationByDiscordId } from "@/lib/league-data";
import { getAuthUser, getDiscordId, getDiscordUsername, getDiscordDisplayName } from "@/lib/supabase-auth-server";
import { checkRateLimit, getRateLimitIdentifier, retryAfterSeconds } from "@/lib/rate-limit";

const schema = z.object({
  formData: z.record(z.string(), z.string()),
});

export async function POST(request: NextRequest) {
  const ip = getRateLimitIdentifier(request);
  const rate = checkRateLimit(`auth-register:${ip}`);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many registration attempts. Try again later." },
      { status: 429, headers: { "Retry-After": retryAfterSeconds(rate.resetAt) } },
    );
  }

  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const discordId = getDiscordId(user);
  if (!discordId) return NextResponse.json({ error: "Discord ID not found in session." }, { status: 400 });

  // A blank username must never be persisted: discord_id can only register
  // once (see the existing-registration check below), so a registration
  // created with no Discord handle would leave the user permanently stuck
  // with no way to retry (Codex review on #233).
  const discordUsername = getDiscordUsername(user);
  if (!discordUsername) {
    return NextResponse.json(
      { error: "Discord username not found in session. Please sign out and sign back in with Discord, then try again." },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const existing = await getRegistrationByDiscordId(discordId);
  if (existing) {
    return NextResponse.json(
      { error: "A registration already exists for this Discord account.", existing },
      { status: 409 },
    );
  }

  const seasonId = await getCurrentSeasonId();
  if (!seasonId) {
    return NextResponse.json(
      { error: "Registration is temporarily unavailable because no current season is configured." },
      { status: 503 },
    );
  }

  const id = `reg-${crypto.randomUUID()}`;
  await createRegistration({
    id,
    discordId,
    discordUsername,
    discordDisplayName: getDiscordDisplayName(user),
    seasonId,
    formData: parsed.data.formData,
  });

  return NextResponse.json({ ok: true, id });
}
