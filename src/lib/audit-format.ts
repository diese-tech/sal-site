import type { AuditLogEntry } from "@/lib/league-data";

export interface FormattedAuditEntry {
  /** Short category chip, e.g. "Roster" */
  category: string;
  /** Human sentence, e.g. `Player "AzraelP-HRX" saved` */
  text: string;
  /** Admin page this activity relates to */
  href: string;
  /** Tailwind tone for the indicator dot */
  tone: "emerald" | "cyan" | "violet" | "amber" | "red" | "slate";
  /** e.g. "2m ago" */
  relativeTime: string;
  /** Full timestamp for tooltips */
  absoluteTime: string;
}

const ENTITY_HREF: Record<string, string> = {
  player: "/admin/players",
  org: "/admin/teams",
  match: "/admin/matches",
  season: "/admin/seasons",
  announcement: "/admin/announcements",
  registration: "/admin/registrations",
  draft_room: "/admin/draft",
  draft_pick: "/admin/draft",
  standings: "/admin/standings",
  match_report: "/admin/match-report",
  player_import: "/admin/import",
};

function get(payload: unknown, key: string): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const value = (payload as Record<string, unknown>)[key];
  if (typeof value === "string" && value) return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

function shortId(id: string | null): string {
  if (!id) return "";
  return id.length > 14 ? `${id.slice(0, 8)}…` : id;
}

/** Best human-readable name for the entity, from the audit payload. */
function subject(entry: AuditLogEntry): string {
  const p = entry.payload;
  return (
    get(p, "ign") ??
    get(p, "name") ??
    get(p, "title") ??
    get(p, "tag") ??
    shortId(entry.entityId)
  );
}

type Rule = { category: string; tone: FormattedAuditEntry["tone"]; text: (e: AuditLogEntry) => string };

const RULES: Record<string, Rule> = {
  save_player: { category: "Roster", tone: "emerald", text: (e) => `Player "${subject(e)}" saved` },
  save_org: { category: "Teams", tone: "emerald", text: (e) => `Team "${subject(e)}" saved` },
  save_match: { category: "Schedule", tone: "emerald", text: (e) => `Match ${shortId(e.entityId)} saved` },
  save_season: { category: "Seasons", tone: "emerald", text: (e) => `Season "${subject(e)}" saved (${get(e.payload, "status") ?? "updated"})` },
  save_announcement: { category: "Announcements", tone: "emerald", text: (e) => `Announcement "${subject(e)}" published` },
  delete_announcement: { category: "Announcements", tone: "red", text: (e) => `Announcement ${shortId(e.entityId)} deleted` },
  advance_week: { category: "Seasons", tone: "cyan", text: (e) => `Season advanced to week ${get(e.payload, "week") ?? "?"}` },
  approve_registration: { category: "Registrations", tone: "cyan", text: () => "Registration approved — player record created" },
  update_registration: { category: "Registrations", tone: "cyan", text: (e) => `Registration ${get(e.payload, "status") ?? "updated"}` },
  claim_player_profile: { category: "Players", tone: "cyan", text: () => "Player profile linked to a Discord account" },
  players_imported: { category: "Import", tone: "emerald", text: (e) => `${get(e.payload, "imported") ?? "?"} players imported` },
  save_players_bulk: { category: "Import", tone: "emerald", text: (e) => `${get(e.payload, "count") ?? "?"} players written in bulk` },
  recalculate_standings: { category: "Standings", tone: "cyan", text: (e) => `Standings recalculated (${get(e.payload, "orgCount") ?? "?"} teams)` },
  match_report_submitted: {
    category: "Match Report",
    tone: "emerald",
    text: (e) => {
      const home = get(e.payload, "homeOrg");
      const away = get(e.payload, "awayOrg");
      const score = `${get(e.payload, "homeScore") ?? "?"}–${get(e.payload, "awayScore") ?? "?"}`;
      return home && away ? `Result submitted: ${home} ${score} ${away}` : `Match result submitted (${score})`;
    },
  },
  draft_room_created: { category: "Draft", tone: "violet", text: (e) => `Draft room created (${get(e.payload, "divisionId") ?? "division"})` },
  draft_started: { category: "Draft", tone: "violet", text: () => "Draft started" },
  draft_paused: { category: "Draft", tone: "amber", text: () => "Draft paused" },
  draft_resumed: { category: "Draft", tone: "violet", text: () => "Draft resumed" },
  draft_pick: { category: "Draft", tone: "violet", text: (e) => `Pick #${get(e.payload, "pickNumber") ?? "?"} made` },
  draft_auto_pick: { category: "Draft", tone: "violet", text: (e) => `Pick #${get(e.payload, "pickNumber") ?? "?"} auto-picked from shortlist` },
  draft_auto_skip: { category: "Draft", tone: "amber", text: () => "Pick timed out and was skipped" },
  draft_pick_skipped: { category: "Draft", tone: "amber", text: () => "Pick skipped by admin" },
  draft_pick_undone: { category: "Draft", tone: "amber", text: (e) => `Pick #${get(e.payload, "undonePickNumber") ?? "?"} undone` },
  draft_finalized: { category: "Draft", tone: "emerald", text: (e) => `Draft finalized — ${get(e.payload, "assigned") ?? "?"} players assigned to teams` },
  draft_tokens_generated: { category: "Draft", tone: "violet", text: () => "Captain links generated" },
  archive: { category: "System", tone: "amber", text: (e) => `${e.entityType ?? "Record"} ${shortId(e.entityId)} archived` },
  unarchive: { category: "System", tone: "cyan", text: (e) => `${e.entityType ?? "Record"} ${shortId(e.entityId)} restored` },
  schedule_delete: { category: "System", tone: "red", text: (e) => `${e.entityType ?? "Record"} ${shortId(e.entityId)} scheduled for deletion` },
  cancel_schedule_delete: { category: "System", tone: "cyan", text: (e) => `Deletion of ${e.entityType ?? "record"} ${shortId(e.entityId)} cancelled` },
  hard_delete: { category: "System", tone: "red", text: (e) => `${e.entityType ?? "Record"} ${shortId(e.entityId)} permanently deleted` },
};

export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.floor((now.getTime() - then) / 1000));
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 7 * 86_400) return `${Math.floor(diffSec / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatAuditEntry(entry: AuditLogEntry, now: Date = new Date()): FormattedAuditEntry {
  const rule = RULES[entry.action];
  const fallbackText = `${entry.action.replace(/_/g, " ")}${entry.entityId ? ` — ${shortId(entry.entityId)}` : ""}`;
  return {
    category: rule?.category ?? "System",
    text: rule ? rule.text(entry) : fallbackText.charAt(0).toUpperCase() + fallbackText.slice(1),
    href: ENTITY_HREF[entry.entityType ?? ""] ?? "/admin/audit",
    tone: rule?.tone ?? "slate",
    relativeTime: relativeTime(entry.createdAt, now),
    absoluteTime: new Date(entry.createdAt).toLocaleString(),
  };
}
