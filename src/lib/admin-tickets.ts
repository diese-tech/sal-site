import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { AdminTicket, TicketSourceHealth } from "@/types/admin-ticket";
import {
  MATCH_REPORT_COLUMNS,
  MATCH_REPORT_TERMINAL_STATUSES,
  PENDING_ACTION_COLUMNS,
  PENDING_ACTION_TERMINAL_STATUSES,
  PENDING_STAT_RECORD_COLUMNS,
  PENDING_STAT_TERMINAL_STATUSES,
  REGISTRATION_COLUMNS,
  REGISTRATION_TERMINAL_STATUSES,
  normalizeTicketSources,
  sortTickets,
  type MatchReportSourceRow,
  type PendingActionSourceRow,
  type PendingStatRecordSourceRow,
  type RegistrationSourceRow,
} from "@/lib/admin-ticket-model";

// Server-only: reads with the service-role client and must never be imported
// from client components. Raw rows stay here; only normalized tickets leave.

// Unresolved rows are fetched separately from terminal history so open work
// is never crowded out of the queue by newer resolved records. Oldest
// unresolved rows are kept first: if a backlog somehow exceeds the cap, the
// stalest work stays visible.
const UNRESOLVED_LIMIT = 200;
const HISTORY_LIMIT = 50;
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

type SourceResult<T> = PromiseLike<{
  data: T[] | null;
  error: { message: string; code?: string } | null;
}>;

async function runQuery<T>(query: SourceResult<T>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.code ? `${error.code}: ${error.message}` : error.message);
  return data ?? [];
}

async function fetchRows<T>(
  source: TicketSource,
  health: TicketSourceHealth[],
  run: () => [unresolved: SourceResult<T>, history: SourceResult<T>],
): Promise<T[]> {
  try {
    const [unresolved, history] = run();
    const rows = (await Promise.all([runQuery(unresolved), runQuery(history)])).flat();
    health.push({ source, ok: true });
    return rows;
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
  const notIn = (statuses: readonly string[]) => `(${statuses.join(",")})`;
  const [pendingActions, pendingStatRecords, registrations, matchReports, seasonNames, divisionNames] =
    await Promise.all([
      fetchRows<PendingActionSourceRow>("operation", health, () => [
        client
          .from("pending_actions")
          .select(PENDING_ACTION_COLUMNS)
          .not("status", "in", notIn(PENDING_ACTION_TERMINAL_STATUSES))
          .order("created_at", { ascending: true })
          .limit(UNRESOLVED_LIMIT),
        client
          .from("pending_actions")
          .select(PENDING_ACTION_COLUMNS)
          .in("status", [...PENDING_ACTION_TERMINAL_STATUSES])
          .order("created_at", { ascending: false })
          .limit(HISTORY_LIMIT),
      ]),
      fetchRows<PendingStatRecordSourceRow>("stat_review", health, () => [
        client
          .from("pending_stat_records")
          .select(PENDING_STAT_RECORD_COLUMNS)
          .not("status", "in", notIn(PENDING_STAT_TERMINAL_STATUSES))
          .order("created_at", { ascending: true })
          .limit(UNRESOLVED_LIMIT),
        client
          .from("pending_stat_records")
          .select(PENDING_STAT_RECORD_COLUMNS)
          .in("status", [...PENDING_STAT_TERMINAL_STATUSES])
          .order("created_at", { ascending: false })
          .limit(HISTORY_LIMIT),
      ]),
      fetchRows<RegistrationSourceRow>("registration", health, () => [
        client
          .from("registrations")
          .select(REGISTRATION_COLUMNS)
          .not("status", "in", notIn(REGISTRATION_TERMINAL_STATUSES))
          .order("created_at", { ascending: true })
          .limit(UNRESOLVED_LIMIT),
        client
          .from("registrations")
          .select(REGISTRATION_COLUMNS)
          .in("status", [...REGISTRATION_TERMINAL_STATUSES])
          .order("created_at", { ascending: false })
          .limit(HISTORY_LIMIT),
      ]),
      fetchRows<MatchReportSourceRow>("match_report", health, () => [
        client
          .from("match_reports")
          .select(MATCH_REPORT_COLUMNS)
          .not("status", "in", notIn(MATCH_REPORT_TERMINAL_STATUSES))
          .order("created_at", { ascending: true })
          .limit(UNRESOLVED_LIMIT),
        client
          .from("match_reports")
          .select(MATCH_REPORT_COLUMNS)
          .in("status", [...MATCH_REPORT_TERMINAL_STATUSES])
          .order("created_at", { ascending: false })
          .limit(HISTORY_LIMIT),
      ]),
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
