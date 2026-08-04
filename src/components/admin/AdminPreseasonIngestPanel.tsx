"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Season } from "@/types/league";
import type { PreseasonIngestPreview } from "@/lib/preseason-ingest";

export function AdminPreseasonIngestPanel({
  targetSeasonId,
  seasons,
}: {
  targetSeasonId: string;
  seasons: Season[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [preview, setPreview] = useState<PreseasonIngestPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");

  // This action is specifically "Ingest from Preseason" — offering active/
  // post-season/offseason sources would suggest an admin can copy any
  // season's roster into another, which the server also rejects (#230).
  const candidates = seasons.filter((s) => s.id !== targetSeasonId && s.status === "pre-season");

  async function loadPreview() {
    if (!sourceId) {
      setError("Select a source season.");
      return;
    }
    setLoading(true);
    setError("");
    setPreview(null);
    const res = await fetch(
      `/api/admin/seasons/${encodeURIComponent(targetSeasonId)}/ingest-preseason?source=${encodeURIComponent(sourceId)}`,
    );
    setLoading(false);
    const data = await res.json().catch(() => null) as PreseasonIngestPreview | { error?: string } | null;
    if (!res.ok) {
      setError((data as { error?: string } | null)?.error ?? "Unable to load preview.");
      return;
    }
    setPreview(data as PreseasonIngestPreview);
  }

  async function apply() {
    if (!preview) return;
    setApplying(true);
    setError("");
    const res = await fetch(`/api/admin/seasons/${encodeURIComponent(targetSeasonId)}/ingest-preseason`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: preview.sourceSeasonId }),
    });
    setApplying(false);
    const data = await res.json().catch(() => null) as { error?: string } | null;
    if (!res.ok) {
      setError(data?.error ?? "Ingest failed.");
      return;
    }
    setPreview(null);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-emerald-300/35 bg-emerald-300/10 px-2.5 py-1 text-[0.65rem] font-black uppercase text-emerald-200 transition hover:bg-emerald-300/20"
      >
        Ingest from Preseason
      </button>
    );
  }

  return (
    <div className="mt-3 w-full rounded-xl border border-emerald-300/20 bg-black/25 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Source preseason"
          value={sourceId}
          onChange={(e) => { setSourceId(e.target.value); setPreview(null); setError(""); }}
          className="rounded-lg border border-white/10 bg-black/45 px-2.5 py-2 text-xs font-semibold text-white outline-none focus:border-cyan-300/50"
        >
          <option value="">Select source (preseason)…</option>
          {candidates.map((s) => (
            <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
          ))}
        </select>
        <button
          onClick={() => void loadPreview()}
          disabled={loading || !sourceId}
          className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-black uppercase text-cyan-100 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Preview"}
        </button>
        <button
          onClick={() => { setOpen(false); setPreview(null); setError(""); }}
          className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black uppercase text-slate-400"
        >
          Cancel
        </button>
      </div>

      {error && <p role="alert" className="mt-2 text-xs font-semibold text-rose-200">{error}</p>}

      {preview && (
        <div className="mt-3 space-y-4">
          <p className="text-sm font-black text-white">
            {preview.orgCount} divisional teams · {preview.captainCount} captains · {preview.freeAgentCount} free agents · {preview.totalPlayers} players total
          </p>

          <div>
            <p className="mb-1.5 text-[0.65rem] font-black uppercase text-slate-500">Orgs &amp; Captains</p>
            {preview.orgCount === 0 ? (
              <p className="text-xs text-slate-500">No divisional teams enrolled in the source season.</p>
            ) : (
              <div className="space-y-2">
                {preview.divisions.filter((d) => d.orgs.length > 0).map((division) => (
                  <div key={division.divisionId}>
                    <p className="text-xs font-black uppercase text-cyan-300">{division.divisionName}</p>
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-300">
                      {division.orgs.map((org) => (
                        <li key={org.orgId}>
                          {org.orgName}
                          {org.captainIgn ? (
                            <> — Captain: <span className="font-semibold text-white">{org.captainIgn}</span></>
                          ) : (
                            <span className="text-slate-500"> — no captain assigned</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-[0.65rem] font-black uppercase text-slate-500">Free Agents</p>
            {preview.freeAgentCount === 0 ? (
              <p className="text-xs text-slate-500">No free agents in the source season.</p>
            ) : (
              <div className="space-y-2">
                {preview.divisions.filter((d) => d.freeAgents.length > 0).map((division) => (
                  <div key={division.divisionId}>
                    <p className="text-xs font-black uppercase text-cyan-300">{division.divisionName} — {division.freeAgents.length} players</p>
                    <ul className="mt-1 grid grid-cols-2 gap-x-4 text-xs text-slate-300 sm:grid-cols-3">
                      {division.freeAgents.map((agent) => <li key={agent.playerId}>{agent.ign}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => void apply()}
            disabled={applying}
            className="rounded-xl border border-emerald-300/35 bg-emerald-300/15 px-4 py-2 text-sm font-black uppercase text-emerald-100 disabled:opacity-60"
          >
            {applying ? "Ingesting…" : `Apply — Ingest into ${preview.targetSeasonName}`}
          </button>
        </div>
      )}
    </div>
  );
}
