import type { Database } from "@/types/database.types";
import type {
  AdminTicket,
  TicketCategory,
  TicketCounts,
  TicketFilters,
  TicketLink,
  TicketPriority,
  TicketStatus,
  TicketTimelineEvent,
} from "@/types/admin-ticket";
import { TERMINAL_TICKET_STATUSES } from "@/types/admin-ticket";

type Tables = Database["public"]["Tables"];

// Narrow row shapes: exactly the columns the queue reads. Identity columns
// (requester/reviewer Discord ids) are deliberately absent so they can never
// leak into serialized client props.
export type PendingActionSourceRow = Pick<
  Tables["pending_actions"]["Row"],
  | "id"
  | "type"
  | "status"
  | "created_at"
  | "updated_at"
  | "division_id"
  | "match_id"
  | "admin_note"
  | "source_discord_message_url"
  | "approved_at"
>;

export type PendingStatRecordSourceRow = Pick<
  Tables["pending_stat_records"]["Row"],
  | "id"
  | "status"
  | "created_at"
  | "updated_at"
  | "match_id"
  | "player_id"
  | "confidence"
  | "source"
  | "screenshot_url"
  | "correction_note"
  | "reviewed_at"
>;

export type RegistrationSourceRow = Pick<
  Tables["registrations"]["Row"],
  | "id"
  | "status"
  | "created_at"
  | "reviewed_at"
  | "reviewer_note"
  | "season_id"
  | "player_id"
  | "discord_username"
  | "discord_display_name"
  | "form_data"
>;

export type MatchReportSourceRow = Pick<
  Tables["match_reports"]["Row"],
  | "id"
  | "status"
  | "created_at"
  | "reviewed_at"
  | "match_id"
  | "season_id"
  | "division_id"
  | "home_score"
  | "away_score"
  | "total_games"
  | "screenshot_urls"
>;

// Raw statuses each source uses for finished work. The reader excludes these
// when fetching unresolved rows, so open work is never crowded out of the
// queue by newer terminal records; statuses not listed here (including
// unknown ones) are treated as unresolved and normalize to "open".
export const PENDING_ACTION_TERMINAL_STATUSES = [
  "approved",
  "applied",
  "denied",
  "rejected",
  "cancelled",
  "expired",
] as const;
export const PENDING_STAT_TERMINAL_STATUSES = [
  "approved",
  "corrected",
  "applied",
  "rejected",
  "denied",
  "discarded",
  "cancelled",
] as const;
export const REGISTRATION_TERMINAL_STATUSES = ["approved", "rejected"] as const;
export const MATCH_REPORT_TERMINAL_STATUSES = ["done"] as const;

export const PENDING_ACTION_COLUMNS =
  "id,type,status,created_at,updated_at,division_id,match_id,admin_note,source_discord_message_url,approved_at";
export const PENDING_STAT_RECORD_COLUMNS =
  "id,status,created_at,updated_at,match_id,player_id,confidence,source,screenshot_url,correction_note,reviewed_at";
export const REGISTRATION_COLUMNS =
  "id,status,created_at,reviewed_at,reviewer_note,season_id,player_id,discord_username,discord_display_name,form_data";
export const MATCH_REPORT_COLUMNS =
  "id,status,created_at,reviewed_at,match_id,season_id,division_id,home_score,away_score,total_games,screenshot_urls";

// ─── Small safe helpers ────────────────────────────────────────────────────────

const DISPLAY_PREFIX: Partial<Record<TicketCategory, string>> = {
  operation: "OP",
  stat_review: "SR",
  registration: "RG",
  match_report: "MR",
};

function displayIdFor(category: TicketCategory, sourceId: string): string {
  const compact = sourceId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase();
  return `${DISPLAY_PREFIX[category] ?? "TK"}-${compact || "UNKNOWN"}`;
}

function shortRef(id: string | null | undefined): string {
  if (!id) return "";
  return id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase();
}

/** Only http(s) URLs may become links; anything else is dropped. */
function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/** Narrow an unknown Json payload to its string entries only. */
function stringEntries(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") out[key] = entry;
  }
  return out;
}

function humanizeToken(value: string): string {
  const cleaned = value.replace(/[_-]+/g, " ").trim();
  if (!cleaned) return "Unknown";
  return cleaned
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function timeline(events: (TicketTimelineEvent | null)[]): TicketTimelineEvent[] {
  return events
    .filter((event): event is TicketTimelineEvent => event !== null)
    .sort((a, b) => a.at.localeCompare(b.at) || a.label.localeCompare(b.label));
}

// ─── Per-source status mapping ─────────────────────────────────────────────────

// Unknown source statuses map to "open" so unexpected records surface for a
// human instead of silently disappearing from the queue.
const PENDING_ACTION_STATUS: Record<string, TicketStatus> = {
  pending: "open",
  pending_info: "needs_info",
  approved: "resolved",
  applied: "resolved",
  denied: "denied",
  rejected: "denied",
  cancelled: "cancelled",
  expired: "cancelled",
};

const PENDING_STAT_STATUS: Record<string, TicketStatus> = {
  pending: "open",
  approved: "resolved",
  corrected: "resolved",
  applied: "resolved",
  rejected: "denied",
  denied: "denied",
  discarded: "cancelled",
  cancelled: "cancelled",
};

const REGISTRATION_STATUS: Record<string, TicketStatus> = {
  pending: "open",
  approved: "resolved",
  rejected: "denied",
};

const MATCH_REPORT_STATUS: Record<string, TicketStatus> = {
  pending: "open",
  extracting: "claimed",
  review: "open",
  done: "resolved",
};

function mapStatus(table: Record<string, TicketStatus>, raw: string): TicketStatus {
  return table[raw] ?? "open";
}

// ─── Normalizers ───────────────────────────────────────────────────────────────

export function normalizePendingAction(row: PendingActionSourceRow): AdminTicket {
  const status = mapStatus(PENDING_ACTION_STATUS, row.status);
  const typeLabel = humanizeToken(row.type);
  const matchRef = shortRef(row.match_id);
  const links: TicketLink[] = [];
  const sourceUrl = safeHttpUrl(row.source_discord_message_url);
  if (sourceUrl) links.push({ label: "Discord source message", href: sourceUrl, external: true });
  return {
    id: `operation:${row.id}`,
    displayId: displayIdFor("operation", row.id),
    sourceId: row.id,
    category: "operation",
    status,
    sourceStatus: row.status,
    // Match results block official standings, so they outrank other requests.
    priority: row.type === "match_result" ? "high" : "normal",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    divisionId: row.division_id ?? undefined,
    matchId: row.match_id ?? undefined,
    title: `${typeLabel} request`,
    summary: matchRef
      ? `Bot-submitted ${typeLabel.toLowerCase()} for match ${matchRef}, reviewed in Discord.`
      : `Bot-submitted ${typeLabel.toLowerCase()} request, reviewed in Discord.`,
    privacy: "identity_restricted",
    links,
    timeline: timeline([
      { at: row.created_at, label: "Requested via Discord" },
      row.approved_at ? { at: row.approved_at, label: "Approved" } : null,
      row.admin_note
        ? { at: row.updated_at, label: "Admin note", detail: row.admin_note }
        : null,
    ]),
    workflow: { kind: "discord", label: "Managed through the Discord review workflow" },
  };
}

export function normalizePendingStatRecord(row: PendingStatRecordSourceRow): AdminTicket {
  const status = mapStatus(PENDING_STAT_STATUS, row.status);
  const matchRef = shortRef(row.match_id);
  const confidencePct = Math.round(Math.max(0, Math.min(1, row.confidence)) * 100);
  const links: TicketLink[] = [];
  const screenshot = safeHttpUrl(row.screenshot_url);
  if (screenshot) links.push({ label: "Stat screenshot", href: screenshot, external: true });
  return {
    id: `stat_review:${row.id}`,
    displayId: displayIdFor("stat_review", row.id),
    sourceId: row.id,
    category: "stat_review",
    status,
    sourceStatus: row.status,
    // Low-confidence extractions need closer human review.
    priority: row.confidence < 0.5 ? "high" : "normal",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    matchId: row.match_id,
    title: matchRef ? `Stat review for match ${matchRef}` : "Stat review",
    summary: `Extracted stats (${humanizeToken(row.source).toLowerCase()} source, ${confidencePct}% confidence) awaiting Discord review.`,
    privacy: "identity_restricted",
    links,
    timeline: timeline([
      { at: row.created_at, label: "Stats extracted" },
      row.reviewed_at ? { at: row.reviewed_at, label: "Reviewed" } : null,
      row.correction_note
        ? { at: row.updated_at, label: "Correction note", detail: row.correction_note }
        : null,
    ]),
    workflow: { kind: "discord", label: "Managed through the Discord review workflow" },
  };
}

export function normalizeRegistration(row: RegistrationSourceRow): AdminTicket {
  const status = mapStatus(REGISTRATION_STATUS, row.status);
  const formData = stringEntries(row.form_data);
  const name =
    formData.name?.trim() || row.discord_display_name?.trim() || row.discord_username;
  const registrationIgn = formData.ign?.trim() || undefined;
  const roles = [
    formData.primary_role ?? formData.role_primary,
    formData.secondary_role ?? formData.role_secondary,
  ]
    .filter((role): role is string => Boolean(role?.trim()))
    .join(" / ");
  const links: TicketLink[] = [];
  const trackerUrl = safeHttpUrl(formData.tracker_url);
  if (trackerUrl) links.push({ label: "Tracker profile", href: trackerUrl, external: true });
  const updatedAt = row.reviewed_at ?? row.created_at;
  return {
    id: `registration:${row.id}`,
    displayId: displayIdFor("registration", row.id),
    sourceId: row.id,
    category: "registration",
    status,
    sourceStatus: row.status,
    priority: "normal",
    createdAt: row.created_at,
    updatedAt,
    seasonId: row.season_id ?? undefined,
    registrationIgn,
    title: `Registration: ${name}`,
    summary: roles
      ? `Player registration from @${row.discord_username} (${roles}).`
      : `Player registration from @${row.discord_username}.`,
    privacy: "public",
    links,
    timeline: timeline([
      { at: row.created_at, label: "Registration submitted" },
      row.reviewed_at ? { at: row.reviewed_at, label: "Reviewed" } : null,
      row.reviewer_note
        ? { at: updatedAt, label: "Reviewer note", detail: row.reviewer_note }
        : null,
    ]),
    workflow: { kind: "site", href: "/admin/registrations", label: "Handle in Registrations" },
  };
}

export function normalizeMatchReport(row: MatchReportSourceRow): AdminTicket {
  const status = mapStatus(MATCH_REPORT_STATUS, row.status);
  const matchRef = shortRef(row.match_id);
  const hasScore = row.home_score !== null && row.away_score !== null;
  const links: TicketLink[] = (Array.isArray(row.screenshot_urls) ? row.screenshot_urls : [])
    .map((url) => safeHttpUrl(url))
    .filter((url): url is string => url !== null)
    .slice(0, 5)
    .map((url, index) => ({ label: `Screenshot ${index + 1}`, href: url, external: true }));
  const updatedAt = row.reviewed_at ?? row.created_at;
  return {
    id: `match_report:${row.id}`,
    displayId: displayIdFor("match_report", row.id),
    sourceId: row.id,
    category: "match_report",
    status,
    sourceStatus: row.status,
    // A report sitting in "review" is waiting on an admin decision.
    priority: row.status === "review" ? "high" : "normal",
    createdAt: row.created_at,
    updatedAt,
    seasonId: row.season_id,
    divisionId: row.division_id,
    matchId: row.match_id,
    claimedBy: row.status === "extracting" ? "Automated extraction" : undefined,
    title: matchRef ? `Match report for match ${matchRef}` : "Match report",
    summary: hasScore
      ? `Reported score ${row.home_score} to ${row.away_score}${row.total_games ? ` over ${row.total_games} games` : ""}.`
      : "Match screenshots submitted, awaiting extraction and review.",
    privacy: "identity_restricted",
    links,
    timeline: timeline([
      { at: row.created_at, label: "Report submitted" },
      row.reviewed_at ? { at: row.reviewed_at, label: "Reviewed" } : null,
    ]),
    workflow: { kind: "site", href: "/admin/match-report", label: "Handle in Match Report" },
  };
}

export interface TicketSourceRows {
  pendingActions: PendingActionSourceRow[];
  pendingStatRecords: PendingStatRecordSourceRow[];
  registrations: RegistrationSourceRow[];
  matchReports: MatchReportSourceRow[];
}

export function normalizeTicketSources(rows: TicketSourceRows): AdminTicket[] {
  return [
    ...rows.pendingActions.map(normalizePendingAction),
    ...rows.pendingStatRecords.map(normalizePendingStatRecord),
    ...rows.registrations.map(normalizeRegistration),
    ...rows.matchReports.map(normalizeMatchReport),
  ];
}

// ─── Queue helpers ─────────────────────────────────────────────────────────────

export function isTerminalStatus(status: TicketStatus): boolean {
  return TERMINAL_TICKET_STATUSES.includes(status);
}

const PRIORITY_RANK: Record<TicketPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

/**
 * Queue order: unresolved before terminal. Within unresolved, urgent and
 * SLA-bound tickets first (earliest deadline leading), then by priority, then
 * oldest first. Terminal tickets sort newest activity first. Ties always break
 * on ticket id so the order is deterministic.
 */
export function compareTickets(a: AdminTicket, b: AdminTicket): number {
  const aTerminal = isTerminalStatus(a.status) ? 1 : 0;
  const bTerminal = isTerminalStatus(b.status) ? 1 : 0;
  if (aTerminal !== bTerminal) return aTerminal - bTerminal;

  if (aTerminal === 1) {
    return b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
  }

  const aEscalated = a.priority === "urgent" || a.slaDeadline ? 0 : 1;
  const bEscalated = b.priority === "urgent" || b.slaDeadline ? 0 : 1;
  if (aEscalated !== bEscalated) return aEscalated - bEscalated;

  if (aEscalated === 0) {
    const aDeadline = a.slaDeadline ?? "9999-12-31T23:59:59Z";
    const bDeadline = b.slaDeadline ?? "9999-12-31T23:59:59Z";
    const byDeadline = aDeadline.localeCompare(bDeadline);
    if (byDeadline !== 0) return byDeadline;
  }

  return (
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

export function sortTickets(tickets: AdminTicket[]): AdminTicket[] {
  return [...tickets].sort(compareTickets);
}

export function searchMatches(ticket: AdminTicket, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    ticket.id,
    ticket.displayId,
    ticket.title,
    ticket.summary,
    ticket.matchId ?? "",
  ]
    .join("\n")
    .toLowerCase();
  return haystack.includes(q);
}

export function applyTicketFilters(
  tickets: AdminTicket[],
  filters: TicketFilters,
): AdminTicket[] {
  return tickets.filter((ticket) => {
    if (filters.status === "unresolved") {
      if (isTerminalStatus(ticket.status)) return false;
    } else if (filters.status !== "all" && ticket.status !== filters.status) {
      return false;
    }
    if (filters.category !== "all" && ticket.category !== filters.category) return false;
    if (filters.priority !== "all" && ticket.priority !== filters.priority) return false;
    if (filters.seasonId !== "all" && ticket.seasonId !== filters.seasonId) return false;
    if (filters.divisionId !== "all" && ticket.divisionId !== filters.divisionId) return false;
    if (filters.assignment === "claimed" && !ticket.claimedBy) return false;
    if (filters.assignment === "unclaimed" && ticket.claimedBy) return false;
    return searchMatches(ticket, filters.search);
  });
}

export function getTicketCounts(tickets: AdminTicket[]): TicketCounts {
  let open = 0;
  let urgent = 0;
  let needsInfo = 0;
  let resolved = 0;
  for (const ticket of tickets) {
    if (ticket.status === "open" || ticket.status === "claimed") open += 1;
    if (ticket.status === "needs_info") needsInfo += 1;
    if (ticket.status === "resolved") resolved += 1;
    if (ticket.priority === "urgent" && !isTerminalStatus(ticket.status)) urgent += 1;
  }
  return { open, urgent, needsInfo, resolved };
}
