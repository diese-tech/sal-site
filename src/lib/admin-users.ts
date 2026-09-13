import { getSupabaseServerClient } from "@/lib/supabase-server";
import { writeAuditLog } from "@/lib/league-data";

export type AdminRole = "admin" | "super_admin";

export interface AdminUserRow {
  discordId: string;
  role: AdminRole;
  discordUsername: string | null;
  displayName: string | null;
  createdAt: string;
}

// Discord snowflakes are 17-20 digits. Same pattern lab-salbot uses for role
// IDs (apps/bot/src/lib/command-access.ts) — keep both sides consistent.
const DISCORD_ID = /^\d{17,20}$/;

// Thrown for problems the caller caused (bad ID, self-removal, would leave
// zero super admins) so the route can return 400 instead of 500.
export class AdminUsersError extends Error {}

// discord_username/display_name are NOT NULL DEFAULT '' in the schema.
interface AdminUsersRow {
  discord_id: string;
  role: string;
  discord_username: string;
  display_name: string;
  created_at: string;
}

function mapRow(row: AdminUsersRow): AdminUserRow {
  return {
    discordId: row.discord_id,
    role: row.role === "super_admin" ? "super_admin" : "admin",
    // discord_username/display_name are NOT NULL DEFAULT '' in the schema —
    // there's no null to receive here, but "unset" reads better as null than
    // as a blank string in the UI.
    discordUsername: row.discord_username || null,
    displayName: row.display_name || null,
    createdAt: row.created_at,
  };
}

function requireClient() {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new AdminUsersError("Supabase is not configured.");
  return supabase;
}

export async function getAdminUsers(): Promise<AdminUserRow[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("admin_users")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => mapRow(row as AdminUsersRow));
}

/**
 * Adds a new admin, or updates the role of an existing one (upsert on the
 * `discord_id` primary key) — the one thing this repo's "give someone admin
 * access" process required a migration or a Supabase SQL editor session for.
 * discord_id is how OAuth login (api/admin/discord/callback) recognizes an
 * admin, so this is the entire grant; there is no separate permissions table.
 */
export async function upsertAdminUser(
  input: {
    discordId: string;
    role: AdminRole;
    discordUsername?: string | null;
    displayName?: string | null;
  },
  actorDiscordId: string,
): Promise<AdminUserRow> {
  const discordId = input.discordId.trim();
  if (!DISCORD_ID.test(discordId)) {
    throw new AdminUsersError(
      "Discord ID must be the 17-20 digit numeric ID (Discord Settings → Advanced → Developer Mode, then right-click the user → Copy User ID) — not their username.",
    );
  }

  const supabase = requireClient();
  const { data: existing, error: existingError } = await supabase
    .from("admin_users")
    .select("role")
    .eq("discord_id", discordId)
    .maybeSingle();
  if (existingError) throw existingError;

  // Same failure mode as self-removal below: a super admin demoting
  // themselves, with no other super admin left to promote them back, locks
  // everyone out of this page — the only place a role can be changed at all.
  if (existing?.role === "super_admin" && discordId === actorDiscordId && input.role !== "super_admin") {
    throw new AdminUsersError("You cannot remove your own super admin role. Have another super admin do it.");
  }

  const { data, error } = await supabase
    .from("admin_users")
    .upsert({
      discord_id: discordId,
      role: input.role,
      // Omitting empty values (rather than sending null, which the NOT NULL
      // column would reject) preserves the existing value on an update and
      // lets the '' default apply on insert.
      discord_username: input.discordUsername?.trim() || undefined,
      display_name: input.displayName?.trim() || undefined,
    })
    .select()
    .single();
  if (error) throw error;

  // admin_audit_log has no actor column (see writeCaptainReassignmentAudit
  // for the same convention) — the actor goes in the payload instead.
  await writeAuditLog(
    existing ? "update_admin_user_role" : "add_admin_user",
    "admin_user",
    discordId,
    { role: input.role, previousRole: existing?.role ?? null, actorDiscordId },
  );

  return mapRow(data as AdminUsersRow);
}

/**
 * Removes an admin. Refuses to remove yourself (a super admin locking
 * themselves out is a support ticket, not a feature) and refuses to remove
 * the last super_admin (the role check on every other admin route requires
 * one to exist to grant anyone else access back).
 */
export async function removeAdminUser(discordId: string, actorDiscordId: string): Promise<void> {
  if (discordId === actorDiscordId) {
    throw new AdminUsersError("You cannot remove your own admin access. Have another super admin do it.");
  }

  const supabase = requireClient();
  const { data: target, error: targetError } = await supabase
    .from("admin_users")
    .select("role")
    .eq("discord_id", discordId)
    .maybeSingle();
  if (targetError) throw targetError;
  if (!target) throw new AdminUsersError("That Discord ID is not an admin.");

  if (target.role === "super_admin") {
    const { count, error: countError } = await supabase
      .from("admin_users")
      .select("discord_id", { count: "exact", head: true })
      .eq("role", "super_admin");
    if (countError) throw countError;
    if ((count ?? 0) <= 1) {
      throw new AdminUsersError("Cannot remove the last super admin — promote someone else first.");
    }
  }

  const { error } = await supabase.from("admin_users").delete().eq("discord_id", discordId);
  if (error) throw error;

  await writeAuditLog("remove_admin_user", "admin_user", discordId, {
    role: target.role,
    actorDiscordId,
  });
}
