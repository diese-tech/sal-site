import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { AdminTicket, TicketSourceHealth } from "@/types/admin-ticket";
import {
  MATCH_REPORT_COLUMNS,
  PENDING_ACTION_COLUMNS,
  PENDING_STAT_RECORD_COLUMNS,
  REGISTRATION_COLUMNS,
  normalizeTicketSources,
  sortTickets,
  type MatchReportSourceRow,
  type PendingActionSourceRow,
  type PendingStatRecordSourceRow,
  type RegistrationSourceRow,
} from "@/lib/admin-ticket-model";

// Server-only: reads with the service-role client and must never be imported
// from client components. Raw rows stay here; only normalized tickets leave.

const SOURCE_LIMIT = 200;
const SOURCE_UNAVAILABLE = "Source unavailable, showing the rest of the queue.";
const NOT_CONFIGURED = "Database connection is not configured.";

export interface AdminTicketQueueData {
  tickets: AdminTicket[];
  sourceHealth: TicketSourceHealth[];
  /** Cosmetic id-to-name lookups for filters; empty when unavailable. */
  seasonNames: Record<string, string>;
  divisionNames: Record<string, string>;
}

type TicketSource = TicketSourceHealth["source"];

async function fetchRows<T>(
  source: TicketSource,
  health: TicketSourceHealth[],
  run: () => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>,
): Promise<T[]> {
  try {
    const { data, error } = await run();
    if (error) throw new Error(error.code ? `${error.code}: ${error.message}` : error.message);
    health.push({ source, ok: true });
    return data ?? [];
  } catch (err) {
    // Log the failure shape only; row values never reach the log.
    console.error(
      `[admin-tickets] failed to read source "${source}":`,
      err instanceof Error ? err.message : "unknown error",
    );
    health.push({ source, ok: false, reason: SOURCE_UNAVAILABLE });
    return [];
  }
}

async function fetchNameMap(
  client: SupabaseClient<Database>,
  table: "seasons" | "divisions",
): Promise<Record<string, string>> {
  try {
    const { data, error } = await client.from(table).select("id,name");
    if (error) throw new Error(error.message);
    return Object.fromEntries((data ?? []).map((row) => [row.id, row.name]));
  } catch (err) {
    console.error(
      `[admin-tickets] failed to read ${table} names:`,
      err instanceof Error ? err.message : "unknown error",
    );
    return {};
  }
}

export async function getAdminTicketQueueFromClient(
  client: SupabaseClient<Database> | null,
): Promise<AdminTicketQueueData> {
  if (!client) {
    return {
      tickets: [],
      sourceHealth: (
        ["operation", "stat_review", "registration", "match_report"] as const
      ).map((source) => ({ source, ok: false, reason: NOT_CONFIGURED })),
      seasonNames: {},
      divisionNames: {},
    };
  }

  const health: TicketSourceHealth[] = [];
  const [pendingActions, pendingStatRecords, registrations, matchReports, seasonNames, divisionNames] =
    await Promise.all([
      fetchRows<PendingActionSourceRow>("operation", health, () =>
        client
          .from("pending_actions")
          .select(PENDING_ACTION_COLUMNS)
          .order("created_at", { ascending: false })
          .limit(SOURCE_LIMIT),
      ),
      fetchRows<PendingStatRecordSourceRow>("stat_review", health, () =>
        client
          .from("pending_stat_records")
          .select(PENDING_STAT_RECORD_COLUMNS)
          .order("created_at", { ascending: false })
          .limit(SOURCE_LIMIT),
      ),
      fetchRows<RegistrationSourceRow>("registration", health, () =>
        client
          .from("registrations")
          .select(REGISTRATION_COLUMNS)
          .order("created_at", { ascending: false })
          .limit(SOURCE_LIMIT),
      ),
      fetchRows<MatchReportSourceRow>("match_report", health, () =>
        client
          .from("match_reports")
          .select(MATCH_REPORT_COLUMNS)
          .order("created_at", { ascending: false })
          .limit(SOURCE_LIMIT),
      ),
      fetchNameMap(client, "seasons"),
      fetchNameMap(client, "divisions"),
    ]);

  const sourceOrder: TicketSource[] = ["operation", "stat_review", "registration", "match_report"];
  health.sort((a, b) => sourceOrder.indexOf(a.source) - sourceOrder.indexOf(b.source));

  return {
    tickets: sortTickets(
      normalizeTicketSources({ pendingActions, pendingStatRecords, registrations, matchReports }),
    ),
    sourceHealth: health,
    seasonNames,
    divisionNames,
  };
}

export async function getAdminTicketQueue(): Promise<AdminTicketQueueData> {
  return getAdminTicketQueueFromClient(getSupabaseServerClient());
}
