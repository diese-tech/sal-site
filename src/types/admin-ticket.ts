/**
 * Normalized read model for the /admin/tickets operations queue.
 *
 * Current categories map onto existing tables; future categories are typed
 * now so later backend PRs can plug in without reshaping the view:
 *   operation     -> pending_actions        (bot-owned Discord review workflow)
 *   stat_review   -> pending_stat_records   (bot-owned Discord review workflow)
 *   registration  -> registrations          (handled at /admin/registrations)
 *   match_report  -> match_reports          (handled at /admin/match-report)
 *   bug_report, ruling, scout_review -> reserved, no backend yet
 */
export type TicketCategory =
  | "operation"
  | "stat_review"
  | "registration"
  | "match_report"
  | "bug_report"
  | "ruling"
  | "scout_review";

export const CURRENT_TICKET_CATEGORIES = [
  "operation",
  "stat_review",
  "registration",
  "match_report",
] as const satisfies readonly TicketCategory[];

export const FUTURE_TICKET_CATEGORIES = [
  "bug_report",
  "ruling",
  "scout_review",
] as const satisfies readonly TicketCategory[];

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  operation: "Operation",
  stat_review: "Stat Review",
  registration: "Registration",
  match_report: "Match Report",
  bug_report: "Bug Report",
  ruling: "Ruling",
  scout_review: "Scout Review",
};

export type TicketStatus =
  | "open"
  | "needs_info"
  | "claimed"
  | "resolved"
  | "denied"
  | "cancelled";

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  needs_info: "Needs Info",
  claimed: "Claimed",
  resolved: "Resolved",
  denied: "Denied",
  cancelled: "Cancelled",
};

/** Statuses that no longer need admin attention. */
export const TERMINAL_TICKET_STATUSES: readonly TicketStatus[] = [
  "resolved",
  "denied",
  "cancelled",
];

export type TicketPriority = "urgent" | "high" | "normal" | "low";

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
};

/**
 * public: the identity shown is the content under review (e.g. a registrant).
 * identity_restricted: an identity exists on the source record but is not
 *   exposed to this view; it stays in the owning workflow.
 * anonymous: the reporter chose anonymity (future categories). Admins cannot
 *   reveal the user.
 */
export type TicketPrivacy = "public" | "identity_restricted" | "anonymous";

export interface TicketTimelineEvent {
  at: string;
  label: string;
  detail?: string;
}

export interface TicketLink {
  label: string;
  href: string;
  external: boolean;
}

/** Where this ticket is actually acted on. This queue stays read-only. */
export type TicketWorkflow =
  | { kind: "site"; href: string; label: string }
  | { kind: "discord"; label: string }
  | { kind: "unsupported"; label: string };

export interface AdminTicket {
  /** Stable unique id: `${category}:${sourceId}`. */
  id: string;
  /** Short human-facing id, e.g. RG-1A2B3C4D. Searchable. */
  displayId: string;
  /** Primary key of the source row. */
  sourceId: string;
  category: TicketCategory;
  status: TicketStatus;
  /** Raw source status string, shown so admins can trace the mapping. */
  sourceStatus: string;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
  /**
   * Derived at read time from createdAt plus the per-category target in
   * SLA_TARGET_HOURS (src/lib/admin-ticket-model.ts). Absent on terminal
   * tickets: resolved work carries no active SLA.
   */
  slaDeadline?: string;
  seasonId?: string;
  divisionId?: string;
  matchId?: string;
  /** Public registration value that approval uses to create or link a player. */
  registrationIgn?: string;
  /** Public-safe claimant label; never a hidden identity. */
  claimedBy?: string;
  /** Public-safe. Must not contain hidden reporter or requester identities. */
  title: string;
  /** Public-safe. Must not contain hidden reporter or requester identities. */
  summary: string;
  privacy: TicketPrivacy;
  links: TicketLink[];
  timeline: TicketTimelineEvent[];
  workflow: TicketWorkflow;
}

/**
 * What the current viewer may do in the ticket queue. The current auth model
 * only has super_admin and admin; the later RBAC PR supplies richer
 * capabilities here without rewriting the page.
 */
export interface TicketViewerCapabilities {
  canViewQueue: boolean;
  /** Whether the viewer may use safe ticket actions backed by admin endpoints. */
  canActOnTickets: boolean;
  /** Whether restricted identities may be revealed. Always false for now. */
  canViewRestrictedIdentities: boolean;
}

/**
 * Staged per-role mapping (SITE-05). The planned Owner/Moderator/Division-
 * Commissioner roles are blocked on the sal-database RBAC release; until then
 * the auth model only issues super_admin and admin, and new roles slot in here
 * additively without reshaping TicketViewerCapabilities.
 *
 * Capabilities are a UX hint; the action endpoints are the source of truth.
 * Both Wave 1 action endpoints (/api/admin/registrations/[id] and
 * /api/admin/match-reports/[id]/submit) accept any valid admin session, so
 * both current roles get canActOnTickets. Accepts `string` so a stale or
 * unrecognized role value degrades to deny-by-default instead of failing.
 */
export function capabilitiesForAdminRole(
  role: string | null | undefined,
): TicketViewerCapabilities {
  switch (role) {
    case "super_admin":
    case "admin":
      return {
        canViewQueue: true,
        canActOnTickets: true,
        // Restricted identities stay off for every role until an audited
        // reveal path exists; they remain in the owning workflows.
        canViewRestrictedIdentities: false,
      };
    default:
      // Deny by default: an unknown or absent role gets nothing.
      return {
        canViewQueue: false,
        canActOnTickets: false,
        canViewRestrictedIdentities: false,
      };
  }
}

/** Health of one upstream source read; failures must not sink the queue. */
export interface TicketSourceHealth {
  source: (typeof CURRENT_TICKET_CATEGORIES)[number];
  ok: boolean;
  /** Public-safe reason shown to admins when ok is false. */
  reason?: string;
}

export interface TicketFilters {
  status: TicketStatus | "all" | "unresolved";
  category: TicketCategory | "all";
  priority: TicketPriority | "all";
  seasonId: string | "all";
  divisionId: string | "all";
  assignment: "all" | "claimed" | "unclaimed";
  search: string;
}

export const DEFAULT_TICKET_FILTERS: TicketFilters = {
  status: "unresolved",
  category: "all",
  priority: "all",
  seasonId: "all",
  divisionId: "all",
  assignment: "all",
  search: "",
};

export interface TicketCounts {
  /** Open work: status open or claimed. */
  open: number;
  /** Unresolved tickets flagged urgent. */
  urgent: number;
  needsInfo: number;
  resolved: number;
}
