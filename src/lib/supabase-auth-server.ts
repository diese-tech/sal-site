import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export async function getSupabaseAuthServerClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll called from a Server Component — safe to ignore
          }
        },
      },
    },
  );
}

export async function getAuthUser(): Promise<User | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  const supabase = await getSupabaseAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export function getDiscordId(user: User): string | null {
  return (
    user.user_metadata?.provider_id as string | undefined ??
    user.identities?.find((i) => i.provider === "discord")?.id ??
    null
  );
}

export function getDiscordUsername(user: User): string {
  // user_metadata.user_name is usually populated, but some sessions only
  // carry the username on the Discord identity's own identity_data (both are
  // Discord-sourced and equally trustworthy) — check both before giving up
  // (Codex review on #233: giving up too early left real users stuck with a
  // permanently blank registration, since a discord_id can only register once).
  const discordIdentity = user.identities?.find((i) => i.provider === "discord");
  const username =
    (user.user_metadata?.user_name as string | undefined) ??
    (discordIdentity?.identity_data?.user_name as string | undefined);
  // NEVER fall back to user.email (or any other PII) here: this value is
  // stored on registrations/players and rendered publicly (player directory,
  // team rosters), so anything but the real Discord username leaking through
  // would expose personal data to every visitor. If Discord/Supabase didn't
  // return a username anywhere in this session, leave it blank — callers
  // must not paper over a missing username with something sensitive, and
  // must reject/surface the gap instead of silently persisting it.
  return username ?? "";
}

export function getDiscordDisplayName(user: User): string {
  return (user.user_metadata?.full_name as string | undefined) ?? getDiscordUsername(user);
}

const DISCORD_CDN_HOSTS = new Set(["cdn.discordapp.com", "media.discordapp.net"]);

function isDiscordCdnAvatarUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && DISCORD_CDN_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Discord CDN profile picture URL, if the OAuth session returned one.
 * Confirmed present as a fully-formed `https://cdn.discordapp.com/avatars/...`
 * URL in user_metadata.avatar_url for this project's Discord OIDC provider —
 * no need to construct/size it ourselves.
 *
 * user_metadata is directly writable by the signed-in user via
 * `supabase.auth.updateUser({ data })`, unlike identity_data (which mirrors
 * what Discord itself returned at OAuth time and isn't user-editable) — so
 * prefer identity_data, and require *either* source to actually be a Discord
 * CDN URL before trusting it. This value is rendered as an unoptimized public
 * <Image> on the player directory, so an unvalidated value here would let any
 * player point every visitor's browser at an arbitrary attacker-controlled
 * URL (Codex review on #236).
 */
export function getDiscordAvatarUrl(user: User): string | undefined {
  const discordIdentity = user.identities?.find((i) => i.provider === "discord");
  const candidate =
    (discordIdentity?.identity_data?.avatar_url as string | undefined) ??
    (user.user_metadata?.avatar_url as string | undefined);
  return isDiscordCdnAvatarUrl(candidate) ? candidate : undefined;
}
