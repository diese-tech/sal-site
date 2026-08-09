import type { User } from "@supabase/supabase-js";

function getDiscordIdentity(user: User) {
  return user.identities?.find((identity) => identity.provider === "discord") ?? null;
}

/** Resolve Discord's provider ID only from the immutable provider identity. */
export function resolveDiscordId(user: User): string | null {
  const identity = getDiscordIdentity(user);
  if (!identity) return null;
  const providerId = identity.identity_data?.provider_id;
  return typeof providerId === "string" && providerId ? providerId : identity.id || null;
}

/** Resolve Discord's unique handle without trusting mutable top-level metadata. */
export function resolveDiscordUsername(user: User): string {
  const identity = getDiscordIdentity(user);
  if (!identity) return "";
  const identityData = identity.identity_data ?? {};
  const explicitUsername = identityData.user_name;
  if (typeof explicitUsername === "string" && explicitUsername) return explicitUsername;

  const rawName = identityData.name;
  return typeof rawName === "string" ? rawName.split("#")[0]?.trim() ?? "" : "";
}
