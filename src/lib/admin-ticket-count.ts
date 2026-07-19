import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import {
  MATCH_REPORT_TERMINAL_STATUSES,
  PENDING_ACTION_TERMINAL_STATUSES,
  PENDING_STAT_TERMINAL_STATUSES,
  REGISTRATION_TERMINAL_STATUSES,
} from "@/lib/admin-ticket-model";

type CountResult = PromiseLike<{
  count: number | null;
  error: { message: string; code?: string } | null;
}>;

function notIn(statuses: readonly string[]): string {
  return `(${statuses.join(",")})`;
}

async function readExactCount(source: string, query: CountResult): Promise<number> {
  const result = await query;
  if (result.error) {
    throw new Error(
      `${source}: ${result.error.code ? `${result.error.code}: ` : ""}${result.error.message}`,
    );
  }
  if (result.count === null) throw new Error(`${source}: exact count unavailable`);
  return result.count;
}

export async function getUnresolvedAdminTicketCountFromClient(
  client: SupabaseClient<Database>,
): Promise<number | null> {
  try {
    const counts = await Promise.all([
      readExactCount(
        "operation",
        client
          .from("pending_actions")
          .select("id", { count: "exact", head: true })
          .not("status", "in", notIn(PENDING_ACTION_TERMINAL_STATUSES)),
      ),
      readExactCount(
        "stat_review",
        client
          .from("pending_stat_records")
          .select("id", { count: "exact", head: true })
          .not("status", "in", notIn(PENDING_STAT_TERMINAL_STATUSES)),
      ),
      readExactCount(
        "registration",
        client
          .from("registrations")
          .select("id", { count: "exact", head: true })
          .not("status", "in", notIn(REGISTRATION_TERMINAL_STATUSES)),
      ),
      readExactCount(
        "match_report",
        client
          .from("match_reports")
          .select("id", { count: "exact", head: true })
          .not("status", "in", notIn(MATCH_REPORT_TERMINAL_STATUSES)),
      ),
    ]);

    return counts.reduce((total, count) => total + count, 0);
  } catch (error) {
    console.error(
      "[admin-ticket-count] unresolved count unavailable:",
      error instanceof Error ? error.message : "unknown error",
    );
    return null;
  }
}

export async function getUnresolvedAdminTicketCount(): Promise<number | null> {
  const client = getSupabaseServerClient();
  if (!client) return null;
  return getUnresolvedAdminTicketCountFromClient(client);
}
