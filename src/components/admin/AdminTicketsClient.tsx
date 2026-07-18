"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type {
  AdminTicket,
  TicketCategory,
  TicketFilters,
  TicketPriority,
  TicketSourceHealth,
  TicketStatus,
  TicketViewerCapabilities,
} from "@/types/admin-ticket";
import {
  CURRENT_TICKET_CATEGORIES,
  DEFAULT_TICKET_FILTERS,
  FUTURE_TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
} from "@/types/admin-ticket";
import { applyTicketFilters, getTicketCounts } from "@/lib/admin-ticket-model";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<TicketStatus, string> = {
  open: "border-amber-300/30 bg-amber-300/10 text-amber-200",
  needs_info: "border-sky-300/30 bg-sky-300/10 text-sky-200",
  claimed: "border-violet-300/30 bg-violet-300/10 text-violet-200",
  resolved: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200",
  denied: "border-red-300/25 bg-red-300/8 text-red-300",
  cancelled: "border-slate-300/20 bg-slate-300/8 text-slate-400",
};

const PRIORITY_STYLE: Record<TicketPriority, string> = {
  urgent: "border-red-300/40 bg-red-300/15 text-red-200",
  high: "border-orange-300/30 bg-orange-300/10 text-orange-200",
  normal: "border-white/10 bg-white/[0.04] text-slate-400",
  low: "border-white/10 bg-white/[0.02] text-slate-500",
};

const STATUS_FILTER_OPTIONS: { value: TicketFilters["status"]; label: string }[] = [
  { value: "unresolved", label: "Unresolved" },
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "needs_info", label: "Needs Info" },
  { value: "claimed", label: "Claimed" },
  { value: "resolved", label: "Resolved" },
  { value: "denied", label: "Denied" },
  { value: "cancelled", label: "Cancelled" },
];

const PRIORITY_FILTER_OPTIONS: { value: TicketFilters["priority"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
];

const ASSIGNMENT_FILTER_OPTIONS: { value: TicketFilters["assignment"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "claimed", label: "Claimed" },
  { value: "unclaimed", label: "Unclaimed" },
];

const SOURCE_LABELS: Record<TicketSourceHealth["source"], string> = {
  operation: "Operations",
  stat_review: "Stat Reviews",
  registration: "Registrations",
  match_report: "Match Reports",
};

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseFilters(params: URLSearchParams): TicketFilters {
  const statuses = STATUS_FILTER_OPTIONS.map((o) => o.value);
  const priorities = PRIORITY_FILTER_OPTIONS.map((o) => o.value);
  const assignments = ASSIGNMENT_FILTER_OPTIONS.map((o) => o.value);
  const categories: (TicketCategory | "all")[] = ["all", ...CURRENT_TICKET_CATEGORIES, ...FUTURE_TICKET_CATEGORIES];
  const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const value = params.get(key);
    return allowed.includes(value as T) ? (value as T) : fallback;
  };
  return {
    status: pick("status", statuses, DEFAULT_TICKET_FILTERS.status),
    category: pick("category", categories, DEFAULT_TICKET_FILTERS.category),
    priority: pick("priority", priorities, DEFAULT_TICKET_FILTERS.priority),
    seasonId: params.get("season") ?? DEFAULT_TICKET_FILTERS.seasonId,
    divisionId: params.get("division") ?? DEFAULT_TICKET_FILTERS.divisionId,
    assignment: pick("assignment", assignments, DEFAULT_TICKET_FILTERS.assignment),
    search: params.get("q") ?? "",
  };
}

function buildQueryString(filters: TicketFilters, selectedId: string | null): string {
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

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[0.6rem] font-black uppercase tracking-wider text-slate-500">{label}</span>
      {children}
    </label>
  );
}

const SELECT_CLASS =
  "rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs font-semibold text-white focus:border-cyan-500/40 focus:outline-none";

function TicketChips({ ticket }: { ticket: AdminTicket }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className={cn("rounded-xl border px-2 py-0.5 text-[0.6rem] font-black uppercase", STATUS_STYLE[ticket.status])}>
        {TICKET_STATUS_LABELS[ticket.status]}
      </span>
      {ticket.priority !== "normal" && (
        <span className={cn("rounded-xl border px-2 py-0.5 text-[0.6rem] font-black uppercase", PRIORITY_STYLE[ticket.priority])}>
          {TICKET_PRIORITY_LABELS[ticket.priority]}
        </span>
      )}
      {ticket.privacy === "anonymous" && (
        <span className="rounded-xl border border-white/15 bg-white/[0.05] px-2 py-0.5 text-[0.6rem] font-black uppercase text-slate-300">
          Anonymous
        </span>
      )}
    </span>
  );
}

function TicketDetail({
  ticket,
  seasonNames,
  divisionNames,
  capabilities,
}: {
  ticket: AdminTicket;
  seasonNames: Record<string, string>;
  divisionNames: Record<string, string>;
  capabilities: TicketViewerCapabilities;
}) {
  const facts: { label: string; value: string }[] = [
    { label: "Ticket", value: ticket.displayId },
    { label: "Type", value: TICKET_CATEGORY_LABELS[ticket.category] },
    { label: "Status", value: TICKET_STATUS_LABELS[ticket.status] },
    { label: "Source status", value: ticket.sourceStatus },
    { label: "Priority", value: TICKET_PRIORITY_LABELS[ticket.priority] },
    { label: "Opened", value: formatTimestamp(ticket.createdAt) },
    { label: "Updated", value: formatTimestamp(ticket.updatedAt) },
  ];
  if (ticket.slaDeadline) facts.push({ label: "SLA deadline", value: formatTimestamp(ticket.slaDeadline) });
  if (ticket.seasonId) facts.push({ label: "Season", value: seasonNames[ticket.seasonId] ?? ticket.seasonId });
  if (ticket.divisionId) facts.push({ label: "Division", value: divisionNames[ticket.divisionId] ?? ticket.divisionId });
  if (ticket.matchId) facts.push({ label: "Match", value: ticket.matchId });
  if (ticket.claimedBy) facts.push({ label: "Claimed by", value: ticket.claimedBy });
  if (ticket.privacy === "anonymous") facts.push({ label: "Reporter", value: "Anonymous" });

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/84 p-5 backdrop-blur">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <h2 className="min-w-0 text-base font-black text-white">{ticket.title}</h2>
        <TicketChips ticket={ticket} />
      </div>
      <p className="mb-4 text-xs text-slate-400">{ticket.summary}</p>

      <div className="mb-4 grid gap-1.5 rounded-xl border border-white/8 bg-white/[0.02] p-3 sm:grid-cols-2">
        {facts.map(({ label, value }) => (
          <div key={label} className="flex gap-2 text-xs">
            <span className="w-28 shrink-0 font-semibold uppercase text-slate-500">{label}</span>
            <span className="truncate text-slate-300" title={value}>
              {value}
            </span>
          </div>
        ))}
      </div>

      {ticket.links.length > 0 && (
        <div className="mb-4">
          <p className="mb-1.5 text-[0.6rem] font-black uppercase tracking-wider text-slate-500">Evidence and sources</p>
          <ul className="space-y-1">
            {ticket.links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-cyan-400 underline hover:text-cyan-200"
                >
                  {link.label} ↗
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ticket.timeline.length > 0 && (
        <div className="mb-4">
          <p className="mb-1.5 text-[0.6rem] font-black uppercase tracking-wider text-slate-500">Timeline</p>
          <ol className="space-y-1.5">
            {ticket.timeline.map((event, index) => (
              <li key={`${event.at}-${event.label}-${index}`} className="flex gap-2 text-xs">
                <span className="w-40 shrink-0 text-slate-500">{formatTimestamp(event.at)}</span>
                <span className="min-w-0 text-slate-300">
                  {event.label}
                  {event.detail && <span className="block text-slate-500">{event.detail}</span>}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/8 p-3">
        <p className="mb-1 text-[0.6rem] font-black uppercase tracking-wider text-cyan-300/70">Where this is handled</p>
        {ticket.workflow.kind === "site" ? (
          <Link
            href={ticket.workflow.href}
            className="inline-block rounded-lg border border-cyan-300/40 bg-cyan-300/15 px-3 py-1.5 text-xs font-black uppercase text-cyan-100 transition hover:bg-cyan-300/25"
          >
            {ticket.workflow.label}
          </Link>
        ) : (
          <p className="text-xs font-semibold text-slate-300">{ticket.workflow.label}</p>
        )}
        {!capabilities.canActOnTickets && (
          <p className="mt-2 text-[0.65rem] text-slate-500">
            This queue is read-only. Approvals and denials stay in the owning workflow.
          </p>
        )}
      </div>
    </div>
  );
}

export function AdminTicketsClient({
  tickets,
  sourceHealth,
  seasonNames,
  divisionNames,
  capabilities,
}: {
  tickets: AdminTicket[];
  sourceHealth: TicketSourceHealth[];
  seasonNames: Record<string, string>;
  divisionNames: Record<string, string>;
  capabilities: TicketViewerCapabilities;
}) {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<TicketFilters>(() => parseFilters(searchParams));
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("ticket"));

  // Mirror state into the URL so filters and the selected ticket deep-link,
  // without a server round-trip per keystroke.
  useEffect(() => {
    const query = buildQueryString(filters, selectedId);
    const url = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [filters, selectedId]);

  const counts = useMemo(() => getTicketCounts(tickets), [tickets]);
  const filtered = useMemo(() => applyTicketFilters(tickets, filters), [tickets, filters]);
  const selected = useMemo(
    () => (selectedId ? (tickets.find((t) => t.id === selectedId) ?? null) : null),
    [tickets, selectedId],
  );

  const seasonOptions = useMemo(() => {
    const ids = [...new Set(tickets.map((t) => t.seasonId).filter((id): id is string => Boolean(id)))];
    return ids
      .map((id) => ({ id, name: seasonNames[id] ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tickets, seasonNames]);

  const divisionOptions = useMemo(() => {
    const ids = [...new Set(tickets.map((t) => t.divisionId).filter((id): id is string => Boolean(id)))];
    return ids
      .map((id) => ({ id, name: divisionNames[id] ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tickets, divisionNames]);

  const failedSources = sourceHealth.filter((s) => !s.ok);

  const setFilter = <K extends keyof TicketFilters>(key: K, value: TicketFilters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  if (!capabilities.canViewQueue) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-950/84 py-16 text-center backdrop-blur">
        <p className="text-sm font-black uppercase text-slate-500">You do not have access to the ticket queue.</p>
      </div>
    );
  }

  return (
    <div>
      {failedSources.length > 0 && (
        <div role="alert" className="mb-4 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-2.5">
          <p className="text-xs font-semibold text-amber-300">
            Some ticket sources could not be read: {failedSources.map((s) => SOURCE_LABELS[s.source]).join(", ")}.{" "}
            {failedSources[0].reason}
          </p>
        </div>
      )}

      {/* Summary counts */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            { label: "Open", value: counts.open, accent: "text-amber-200" },
            { label: "Urgent", value: counts.urgent, accent: "text-red-300" },
            { label: "Needs Info", value: counts.needsInfo, accent: "text-sky-200" },
            { label: "Resolved", value: counts.resolved, accent: "text-emerald-200" },
          ] as const
        ).map(({ label, value, accent }) => (
          <div key={label} className="rounded-xl border border-white/10 bg-slate-950/84 px-4 py-3 backdrop-blur">
            <p className="text-[0.6rem] font-black uppercase tracking-wider text-slate-500">{label}</p>
            <p className={cn("text-xl font-black", accent)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-4 rounded-xl border border-white/10 bg-slate-950/84 p-3 backdrop-blur">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <FilterField label="Status">
            <select
              value={filters.status}
              onChange={(e) => setFilter("status", e.target.value as TicketFilters["status"])}
              className={SELECT_CLASS}
            >
              {STATUS_FILTER_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Type">
            <select
              value={filters.category}
              onChange={(e) => setFilter("category", e.target.value as TicketFilters["category"])}
              className={SELECT_CLASS}
            >
              <option value="all">All</option>
              {CURRENT_TICKET_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {TICKET_CATEGORY_LABELS[category]}
                </option>
              ))}
              {FUTURE_TICKET_CATEGORIES.map((category) => (
                <option key={category} value={category} disabled>
                  {TICKET_CATEGORY_LABELS[category]} (soon)
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Priority">
            <select
              value={filters.priority}
              onChange={(e) => setFilter("priority", e.target.value as TicketFilters["priority"])}
              className={SELECT_CLASS}
            >
              {PRIORITY_FILTER_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Season">
            <select
              value={filters.seasonId}
              onChange={(e) => setFilter("seasonId", e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="all">All</option>
              {seasonOptions.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Division">
            <select
              value={filters.divisionId}
              onChange={(e) => setFilter("divisionId", e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="all">All</option>
              {divisionOptions.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Assignment">
            <select
              value={filters.assignment}
              onChange={(e) => setFilter("assignment", e.target.value as TicketFilters["assignment"])}
              className={SELECT_CLASS}
            >
              {ASSIGNMENT_FILTER_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FilterField>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Search tickets</span>
            <input
              type="search"
              placeholder="Search by ticket id, title, match, or summary..."
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-semibold text-white placeholder:text-slate-600 focus:border-cyan-500/40 focus:outline-none"
            />
          </label>
          <span className="text-xs font-black uppercase text-slate-600">
            {filtered.length} ticket{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Queue and detail */}
      <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-4">
        <div className={cn(selected && "hidden lg:block")}>
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-slate-950/84 py-16 text-center backdrop-blur">
              <p className="text-sm font-black uppercase text-slate-500">
                {tickets.length === 0 ? "No tickets. All caught up." : "No tickets match your filters."}
              </p>
            </div>
          ) : (
            <ul className="space-y-2" aria-label="Ticket queue">
              {filtered.map((ticket) => (
                <li key={ticket.id}>
                  <button
                    onClick={() => setSelectedId(ticket.id)}
                    aria-current={selected?.id === ticket.id ? "true" : undefined}
                    className={cn(
                      "w-full rounded-2xl border p-4 text-left backdrop-blur transition",
                      selected?.id === ticket.id
                        ? "border-cyan-300/40 bg-cyan-300/10"
                        : "border-white/10 bg-slate-950/84 hover:border-white/20 hover:bg-white/[0.04]",
                    )}
                  >
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[0.65rem] font-bold text-slate-500">{ticket.displayId}</span>
                      <TicketChips ticket={ticket} />
                    </div>
                    <p className="truncate text-sm font-black text-white">{ticket.title}</p>
                    <p className="truncate text-xs text-slate-500">{ticket.summary}</p>
                    <p className="mt-1 text-[0.65rem] text-slate-600">
                      {TICKET_CATEGORY_LABELS[ticket.category]} · {formatTimestamp(ticket.createdAt)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={cn(!selected && "hidden lg:block")}>
          {selected ? (
            <>
              <button
                onClick={() => setSelectedId(null)}
                className="mb-3 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-black uppercase text-slate-300 transition hover:text-white lg:hidden"
              >
                ← Back to Queue
              </button>
              <TicketDetail
                ticket={selected}
                seasonNames={seasonNames}
                divisionNames={divisionNames}
                capabilities={capabilities}
              />
            </>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-slate-950/84 py-16 text-center backdrop-blur">
              <p className="text-sm font-black uppercase text-slate-500">Select a ticket to see its details.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
