import type { Database } from "@/types/database.types";
import type {
  AdminTicket,
  TicketCategory,
  TicketCounts,
  TicketDetailField,
  TicketFilters,
  TicketLink,
  TicketPriority,
  TicketStatus,
  TicketTimelineEvent,
} from "@/types/admin-ticket";
import {
  CURRENT_TICKET_CATEGORIES,
  TERMINAL_TICKET_STATUSES,
} from "@/types/admin-ticket";

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
  | "payload_json"
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
  | "stats_json"
  | "extracted_json"
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

export type BugReportSourceRow = Pick<
  Tables["bug_reports"]["Row"],
  | "id"
  | "ticket_id"
  | "status"
  | "category"
  | "severity"
  | "subject"
  | "description"
  | "reproduction_steps"
  | "expected_behavior"
  | "environment"
  | "created_at"
  | "updated_at"
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
export const BUG_REPORT_TERMINAL_STATUSES = ["resolved", "no_response"] as const;

export const PENDING_ACTION_COLUMNS =
  "id,type,status,created_at,updated_at,division_id,match_id,payload_json,admin_note,source_discord_message_url,approved_at";
export const PENDING_STAT_RECORD_COLUMNS =
  "id,status,created_at,updated_at,match_id,player_id,stats_json,extracted_json,confidence,source,screenshot_url,correction_note,reviewed_at";
export const REGISTRATION_COLUMNS =
  "id,status,created_at,reviewed_at,reviewer_note,season_id,player_id,discord_username,discord_display_name,form_data";
export const MATCH_REPORT_COLUMNS =
  "id,status,created_at,reviewed_at,match_id,season_id,division_id,home_score,away_score,total_games,screenshot_urls";
export const BUG_REPORT_COLUMNS =
  "id,ticket_id,status,category,severity,subject,description,reproduction_steps,expected_behavior,environment,created_at,updated_at";

// ─── Small safe helpers ────────────────────────────────────────────────────────

const DISPLAY_PREFIX: Partial<Record<TicketCategory, string>> = {
  operation: "OP",
  stat_review: "SR",
  registration: "RG",
  match_report: "MR",
  bug_report: "BR",
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

function jsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function detailValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, 4000) : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("en-US");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return null;
}

function operationDetails(type: string, payloadValue: unknown): TicketDetailField[] {
  const payload = jsonObject(payloadValue);
  if (!payload) return [];
  const details: TicketDetailField[] = [];
  const add = (label: string, value: unknown) => {
    const text = detailValue(value);
    if (text) details.push({ label, value: text });
  };

  if (type === "match_result") {
    add("Winner organization ID", payload.winnerOrgId);
    add("Score", payload.score);
    const parsed = jsonObject(payload.parsed);
    if (parsed) {
      add("Games played", parsed.gamesPlayed);
      add("Expected screenshots", parsed.expectedScreenshots);
    }
  } else if (type === "reschedule") {
    add("New date", payload.newDate);
    add("New time", payload.newTime);
    add("Reason", payload.reason);
  } else if (type === "admin_review") {
    const issueType = detailValue(payload.issueType);
    if (issueType) details.push({ label: "Issue type", value: humanizeToken(issueType) });
    add("Description", payload.description);
    add("Related match ID", payload.relatedMatchId);
  } else if (type === "alias_change") {
    add("Target player ID", payload.targetPlayerId);
    add("Current IGN", payload.oldIgn);
    add("Requested IGN", payload.newIgn);
  }
  return details;
}

function statReviewDetails(row: PendingStatRecordSourceRow): TicketDetailField[] {
  const stats = jsonObject(row.stats_json) ?? jsonObject(row.extracted_json) ?? {};
  const value = (key: string) => detailValue(stats[key]) ?? "Not provided";
  const details: TicketDetailField[] = [
    { label: "Player ID", value: row.player_id ?? "Not linked" },
    { label: "Stat source", value: row.stats_json === null ? "Extracted" : "Corrected" },
    { label: "Game number", value: value("game_number") },
    {
      label: "K / D / A",
      value: `${value("kills")} / ${value("deaths")} / ${value("assists")}`,
    },
    { label: "Damage dealt", value: value("damage_dealt") },
    { label: "Damage mitigated", value: value("damage_mitigated") },
    { label: "Healing done", value: value("healing_done") },
  ];
  const god = detailValue(stats.god_played) ?? detailValue(stats.godPlayed);
  if (god) details.push({ label: "God", value: god });
  const role = detailValue(stats.role);
  if (role) details.push({ label: "Role", value: humanizeToken(role) });
  const orgId = detailValue(stats.org_id);
  if (orgId) details.push({ label: "Organization ID", value: orgId });
  return details;
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

const BUG_REPORT_STATUS: Record<string, TicketStatus> = {
  open: "open",
  acknowledged: "claimed",
  investigating: "claimed",
  waiting_on_reporter: "needs_info",
  resolved: "resolved",
  no_response: "cancelled",
};

function mapStatus(table: Record<string, TicketStatus>, raw: string): TicketStatus {
  return table[raw] ?? "open";
}

// ─── SLA policy ────────────────────────────────────────────────────────────────

/**
 * Response target in hours per category, measured from ticket creation. The
 * deadline is derived at read time (createdAt + target), so targets are
 * tunable here without schema work.
 *
 * Reasoning behind the defaults:
 * - operation / match_report: match results block official standings (and the
 *   schedules built on them), so they get the tightest 48h turnaround.
 * - stat_review: extracted stats feed published player records; the same 48h
 *   window keeps corrections landing while the match is still fresh.
 * - registration: gates one player's onboarding but blocks no live standings,
 *   so it gets a longer 72h window.
 * Future categories (ruling, scout_review) have no backend yet;
 * they get entries here when their normalizers land.
 */
export const SLA_TARGET_HOURS: Record<
  (typeof CURRENT_TICKET_CATEGORIES)[number],
  number
> = {
  operation: 48,
  stat_review: 48,
  registration: 72,
  match_report: 48,
  bug_report: 48,
};

const HOUR_MS = 3_600_000;

/**
 * Derive the SLA deadline for a normalized ticket. Terminal tickets carry no
 * active SLA — resolved work must never be retroactively flagged as overdue —
 * and unparseable creation times yield no deadline rather than a bogus one.
 */
function slaDeadlineFor(
  category: (typeof CURRENT_TICKET_CATEGORIES)[number],
  createdAt: string,
  status: TicketStatus,
): string | undefined {
  if (isTerminalStatus(status)) return undefined;
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return undefined;
  return new Date(created + SLA_TARGET_HOURS[category] * HOUR_MS).toISOString();
}

/**
 * A ticket is at risk once its remaining time drops inside this window
 * (25% of the tightest 48h target). One fixed window keeps the rule simple
 * and predictable across categories instead of scaling per target.
 */
export const SLA_AT_RISK_WINDOW_HOURS = 12;

export type SlaState = "ok" | "at_risk" | "overdue";

/**
 * Pure SLA classification of a deadline against `now`.
 * - null when there is no deadline (or it does not parse): nothing to show.
 * - "overdue" once the deadline is reached (remaining <= 0).
 * - "at_risk" when at most SLA_AT_RISK_WINDOW_HOURS remain.
 * - "ok" otherwise.
 */
export function classifySla(
  deadline: string | undefined,
  now: number | Date,
): SlaState | null {
  if (!deadline) return null;
  const deadlineMs = Date.parse(deadline);
  if (Number.isNaN(deadlineMs)) return null;
  const remaining = deadlineMs - (typeof now === "number" ? now : now.getTime());
  if (remaining <= 0) return "overdue";
  if (remaining <= SLA_AT_RISK_WINDOW_HOURS * HOUR_MS) return "at_risk";
  return "ok";
}

// ─── Normalizers ───────────────────────────────────────────────────────────────

export function normalizePendingAction(row: PendingActionSourceRow): AdminTicket {
  const status = mapStatus(PENDING_ACTION_STATUS, row.status);
  const typeLabel = humanizeToken(row.type);
  const matchRef = shortRef(row.match_id);
  const links: TicketLink[] = [];
  const sourceUrl = safeHttpUrl(row.source_discord_message_url);
  if (sourceUrl) links.push({ label: "Discord source message", href: sourceUrl, external: true });
  const payload = jsonObject(row.payload_json);
  const proofUrl = safeHttpUrl(payload?.proofScreenshotUrl);
  if (proofUrl) links.push({ label: "Alias proof screenshot", href: proofUrl, external: true });
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
    slaDeadline: slaDeadlineFor("operation", row.created_at, status),
    divisionId: row.division_id ?? undefined,
    matchId: row.match_id ?? undefined,
    operationType: row.type,
    title: `${typeLabel} request`,
    summary: matchRef
      ? `Bot-submitted ${typeLabel.toLowerCase()} for match ${matchRef}, reviewed in Discord.`
      : `Bot-submitted ${typeLabel.toLowerCase()} request, reviewed in Discord.`,
    details: operationDetails(row.type, row.payload_json),
    privacy: "identity_restricted",
    links,
    timeline: timeline([
      { at: row.created_at, label: "Requested via Discord" },
      row.approved_at ? { at: row.approved_at, label: "Approved" } : null,
      row.admin_note
        ? { at: row.updated_at, label: "Admin note", detail: row.admin_note }
        : null,
    ]),
    workflow: {
      kind: "discord",
      label: "Review here; Discord remains the durable receipt source",
    },
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
    slaDeadline: slaDeadlineFor("stat_review", row.created_at, status),
    matchId: row.match_id,
    statPlayerId: row.player_id ?? undefined,
    title: matchRef ? `Stat review for match ${matchRef}` : "Stat review",
    summary: `Extracted stats (${humanizeToken(row.source).toLowerCase()} source, ${confidencePct}% confidence) awaiting Discord review.`,
    details: statReviewDetails(row),
    privacy: "identity_restricted",
    links,
    timeline: timeline([
      { at: row.created_at, label: "Stats extracted" },
      row.reviewed_at ? { at: row.reviewed_at, label: "Reviewed" } : null,
      row.correction_note
        ? { at: row.updated_at, label: "Correction note", detail: row.correction_note }
        : null,
    ]),
    workflow: {
      kind: "discord",
      label: "Review here; Discord remains the durable receipt source",
    },
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
    slaDeadline: slaDeadlineFor("registration", row.created_at, status),
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
    slaDeadline: slaDeadlineFor("match_report", row.created_at, status),
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

export function normalizeBugReport(row: BugReportSourceRow): AdminTicket {
  const status = mapStatus(BUG_REPORT_STATUS, row.status);
  const priority: TicketPriority =
    row.severity === "critical"
      ? "urgent"
      : row.severity === "high"
        ? "high"
        : row.severity === "low"
          ? "low"
          : "normal";
  const summary = row.description.length > 180
    ? `${row.description.slice(0, 177)}...`
    : row.description;
  const details = [
    { label: "Category", value: humanizeToken(row.category) },
    { label: "Severity", value: humanizeToken(row.severity) },
    { label: "What happened", value: row.description },
    { label: "Steps to reproduce", value: row.reproduction_steps },
    { label: "Expected behavior", value: row.expected_behavior },
    ...(row.environment ? [{ label: "Environment", value: row.environment }] : []),
  ];

  return {
    id: `bug_report:${row.id}`,
    displayId: row.ticket_id || displayIdFor("bug_report", row.id),
    sourceId: row.id,
    category: "bug_report",
    status,
    sourceStatus: row.status,
    priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    slaDeadline: slaDeadlineFor("bug_report", row.created_at, status),
    title: row.subject,
    summary,
    details,
    privacy: "anonymous",
    links: [],
    timeline: timeline([
      { at: row.created_at, label: "Anonymous report submitted" },
      row.updated_at !== row.created_at
        ? { at: row.updated_at, label: `Status changed to ${humanizeToken(row.status)}` }
        : null,
    ]),
    workflow: { kind: "unsupported", label: "Managed in this admin queue" },
  };
}

export interface TicketSourceRows {
  pendingActions: PendingActionSourceRow[];
  pendingStatRecords: PendingStatRecordSourceRow[];
  registrations: RegistrationSourceRow[];
  matchReports: MatchReportSourceRow[];
  bugReports?: BugReportSourceRow[];
}

export function normalizeTicketSources(rows: TicketSourceRows): AdminTicket[] {
  return [
    ...rows.pendingActions.map(normalizePendingAction),
    ...rows.pendingStatRecords.map(normalizePendingStatRecord),
    ...rows.registrations.map(normalizeRegistration),
    ...rows.matchReports.map(normalizeMatchReport),
    ...(rows.bugReports ?? []).map(normalizeBugReport),
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
