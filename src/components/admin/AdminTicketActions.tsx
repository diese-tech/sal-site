"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getTicketActionMode,
  runTicketAction,
  type TicketAction,
  type TicketActionMode,
} from "@/lib/admin-ticket-actions";
import {
  parseMatchReportActionContext,
  type MatchReportActionContext,
} from "@/lib/admin-ticket-match-report";
import type { AdminTicket, TicketViewerCapabilities } from "@/types/admin-ticket";

interface AdminTicketActionsProps {
  ticket: AdminTicket;
  capabilities: TicketViewerCapabilities;
  actionMode?: TicketActionMode;
  onTicketChange: (ticket: AdminTicket) => void;
  onActionSuccess: () => void;
}

export function AdminTicketActions({
  ticket,
  capabilities,
  actionMode,
  onTicketChange,
  onActionSuccess,
}: AdminTicketActionsProps) {
  const mode = actionMode ?? getTicketActionMode(ticket, capabilities);

  if (mode === "registration") {
    return (
      <RegistrationActions
        ticket={ticket}
        onTicketChange={onTicketChange}
        onActionSuccess={onActionSuccess}
      />
    );
  }

  if (mode === "match_report") {
    return (
      <MatchReportActions
        ticket={ticket}
        onTicketChange={onTicketChange}
        onActionSuccess={onActionSuccess}
      />
    );
  }

  return (
    <p className="mt-2 text-[0.65rem] text-slate-500">
      {capabilities.canActOnTickets
        ? "This ticket has no safe queue action available. Use the owning workflow."
        : "This queue is read-only for your account. Use the owning workflow."}
    </p>
  );
}

function RegistrationActions({
  ticket,
  onTicketChange,
  onActionSuccess,
}: Omit<AdminTicketActionsProps, "capabilities">) {
  const [reviewerNote, setReviewerNote] = useState("");
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitDecision() {
    if (!decision || busy) return;
    setBusy(true);
    setError(null);
    const action: TicketAction = {
      kind: decision === "approve" ? "approve_registration" : "reject_registration",
      ...(reviewerNote.trim() ? { reviewerNote: reviewerNote.trim() } : {}),
    };
    const result = await runTicketAction({
      ticket,
      action,
      fetcher: fetch,
      onOptimistic: onTicketChange,
      onRollback: onTicketChange,
      onSuccess: onTicketChange,
    });
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      return;
    }
    setCompleted(true);
    setDecision(null);
    onActionSuccess();
  }

  if (completed) {
    return <p className="mt-3 text-xs font-semibold text-emerald-300">Registration updated. Refreshing ticket...</p>;
  }

  return (
    <div className="mt-3 border-t border-white/8 pt-3">
      {ticket.registrationIgn ? (
        <div className="mb-3 rounded-lg border border-cyan-300/20 bg-cyan-300/8 px-3 py-2">
          <p className="text-[0.6rem] font-black uppercase tracking-wider text-cyan-300/70">
            Submitted IGN
          </p>
          <p className="font-mono text-sm font-black text-white">{ticket.registrationIgn}</p>
          <p className="mt-1 text-[0.65rem] text-slate-400">
            Approval creates or links the player profile using this exact in-game name.
          </p>
        </div>
      ) : (
        <p className="mb-3 text-xs font-semibold text-amber-300">
          Submitted IGN is unavailable. Reject this registration or continue in Registrations.
        </p>
      )}
      <label className="block">
        <span className="mb-1 block text-[0.6rem] font-black uppercase tracking-wider text-slate-500">
          Reviewer note
        </span>
        <textarea
          value={reviewerNote}
          onChange={(event) => setReviewerNote(event.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Optional for approval. Required for rejection."
          className="w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:border-cyan-300/40 focus:outline-none"
        />
      </label>

      {decision ? (
        <div className="mt-2 rounded-lg border border-amber-300/25 bg-amber-300/8 p-3">
          <p className="text-xs font-semibold text-amber-100">
            Confirm {decision === "approve" ? "approval" : "rejection"} for {ticket.displayId}
            {decision === "approve" && ticket.registrationIgn
              ? ` using IGN ${ticket.registrationIgn}`
              : ""}.
          </p>
          {decision === "reject" && !reviewerNote.trim() && (
            <p className="mt-1 text-[0.65rem] text-red-300">Add a reviewer note before rejecting.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void submitDecision()}
              disabled={busy || (decision === "reject" && !reviewerNote.trim())}
              className="rounded-lg border border-emerald-300/40 bg-emerald-300/15 px-3 py-1.5 text-xs font-black uppercase text-emerald-100 disabled:opacity-50"
            >
              {busy ? "Saving..." : `Confirm ${decision}`}
            </button>
            <button
              type="button"
              onClick={() => setDecision(null)}
              disabled={busy}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-black uppercase text-slate-300 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDecision("approve")}
            disabled={!ticket.registrationIgn}
            className="rounded-lg border border-emerald-300/40 bg-emerald-300/15 px-3 py-1.5 text-xs font-black uppercase text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Approve Registration
          </button>
          <button
            type="button"
            onClick={() => setDecision("reject")}
            className="rounded-lg border border-red-300/35 bg-red-300/10 px-3 py-1.5 text-xs font-black uppercase text-red-200"
          >
            Reject Registration
          </button>
        </div>
      )}

      {error && <p role="alert" className="mt-2 text-xs font-semibold text-red-300">{error}</p>}
    </div>
  );
}

function MatchReportActions({
  ticket,
  onTicketChange,
  onActionSuccess,
}: Omit<AdminTicketActionsProps, "capabilities">) {
  const [context, setContext] = useState<MatchReportActionContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    void (async () => {
      try {
        const response = await fetch(
          `/api/admin/tickets/match-reports/${encodeURIComponent(ticket.sourceId)}`,
          { signal: abortController.signal, cache: "no-store" },
        );
        const body: unknown = await response.json();
        const candidate = body && typeof body === "object" && !Array.isArray(body)
          ? (body as Record<string, unknown>).context
          : null;
        const parsed = response.ok ? parseMatchReportActionContext(candidate) : null;
        if (!parsed) throw new Error("Unavailable action context");
        setContext(parsed);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError("Review details could not be loaded. Continue in Match Report.");
      } finally {
        if (!abortController.signal.aborted) setLoading(false);
      }
    })();

    return () => abortController.abort();
  }, [ticket.sourceId]);

  const score = context?.kind === "resolvable"
    ? context.games.reduce(
      (total, game) => ({
        home: total.home + (game.winningSide === "home" ? 1 : 0),
        away: total.away + (game.winningSide === "away" ? 1 : 0),
      }),
      { home: 0, away: 0 },
    )
    : null;

  async function resolveReport() {
    if (!context || context.kind !== "resolvable" || busy) return;
    setBusy(true);
    setError(null);
    const result = await runTicketAction({
      ticket,
      action: { kind: "resolve_match_report", games: context.games },
      fetcher: fetch,
      onOptimistic: onTicketChange,
      onRollback: onTicketChange,
      onSuccess: onTicketChange,
    });
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      setConfirming(false);
      return;
    }
    setCompleted(true);
    onActionSuccess();
  }

  if (completed) {
    return <p className="mt-3 text-xs font-semibold text-emerald-300">Match report resolved. Refreshing ticket...</p>;
  }

  if (loading) {
    return <p className="mt-3 text-xs font-semibold text-slate-400">Loading validated report details...</p>;
  }

  if (!context || context.kind === "read_only") {
    return (
      <div className="mt-3">
        <p className="text-xs text-slate-400">
          {context?.reason ?? error ?? "Validated report details are unavailable."}
        </p>
        <Link href="/admin/match-report" className="mt-2 inline-block text-xs font-semibold text-cyan-300 underline">
          Continue in Match Report
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-white/8 pt-3">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-black/20 px-3 py-2">
        <span className="text-xs font-black text-white">{context.homeOrg.tag || context.homeOrg.name}</span>
        <span className="text-lg font-black text-white">{score?.home} to {score?.away}</span>
        <span className="text-xs font-black text-white">{context.awayOrg.tag || context.awayOrg.name}</span>
      </div>

      <div className="mt-2 space-y-2">
        {context.games.map((game) => (
          <details key={game.gameNumber} className="rounded-lg border border-white/8 bg-white/[0.02] p-2">
            <summary className="cursor-pointer text-xs font-black text-slate-200">
              Game {game.gameNumber}: {game.winningSide === "home" ? context.homeOrg.name : context.awayOrg.name} won
            </summary>
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {game.players.map((player) => (
                <div
                  key={`${player.side}-${player.playerIgn.toLowerCase()}`}
                  className="flex min-w-0 justify-between gap-2 rounded bg-black/25 px-2 py-1 text-[0.65rem]"
                >
                  <span className="truncate font-semibold text-slate-300">{player.playerIgn}</span>
                  <span className="shrink-0 font-mono text-slate-500">
                    {player.kills}/{player.deaths}/{player.assists}
                  </span>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>

      {confirming ? (
        <div className="mt-3 rounded-lg border border-amber-300/25 bg-amber-300/8 p-3">
          <p className="text-xs font-semibold text-amber-100">
            Confirm {context.games.length} validated game{context.games.length === 1 ? "" : "s"}. This marks the match completed and updates standings.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void resolveReport()}
              disabled={busy}
              className="rounded-lg border border-emerald-300/40 bg-emerald-300/15 px-3 py-1.5 text-xs font-black uppercase text-emerald-100 disabled:opacity-50"
            >
              {busy ? "Resolving..." : "Confirm and Resolve"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-black uppercase text-slate-300 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-3 rounded-lg border border-emerald-300/40 bg-emerald-300/15 px-3 py-1.5 text-xs font-black uppercase text-emerald-100"
        >
          Resolve Match Report
        </button>
      )}

      {error && <p role="alert" className="mt-2 text-xs font-semibold text-red-300">{error}</p>}
    </div>
  );
}
