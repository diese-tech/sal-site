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
  const discordIdentity = user.identities?.find((i) => i.provider === "discord");
  const identityData = discordIdentity?.identity_data ?? {};

  // Prefer an explicit username field, but never a display name — Codex
  // review on #235: user_metadata.full_name / identity_data.global_name CAN
  // be a distinct, non-unique display name a Discord user sets separately
  // from their real handle (verified live: one #233-affected account's real
  // handle is "ne1217" but its Discord display name is "XGN Ninjaa").
  // Accepting a display name here could match/claim the wrong player via
  // /api/auth/claim, or persist the wrong public handle on registration.
  const explicitUsername =
    (user.user_metadata?.user_name as string | undefined) ??
    (identityData.user_name as string | undefined);
  if (explicitUsername) return explicitUsername;

  // Discord's raw OIDC `name` claim is always "username#discriminator"
  // ("0" for accounts on the newer global-handle system) regardless of
  // whatever separate display name is also set, so stripping the
  // discriminator reliably recovers the real, unique handle without any
  // risk of it being a display name. Verified directly against
  // auth.users.raw_user_meta_data for every account affected by #233/#235 —
  // their user_name was empty but name held e.g. "ne1217#0".
  const rawName = (user.user_metadata?.name as string | undefined) ?? (identityData.name as string | undefined);
  const parsedHandle = rawName?.split("#")[0]?.trim();
  if (parsedHandle) return parsedHandle;

  // NEVER fall back to user.email, full_name, or global_name here: this
  // value is stored on registrations/players and rendered publicly (player
  // directory, team rosters), so a display name or email leaking through
  // could misidentify a player or expose PII. Leave it blank instead —
  // callers must reject/surface the gap rather than silently persist
  // something wrong.
  return "";
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
