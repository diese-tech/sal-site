"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  BugReportStatusLookupResponse,
  BugReportStatusResponse,
} from "@/types/bug-report";

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; ticket: BugReportStatusResponse }
  | { kind: "not_found"; message: string }
  | { kind: "unavailable"; message: string };

const STATUS_LABELS: Record<BugReportStatusResponse["status"], string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  waiting_on_reporter: "Waiting on reporter",
  investigating: "Investigating",
  resolved: "Resolved",
  no_response: "Closed, no response",
};

export function BugReportStatusClient({ publicTicketId }: { publicTicketId: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    const storageKey = `sal:bug-report-access:${publicTicketId}`;
    let accessToken: string | null = null;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const fragmentToken = fragment.get("access");

    try {
      if (fragmentToken) {
        accessToken = fragmentToken;
        window.sessionStorage.setItem(storageKey, fragmentToken);
      } else {
        accessToken = window.sessionStorage.getItem(storageKey);
      }
    } catch {
      // Privacy modes may disable session storage. The fragment can still be
      // used for this request after it is removed from the address bar.
      accessToken = fragmentToken;
    } finally {
      if (window.location.hash) {
        window.history.replaceState(
          window.history.state,
          "",
          `${window.location.pathname}${window.location.search}`,
        );
      }
    }

    void loadTicket(publicTicketId, accessToken, controller.signal).then((nextState) => {
      if (!controller.signal.aborted) setState(nextState);
    });

    return () => controller.abort();
  }, [publicTicketId]);

  if (state.kind === "loading") {
    return <StatusCard eyebrow="Private access" title="Loading ticket…" />;
  }

  if (state.kind === "not_found") {
    return (
      <StatusCard eyebrow="Access not confirmed" title="This ticket could not be opened">
        <p className="text-sm leading-6 text-slate-400">{state.message}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href={`/auth/signin?next=${encodeURIComponent(`/report-a-bug/tickets/${publicTicketId}`)}`}
            className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-black uppercase tracking-wide text-cyan-100 hover:bg-cyan-300/15"
          >
            Sign in with Discord
          </Link>
          <Link
            href="/report-a-bug"
            className="rounded-lg border border-white/10 px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-300 hover:bg-white/[0.05]"
          >
            Report another issue
          </Link>
        </div>
      </StatusCard>
    );
  }

  if (state.kind === "unavailable") {
    return (
      <StatusCard eyebrow="Status unavailable" title="Your private access is preserved">
        <p className="text-sm leading-6 text-slate-400">{state.message}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-black uppercase tracking-wide text-cyan-100 hover:bg-cyan-300/15"
        >
          Try loading again
        </button>
      </StatusCard>
    );
  }

  const { ticket } = state;
  return (
    <section className="rounded-[var(--sal-card-radius)] border border-cyan-300/20 bg-slate-950/84 p-6 shadow-2xl shadow-cyan-950/20 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
            Ticket {ticket.ticketId}
          </p>
          <h2 className="u-font-display mt-2 text-2xl font-black text-white">
            {STATUS_LABELS[ticket.status]}
          </h2>
        </div>
        <span className="rounded-md border border-cyan-300/25 bg-cyan-300/[0.08] px-3 py-1.5 font-mono text-[0.65rem] font-bold uppercase tracking-wider text-cyan-100">
          Updated {formatDate(ticket.updatedAt)}
        </span>
      </div>

      <div className="mt-7 border-t border-white/10 pt-6">
        <h3 className="text-xs font-black uppercase tracking-wide text-slate-300">Private history</h3>
        {ticket.messages.length === 0 ? (
          <p className="mt-3 text-sm leading-6 text-slate-500">
            No private messages have been added yet. Staff updates will appear here.
          </p>
        ) : (
          <ol className="mt-4 space-y-3">
            {ticket.messages.map((message) => (
              <li key={message.id} className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-wider text-cyan-200">
                    {message.direction === "admin_to_reporter" ? "SAL staff" : "Reporter"}
                  </p>
                  <time className="text-[0.65rem] text-slate-600" dateTime={message.createdAt}>
                    {formatDate(message.createdAt)}
                  </time>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                  {message.message}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

async function loadTicket(
  publicTicketId: string,
  accessToken: string | null,
  signal: AbortSignal,
): Promise<LoadState> {
  try {
    const response = await fetch(
      `/api/bug-reports/tickets/${encodeURIComponent(publicTicketId)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(accessToken ? { accessToken } : {}),
        cache: "no-store",
        referrerPolicy: "no-referrer",
        signal,
      },
    );
    const result = (await response.json()) as BugReportStatusLookupResponse;
    if (response.ok && result.ok) return { kind: "loaded", ticket: result.ticket };
    if (response.status === 404) {
      return {
        kind: "not_found",
        message: result.ok
          ? "This private ticket could not be opened."
          : result.message,
      };
    }
    return {
      kind: "unavailable",
      message: result.ok
        ? "Ticket status is temporarily unavailable."
        : result.message,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { kind: "loading" };
    }
    return {
      kind: "unavailable",
      message: "Ticket status is temporarily unavailable. Your private access remains in this browser tab.",
    };
  }
}

function StatusCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--sal-card-radius)] border border-cyan-300/20 bg-slate-950/84 p-6 shadow-2xl shadow-cyan-950/20 sm:p-8">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
        {eyebrow}
      </p>
      <h2 className="u-font-display mt-2 text-2xl font-black text-white">{title}</h2>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
