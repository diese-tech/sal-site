import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { checkRateLimit, getRateLimitIdentifier, retryAfterSeconds } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const ip = getRateLimitIdentifier(request);
  const rate = checkRateLimit(`admin-discord-authorize:${ip}`);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many authorization attempts. Try again later." },
      { status: 429, headers: { "Retry-After": retryAfterSeconds(rate.resetAt) } },
    );
  }

  const clientId = process.env.DISCORD_ADMIN_CLIENT_ID;
  const redirectUri = process.env.DISCORD_ADMIN_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return NextResponse.redirect(
      new URL("/admin/login?error=config", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
    );
  }
  const state = randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify",
    state,
  });
  const response = NextResponse.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
  response.cookies.set("discord_admin_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 300,
    path: "/",
  });
  return response;
}
