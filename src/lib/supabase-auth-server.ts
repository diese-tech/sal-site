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
  // carry it on the Discord identity's own identity_data (Codex review on
  // #233: giving up too early left real users stuck with a permanently
  // blank registration, since a discord_id can only register once).
  //
  // For accounts on Discord's newer global-handle system (no discriminator,
  // no separate display name set), Supabase's provider mapping has been
  // observed leaving user_name AND identity_data.user_name both empty, while
  // full_name still carries the real handle (Supabase derives full_name from
  // `global_name ?? username`, and a plain string `full_name` in that
  // situation IS the username) — confirmed against live incident data where
  // every affected account had full_name equal to its real Discord handle
  // with user_name/identity_data completely unset.
  const discordIdentity = user.identities?.find((i) => i.provider === "discord");
  const identityData = discordIdentity?.identity_data ?? {};
  const username =
    (user.user_metadata?.user_name as string | undefined) ??
    (identityData.user_name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    (identityData.full_name as string | undefined) ??
    (identityData.global_name as string | undefined);
  // NEVER fall back to user.email (or any other PII) here: this value is
  // stored on registrations/players and rendered publicly (player directory,
  // team rosters), so anything but the real Discord username leaking through
  // would expose personal data to every visitor. If Discord/Supabase didn't
  // return anything usable anywhere in this session, leave it blank —
  // callers must not paper over a missing username with something
  // sensitive, and must reject/surface the gap instead of silently
  // persisting it.
  return username ?? "";
}

export function getDiscordDisplayName(user: User): string {
  return (user.user_metadata?.full_name as string | undefined) ?? getDiscordUsername(user);
}
