import type { AdminTicket, TicketViewerCapabilities } from "@/types/admin-ticket";

export interface MatchReportResolutionPlayer {
  playerIgn: string;
  playerId?: string;
  side: "home" | "away";
  won: boolean;
  kills: number;
  deaths: number;
  assists: number;
  godPlayed?: string;
  role?: string;
  damageDealt?: number;
  damageMitigated?: number;
}

export interface MatchReportResolutionGame {
  gameNumber: number;
  winningSide: "home" | "away";
  players: MatchReportResolutionPlayer[];
}

export type TicketAction =
  | { kind: "approve_registration"; reviewerNote?: string }
  | { kind: "reject_registration"; reviewerNote?: string }
  | { kind: "resolve_match_report"; games: MatchReportResolutionGame[] };

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface RunTicketActionOptions {
  ticket: AdminTicket;
  action: TicketAction;
  fetcher: Fetcher;
  now?: () => string;
  onOptimistic: (ticket: AdminTicket) => void;
  onRollback: (ticket: AdminTicket) => void;
  onSuccess: (ticket: AdminTicket) => void;
}

export type TicketActionResult = { ok: true } | { ok: false; error: string };

export type TicketActionMode = "registration" | "match_report" | "read_only";

export function getTicketActionMode(
  ticket: AdminTicket,
  capabilities: TicketViewerCapabilities,
): TicketActionMode {
  if (!capabilities.canActOnTickets || ticket.status !== "open") return "read_only";
  if (ticket.category === "registration") return "registration";
  if (ticket.category === "match_report") return "match_report";
  return "read_only";
}

export async function runTicketAction({
  ticket,
  action,
  fetcher,
  now = () => new Date().toISOString(),
  onOptimistic,
  onRollback,
  onSuccess,
}: RunTicketActionOptions): Promise<TicketActionResult> {
  const updatedAt = now();
  const optimistic = optimisticTicket(ticket, action, updatedAt);
  onOptimistic(optimistic);

  const request = actionRequest(ticket, action);
  try {
    const response = await fetcher(request.url, request.init);
    if (!response.ok) {
      onRollback(ticket);
      return { ok: false, error: "The action failed. The ticket was restored." };
    }
  } catch {
    onRollback(ticket);
    return { ok: false, error: "The action could not reach the server. The ticket was restored." };
  }

  onSuccess(optimistic);
  return { ok: true };
}

function actionRequest(ticket: AdminTicket, action: TicketAction): { url: string; init: RequestInit } {
  if (action.kind === "resolve_match_report") {
    return {
      url: `/api/admin/match-reports/${encodeURIComponent(ticket.sourceId)}/submit`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ games: action.games }),
      },
    };
  }

  const status = action.kind === "approve_registration" ? "approved" : "rejected";
  return {
    url: `/api/admin/registrations/${encodeURIComponent(ticket.sourceId)}`,
    init: {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reviewerNote: action.reviewerNote }),
    },
  };
}

function optimisticTicket(ticket: AdminTicket, action: TicketAction, updatedAt: string): AdminTicket {
  const denied = action.kind === "reject_registration";
  const sourceStatus = action.kind === "resolve_match_report" ? "done" : denied ? "rejected" : "approved";
  const label = action.kind === "resolve_match_report" ? "Match report resolved" : denied ? "Registration rejected" : "Registration approved";
  const note = action.kind === "resolve_match_report" ? undefined : action.reviewerNote?.trim() || undefined;

  return {
    ...ticket,
    status: denied ? "denied" : "resolved",
    sourceStatus,
    updatedAt,
    timeline: [
      ...ticket.timeline,
      {
        at: updatedAt,
        label,
        ...(note ? { detail: note } : {}),
      },
    ],
  };
}
