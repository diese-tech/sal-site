"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DraftState } from "@/types/draft";
import type { LeaguePlayer, Org } from "@/types/league";
import { formatDraftTeamLabel } from "@/lib/draft-team";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 3000;

const DIVISION_LABELS: Record<string, string> = { solar: "Solar", lunar: "Lunar", terra: "Terra" };

const STATUS_LABELS: Record<DraftState["room"]["status"], string> = {
  pending: "Draft not started",
  active: "Draft in progress",
  paused: "Draft paused",
  complete: "Draft complete",
};

interface Props {
  initialState: DraftState;
  orgs: Org[];
  players: LeaguePlayer[];
  draftId: string;
}

export function DraftOverlayClient({ initialState, orgs, players, draftId }: Props) {
  const [state, setState] = useState<DraftState>(initialState);
  const [connected, setConnected] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { room, picks, pickSequence, currentOrgId, totalPicks, secondsRemaining } = state;

  // A slot before currentPickIndex with no recorded pick was auto-skipped
  // (timer expired with an empty shortlist).
  const pickByNumber = new Map(picks.map((p) => [p.pickNumber, p]));
  const pickLog: ({ kind: "pick"; pick: (typeof picks)[number] } | { kind: "skip"; pickNumber: number; orgId: string })[] = [];
  for (let n = 1; n <= Math.min(room.currentPickIndex, pickSequence.length); n++) {
    const pick = pickByNumber.get(n);
    if (pick) pickLog.push({ kind: "pick", pick });
    else pickLog.push({ kind: "skip", pickNumber: n, orgId: pickSequence[n - 1]! });
  }

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/draft/${draftId}`);
      if (!res.ok) { setConnected(false); return; }
      const data = await res.json() as { state: DraftState };
      setState(data.state);
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, [draftId]);

  useEffect(() => {
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [poll]);

  const getOrg = (id: string) => orgs.find((o) => o.id === id && o.divisionId === room.divisionId);
  const getTeamLabel = (id: string) => {
    const org = getOrg(id);
    return org ? formatDraftTeamLabel(org.name, room.divisionId) : "Unknown team";
  };
  const getPlayer = (id: string) => players.find((p) => p.id === id);
  const pickedIds = new Set(picks.map((p) => p.playerId));
  const availablePlayers = players.filter((p) => p.divisionId === room.divisionId && !pickedIds.has(p.id));

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_18%_0%,rgba(34,211,238,0.10),transparent_28rem),radial-gradient(circle_at_80%_8%,rgba(16,185,129,0.10),transparent_28rem),#05070d] text-white">
      <header className="border-b border-white/8 bg-slate-950/90 px-6 py-5">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300/70">
              SAL · {DIVISION_LABELS[room.divisionId] ?? room.divisionId} Division Draft
            </p>
            <p className="text-2xl font-black">{STATUS_LABELS[room.status]}</p>
          </div>
          <div className="flex items-center gap-4 text-sm font-semibold text-slate-400">
            {!connected && <span className="text-orange-300">Reconnecting…</span>}
            <span>Pick {Math.min(room.currentPickIndex + 1, totalPicks)} / {totalPicks}</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-6 py-8">
        {room.status === "active" && currentOrgId && (
          <div className="mb-8 rounded-3xl border border-orange-300/30 bg-orange-300/[0.06] p-8 text-center">
            <p className="text-sm font-black uppercase tracking-[0.3em] text-orange-200/70">On the Clock</p>
            <p className="mt-2 text-5xl font-black text-white">{getTeamLabel(currentOrgId)}</p>
            {secondsRemaining !== null && (
              <p className={cn("mt-4 text-6xl font-black tabular-nums", secondsRemaining < 30 ? "text-red-300" : "text-slate-200")}>
                {Math.floor(secondsRemaining)}s
              </p>
            )}
          </div>
        )}

        {room.status === "complete" && (
          <div className="mb-8 rounded-3xl border border-emerald-300/30 bg-emerald-300/10 p-8 text-center">
            <p className="text-4xl font-black text-emerald-100">Draft Complete</p>
          </div>
        )}

        {room.status === "pending" && (
          <div className="mb-8 rounded-3xl border border-white/10 bg-white/[0.02] p-8 text-center">
            <p className="text-2xl font-black text-slate-300">Waiting to start…</p>
          </div>
        )}

        {room.status === "paused" && (
          <div className="mb-8 rounded-3xl border border-yellow-300/30 bg-yellow-300/[0.06] p-8 text-center">
            <p className="text-2xl font-black text-yellow-100">Draft paused</p>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr_1fr]">
          <section className="rounded-2xl border border-white/8 bg-slate-950/70 p-5">
            <h2 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">Up Next</h2>
            {room.status === "active" && pickSequence.length > 0 ? (
              <div className="space-y-2">
                {pickSequence.slice(room.currentPickIndex, room.currentPickIndex + 6).map((orgId, i) => (
                  <div key={i} className={cn("flex items-center gap-3 rounded-xl px-4 py-2.5 text-base", i === 0 ? "bg-orange-300/10 font-black text-orange-100" : "text-slate-300")}>
                    <span className="w-6 shrink-0 text-right font-mono text-sm text-slate-500">{room.currentPickIndex + i + 1}.</span>
                    <span className="truncate">{getTeamLabel(orgId)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">—</p>
            )}
          </section>

          <section className="rounded-2xl border border-white/8 bg-slate-950/70 p-5">
            <h2 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">Picks ({picks.length})</h2>
            {pickLog.length === 0 ? (
              <p className="text-sm text-slate-500">No picks yet.</p>
            ) : (
              <div className="max-h-[28rem] space-y-2 overflow-y-auto">
                {[...pickLog].reverse().map((entry) =>
                  entry.kind === "pick" ? (
                    <div key={entry.pick.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 px-4 py-2.5">
                      <span className="w-7 shrink-0 text-right font-mono text-xs text-slate-500">{entry.pick.pickNumber}</span>
                      <span className="min-w-0 truncate text-sm text-slate-400">{getTeamLabel(entry.pick.orgId)}</span>
                      <span className="shrink-0 text-slate-600">→</span>
                      <span className="min-w-0 truncate font-black text-white">
                        {getPlayer(entry.pick.playerId)?.displayAlias ?? getPlayer(entry.pick.playerId)?.ign ?? entry.pick.playerId}
                      </span>
                    </div>
                  ) : (
                    <div key={`skip-${entry.pickNumber}`} className="flex items-center gap-3 rounded-xl border border-red-300/15 bg-red-300/[0.04] px-4 py-2.5">
                      <span className="w-7 shrink-0 text-right font-mono text-xs text-slate-500">{entry.pickNumber}</span>
                      <span className="min-w-0 truncate text-sm text-slate-400">{getTeamLabel(entry.orgId)}</span>
                      <span className="shrink-0 text-slate-600">→</span>
                      <span className="text-xs font-black uppercase text-red-300/80">Skipped</span>
                    </div>
                  ),
                )}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-white/8 bg-slate-950/70 p-5">
            <h2 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">
              Available ({availablePlayers.length})
            </h2>
            {availablePlayers.length === 0 ? (
              <p className="text-sm text-slate-500">No players remaining.</p>
            ) : (
              <div className="max-h-[28rem] space-y-1.5 overflow-y-auto">
                {availablePlayers.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/20 px-4 py-2">
                    <span className="min-w-0 truncate font-black text-white">{p.displayAlias ?? p.ign}</span>
                    <span className="shrink-0 text-xs font-black text-cyan-200">{p.primaryRole}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
