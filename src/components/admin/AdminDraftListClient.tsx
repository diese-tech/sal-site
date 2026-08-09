"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { DraftRoom } from "@/types/draft";
import type { Division, DivisionId, Season } from "@/types/league";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<DraftRoom["status"], string> = {
  pending: "border-slate-400/30 bg-slate-400/10 text-slate-300",
  active: "border-orange-300/40 bg-orange-300/15 text-orange-100",
  paused: "border-yellow-300/40 bg-yellow-300/15 text-yellow-100",
  complete: "border-emerald-300/40 bg-emerald-300/15 text-emerald-100",
  voided: "border-red-300/35 bg-red-300/10 text-red-200",
};

type LifecycleAction = "delete" | "void";

export function AdminDraftListClient({ rooms, season, divisions }: {
  rooms: DraftRoom[];
  season: Season;
  divisions: Division[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [updatingLifecycle, setUpdatingLifecycle] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ divisionId: "solar" as DivisionId, rounds: 5, pickTimerSeconds: 120 });
  const [lifecycle, setLifecycle] = useState<{ room: DraftRoom; action: LifecycleAction } | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [voidReason, setVoidReason] = useState("");

  async function create() {
    setCreating(true);
    setMessage("");
    const id = `${season.id}-${form.divisionId}-draft-${Date.now().toString(36)}`;
    const res = await fetch("/api/admin/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, seasonId: season.id, divisionId: form.divisionId, rounds: form.rounds, pickTimerSeconds: form.pickTimerSeconds }),
    });
    setCreating(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null) as { error?: string } | null;
      setMessage(data?.error ?? "Failed to create draft room.");
      return;
    }
    router.refresh();
  }

  function openLifecycle(room: DraftRoom, action: LifecycleAction) {
    setLifecycle({ room, action });
    setConfirmation("");
    setVoidReason("");
    setMessage("");
  }

  async function submitLifecycle() {
    if (!lifecycle) return;
    setUpdatingLifecycle(true);
    setMessage("");
    const token = lifecycle.action === "delete" ? "DELETE" : "VOID";
    const res = await fetch(`/api/admin/draft/${encodeURIComponent(lifecycle.room.id)}/lifecycle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: lifecycle.action,
        confirmation: token,
        ...(lifecycle.action === "void" ? { reason: voidReason } : {}),
      }),
    });
    const data = await res.json().catch(() => null) as { error?: string } | null;
    setUpdatingLifecycle(false);
    if (!res.ok) {
      setMessage(data?.error ?? "Failed to update draft room.");
      return;
    }
    setMessage(lifecycle.action === "delete"
      ? `Deleted pending draft room ${lifecycle.room.id}.`
      : `Voided draft room ${lifecycle.room.id}; its history was preserved.`);
    setLifecycle(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-cyan-300/20 bg-slate-950/84 p-5">
        <h2 className="mb-4 text-sm font-black uppercase text-slate-400">Create Draft Room</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1.5 block text-[0.65rem] font-black uppercase text-slate-500">Division</span>
            <select value={form.divisionId} onChange={(event) => setForm({ ...form, divisionId: event.target.value as DivisionId })} className={inputClass}>
              {divisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[0.65rem] font-black uppercase text-slate-500">Rounds</span>
            <input type="number" min={1} max={10} value={form.rounds} onChange={(event) => setForm({ ...form, rounds: Number(event.target.value) })} className={cn(inputClass, "w-20")} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[0.65rem] font-black uppercase text-slate-500">Pick Timer (sec)</span>
            <input type="number" min={30} max={600} value={form.pickTimerSeconds} onChange={(event) => setForm({ ...form, pickTimerSeconds: Number(event.target.value) })} className={cn(inputClass, "w-28")} />
          </label>
          <button type="button" onClick={create} disabled={creating} className="rounded-xl border border-cyan-300/35 bg-cyan-300/15 px-4 py-2 text-sm font-black uppercase text-cyan-100 disabled:opacity-60">
            {creating ? "Creating…" : "Create Room"}
          </button>
        </div>
        {message && <p className="mt-3 text-sm font-semibold text-orange-200" role="status">{message}</p>}
        <p className="mt-2 text-xs text-slate-500">Room IDs use the prefix <code className="text-cyan-300/70">{season.id}-{form.divisionId}-draft</code>.</p>
        <p className="mt-1 text-xs text-slate-500">Delete and void actions require typed confirmation and are recorded in the audit log.</p>
      </div>

      {rooms.length === 0 ? (
        <p className="py-8 text-center text-sm font-semibold text-slate-500">No draft rooms yet.</p>
      ) : (
        <div className="space-y-3">
          {rooms.map((room) => (
            <div key={room.id} className="rounded-2xl border border-white/8 bg-slate-950/70 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <Link href={`/admin/draft/${room.id}`} className="min-w-0 transition hover:text-cyan-100">
                  <p className="truncate font-black text-white">{room.id}</p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-400">
                    {room.divisionId.charAt(0).toUpperCase() + room.divisionId.slice(1)} · {room.rounds} rounds · {room.pickTimerSeconds}s timer
                  </p>
                </Link>
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <span className="text-xs font-semibold text-slate-500">{room.currentPickIndex} / {room.rounds * room.baseOrder.length} picks</span>
                  <span className={cn("rounded-full border px-2 py-0.5 text-[0.65rem] font-black uppercase", STATUS_COLORS[room.status])}>
                    {room.status}
                  </span>
                  {room.status === "pending" && (
                    <button type="button" onClick={() => openLifecycle(room, "delete")} className="rounded-lg border border-red-300/30 px-3 py-1.5 text-xs font-black uppercase text-red-200">
                      Delete Pending
                    </button>
                  )}
                  {(room.status === "active" || room.status === "paused") && (
                    <button type="button" onClick={() => openLifecycle(room, "void")} className="rounded-lg border border-red-300/30 px-3 py-1.5 text-xs font-black uppercase text-red-200">
                      Void Room
                    </button>
                  )}
                </div>
              </div>
              {room.status === "voided" && room.voidReason && (
                <p className="mt-3 border-t border-white/8 pt-3 text-xs font-semibold text-red-100/80">
                  Void reason: {room.voidReason}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {lifecycle && (
        <div className="rounded-2xl border border-red-300/30 bg-red-950/30 p-5" role="dialog" aria-modal="true" aria-labelledby="draft-lifecycle-title">
          <h2 id="draft-lifecycle-title" className="text-lg font-black text-white">
            {lifecycle.action === "delete" ? "Delete unused pending room" : "Void opened draft room"}
          </h2>
          <p className="mt-2 text-sm font-semibold text-slate-300">
            {lifecycle.action === "delete"
              ? "This removes the unused setup. The database will refuse if picks, captain tokens, or shortlists exist."
              : "This preserves the room and all draft history, marks it voided, and allows a replacement room."}
          </p>
          <p className="mt-2 break-all text-xs font-bold text-slate-400">{lifecycle.room.id}</p>
          {lifecycle.action === "void" && (
            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-black uppercase text-slate-400">Reason</span>
              <textarea value={voidReason} onChange={(event) => setVoidReason(event.target.value)} maxLength={500} className={cn(inputClass, "min-h-24 w-full")} />
            </label>
          )}
          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-black uppercase text-slate-400">
              Type {lifecycle.action === "delete" ? "DELETE" : "VOID"} to confirm
            </span>
            <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className={inputClass} />
          </label>
          <div className="mt-4 flex gap-3">
            <button type="button" onClick={() => setLifecycle(null)} disabled={updatingLifecycle} className="rounded-lg border border-white/15 px-4 py-2 text-sm font-black uppercase text-slate-200">
              Cancel
            </button>
            <button
              type="button"
              onClick={submitLifecycle}
              disabled={updatingLifecycle || confirmation !== (lifecycle.action === "delete" ? "DELETE" : "VOID") || (lifecycle.action === "void" && !voidReason.trim())}
              className="rounded-lg border border-red-300/40 bg-red-300/15 px-4 py-2 text-sm font-black uppercase text-red-100 disabled:opacity-50"
            >
              {updatingLifecycle ? "Working…" : lifecycle.action === "delete" ? "Delete Pending Room" : "Void Room"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputClass = "rounded-lg border border-white/10 bg-black/45 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-cyan-300/50";
