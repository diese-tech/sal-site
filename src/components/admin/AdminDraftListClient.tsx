"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { DraftRoom } from "@/types/draft";
import type { Division, Season } from "@/types/league";
import type { DivisionId } from "@/types/league";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<DraftRoom["status"], string> = {
  pending: "border-slate-400/30 bg-slate-400/10 text-slate-300",
  active: "border-orange-300/40 bg-orange-300/15 text-orange-100",
  paused: "border-yellow-300/40 bg-yellow-300/15 text-yellow-100",
  complete: "border-emerald-300/40 bg-emerald-300/15 text-emerald-100",
};

export function AdminDraftListClient({ rooms, season, divisions }: {
  rooms: DraftRoom[];
  season: Season;
  divisions: Division[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ divisionId: "solar" as DivisionId, rounds: 5, pickTimerSeconds: 120 });

  async function create() {
    setCreating(true);
    setMessage("");
    const id = `${season.id}-${form.divisionId}-draft`;
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

  return (
    <div className="space-y-6">
      {/* Create form */}
      <div className="rounded-2xl border border-cyan-300/20 bg-slate-950/84 p-5">
        <h2 className="mb-4 text-sm font-black uppercase text-slate-400">Create Draft Room</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1.5 block text-[0.65rem] font-black uppercase text-slate-500">Division</span>
            <select value={form.divisionId} onChange={(e) => setForm({ ...form, divisionId: e.target.value as DivisionId })} className={inputClass}>
              {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[0.65rem] font-black uppercase text-slate-500">Rounds</span>
            <input type="number" min={1} max={10} value={form.rounds} onChange={(e) => setForm({ ...form, rounds: Number(e.target.value) })} className={cn(inputClass, "w-20")} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[0.65rem] font-black uppercase text-slate-500">Pick Timer (sec)</span>
            <input type="number" min={30} max={600} value={form.pickTimerSeconds} onChange={(e) => setForm({ ...form, pickTimerSeconds: Number(e.target.value) })} className={cn(inputClass, "w-28")} />
          </label>
          <button onClick={create} disabled={creating} className="rounded-xl border border-cyan-300/35 bg-cyan-300/15 px-4 py-2 text-sm font-black uppercase text-cyan-100 disabled:opacity-60">
            {creating ? "Creating…" : "Create Room"}
          </button>
        </div>
        {message && <p className="mt-3 text-sm font-semibold text-orange-200">{message}</p>}
        <p className="mt-2 text-xs text-slate-500">Room ID will be <code className="text-cyan-300/70">{season.id}-{form.divisionId}-draft</code></p>
      </div>

      {/* Room list */}
      {rooms.length === 0 ? (
        <p className="py-8 text-center text-sm font-semibold text-slate-500">No draft rooms yet.</p>
      ) : (
        <div className="space-y-3">
          {rooms.map((room) => (
            <Link key={room.id} href={`/admin/draft/${room.id}`} className="flex items-center justify-between gap-4 rounded-2xl border border-white/8 bg-slate-950/70 px-5 py-4 transition hover:border-cyan-300/25 hover:bg-white/[0.04]">
              <div>
                <p className="font-black text-white">{room.id}</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-400">
                  {room.divisionId.charAt(0).toUpperCase() + room.divisionId.slice(1)} · {room.rounds} rounds · {room.pickTimerSeconds}s timer
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-500">{room.currentPickIndex} / {room.rounds * room.baseOrder.length} picks</span>
                <span className={cn("rounded-full border px-2 py-0.5 text-[0.65rem] font-black uppercase", STATUS_COLORS[room.status])}>
                  {room.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const inputClass = "rounded-lg border border-white/10 bg-black/45 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-cyan-300/50";
