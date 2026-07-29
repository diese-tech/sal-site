/**
 * URL state for the /admin/tickets queue: filter parsing, query-string
 * building, and deep-link ticket resolution (SITE-11).
 *
 * ## Deep-link contract
 *
 * The queue mirrors filters and the selected ticket into the URL, so external
 * surfaces (Discord embeds from lab-salbot in particular) can link straight to
 * a ticket:
 *
 *   /admin/tickets?ticket=<id>
 *
 * The stable link form is the ticket's internal id, `${category}:${sourceId}`
 * (e.g. `registration:4f9c...` — see AdminTicket.id in
 * src/types/admin-ticket.ts). It is unique by construction and is what the
 * queue itself writes back to the URL when a ticket is selected. Bots and
 * other emitters should use this form.
 *
 * The short human-facing displayId (e.g. `RG-4F9C1D2E`) is also accepted,
 * case-insensitively, as a convenience for hand-typed links. It is a truncated
 * form of the source id, so it is not guaranteed unique; it resolves to the
 * first match and the URL is then rewritten to the canonical internal id.
 *
 * An id that matches neither form resolves to `kind: "not_found"` so the page
 * can show an honest "not in the current queue" state instead of silently
 * deselecting. Unauthenticated hits are redirected through
 * `/admin/login?next=<path+query>` (src/proxy.ts, adminLoginPath) so the
 * ticket param survives the login round-trip.
 */
import type { AdminTicket, TicketFilters } from "@/types/admin-ticket";
import {
  CURRENT_TICKET_CATEGORIES,
  DEFAULT_TICKET_FILTERS,
  FUTURE_TICKET_CATEGORIES,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
} from "@/types/admin-ticket";

const STATUS_VALUES: readonly TicketFilters["status"][] = [
  "unresolved",
  "all",
  ...(Object.keys(TICKET_STATUS_LABELS) as (keyof typeof TICKET_STATUS_LABELS)[]),
];
const PRIORITY_VALUES: readonly TicketFilters["priority"][] = [
  "all",
  ...(Object.keys(TICKET_PRIORITY_LABELS) as (keyof typeof TICKET_PRIORITY_LABELS)[]),
];
const ASSIGNMENT_VALUES: readonly TicketFilters["assignment"][] = ["all", "claimed", "unclaimed"];
const CATEGORY_VALUES: readonly TicketFilters["category"][] = [
  "all",
  ...CURRENT_TICKET_CATEGORIES,
  ...FUTURE_TICKET_CATEGORIES,
];

/** Read queue filters from the URL; unknown values fall back to defaults. */
export function parseFilters(params: URLSearchParams): TicketFilters {
  const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const value = params.get(key);
    return allowed.includes(value as T) ? (value as T) : fallback;
  };
  return {
    status: pick("status", STATUS_VALUES, DEFAULT_TICKET_FILTERS.status),
    category: pick("category", CATEGORY_VALUES, DEFAULT_TICKET_FILTERS.category),
    priority: pick("priority", PRIORITY_VALUES, DEFAULT_TICKET_FILTERS.priority),
    seasonId: params.get("season") ?? DEFAULT_TICKET_FILTERS.seasonId,
    divisionId: params.get("division") ?? DEFAULT_TICKET_FILTERS.divisionId,
    assignment: pick("assignment", ASSIGNMENT_VALUES, DEFAULT_TICKET_FILTERS.assignment),
    search: params.get("q") ?? "",
  };
}

/** Serialize queue state back into the URL; defaults are omitted. */
export function buildQueryString(filters: TicketFilters, selectedId: string | null): string {
  const params = new URLSearchParams();
  if (filters.status !== DEFAULT_TICKET_FILTERS.status) params.set("status", filters.status);
  if (filters.category !== "all") params.set("category", filters.category);
  if (filters.priority !== "all") params.set("priority", filters.priority);
  if (filters.seasonId !== "all") params.set("season", filters.seasonId);
  if (filters.divisionId !== "all") params.set("division", filters.divisionId);
  if (filters.assignment !== "all") params.set("assignment", filters.assignment);
  if (filters.search.trim()) params.set("q", filters.search);
  if (selectedId) params.set("ticket", selectedId);
  return params.toString();
}

export type TicketSelection =
  | { kind: "none"; ticket: null; requestedId: null }
  | { kind: "found"; ticket: AdminTicket; requestedId: string }
  | { kind: "not_found"; ticket: null; requestedId: string };

/**
 * Resolve a `?ticket=` value against the loaded queue. Canonical internal ids
 * match first; displayIds match case-insensitively as a fallback. A requested
 * id that matches nothing is reported as not_found (never silently dropped)
 * so the UI can tell the admin the link is stale.
 */
export function resolveTicketSelection(
  tickets: AdminTicket[],
  requestedId: string | null,
): TicketSelection {
  if (!requestedId) return { kind: "none", ticket: null, requestedId: null };
  const byId = tickets.find((ticket) => ticket.id === requestedId);
  if (byId) return { kind: "found", ticket: byId, requestedId };
  const lower = requestedId.toLowerCase();
  const byDisplayId = tickets.find((ticket) => ticket.displayId.toLowerCase() === lower);
  if (byDisplayId) return { kind: "found", ticket: byDisplayId, requestedId };
  return { kind: "not_found", ticket: null, requestedId };
}
