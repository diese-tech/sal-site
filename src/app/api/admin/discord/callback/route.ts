import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { adminCookie } from "@/lib/admin-auth";
import { checkRateLimit, clearRateLimit, getRateLimitIdentifier, retryAfterSeconds } from "@/lib/rate-limit";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { reportError } from "@/lib/error-monitor";

type DiscordTokenResponse = { access_token: string; token_type: string };
type DiscordUser = { id: string; username: string; global_name?: string };

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export async function GET(request: NextRequest) {
  const ip = getRateLimitIdentifier(request);
  const rate = checkRateLimit(`admin-discord-callback:${ip}`);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many authorization attempts. Try again later." },
      { status: 429, headers: { "Retry-After": retryAfterSeconds(rate.resetAt) } },
    );
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = request.cookies.get("discord_admin_state")?.value;

  // Always clear the state cookie
  const clearStateCookie = (response: NextResponse) => {
    response.cookies.set("discord_admin_state", "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
      path: "/",
    });
    return response;
  };

  // Verify state using timing-safe comparison to prevent timing oracle attacks
  const stateMatch =
    state &&
    storedState &&
    state.length === storedState.length &&
    timingSafeEqual(Buffer.from(state), Buffer.from(storedState));
  if (!stateMatch) {
    const response = NextResponse.redirect(new URL("/admin/login?error=invalid_state", siteUrl()));
    return clearStateCookie(response);
  }

  if (!code) {
    const response = NextResponse.redirect(new URL("/admin/login?error=invalid_state", siteUrl()));
    return clearStateCookie(response);
  }

  const clientId = process.env.DISCORD_ADMIN_CLIENT_ID;
  const clientSecret = process.env.DISCORD_ADMIN_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_ADMIN_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    const response = NextResponse.redirect(new URL("/admin/login?error=config", siteUrl()));
    return clearStateCookie(response);
  }

  // Exchange code for token
  let tokenData: DiscordTokenResponse;
  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text().catch(() => "");
      throw new Error(`Token exchange failed: ${tokenRes.status} ${body.slice(0, 300)}`);
    }
    tokenData = (await tokenRes.json()) as DiscordTokenResponse;
  } catch (err) {
    reportError("admin discord login: token exchange failed", err);
    const response = NextResponse.redirect(new URL("/admin/login?error=token_exchange", siteUrl()));
    return clearStateCookie(response);
  }

  // Fetch Discord user
  let discordUser: DiscordUser;
  try {
    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `${tokenData.token_type} ${tokenData.access_token}` },
    });
    if (!userRes.ok) throw new Error(`User fetch failed: ${userRes.status}`);
    discordUser = (await userRes.json()) as DiscordUser;
  } catch (err) {
    reportError("admin discord login: user fetch failed", err);
    const response = NextResponse.redirect(new URL("/admin/login?error=user_fetch", siteUrl()));
    return clearStateCookie(response);
  }

  // Look up in admin_users table
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    const response = NextResponse.redirect(new URL("/admin/login?error=config", siteUrl()));
    return clearStateCookie(response);
  }

  const { data, error } = await supabase
    .from("admin_users")
    .select("role")
    .eq("discord_id", discordUser.id)
    .single();

  if (error || !data) {
    reportError("admin discord login: no admin access", error ?? new Error("discord_id not in admin_users"), {
      discordId: discordUser.id,
      username: discordUser.username,
    });
    const response = NextResponse.redirect(new URL("/admin/login?error=no_access", siteUrl()));
    return clearStateCookie(response);
  }

  const role = data.role as "super_admin" | "admin";

  // Set admin session cookie and redirect to admin
  try {
    const cookie = adminCookie(discordUser.id, role);
    const response = NextResponse.redirect(new URL("/admin", siteUrl()));
    clearRateLimit(`admin-discord-callback:${ip}`);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return clearStateCookie(response);
  } catch (err) {
    // e.g. ADMIN_SESSION_SECRET missing — previously surfaced as a bare 500
    reportError("admin discord login: session cookie creation failed", err, { discordId: discordUser.id });
    const response = NextResponse.redirect(new URL("/admin/login?error=config", siteUrl()));
    return clearStateCookie(response);
  }
}
