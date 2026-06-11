"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RecalculateStandingsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function recalculate() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/recalculate-standings", { method: "POST" });
      const data = await res.json().catch(() => null) as { error?: string } | null;
      if (!res.ok) {
        setMessage({ text: data?.error ?? "Recalculation failed.", ok: false });
        return;
      }
      setMessage({ text: "Standings recalculated from completed match scores.", ok: true });
      router.refresh();
    } catch {
      setMessage({ text: "Recalculation failed. Check your connection.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => void recalculate()}
        disabled={busy}
        className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-black uppercase text-cyan-100 transition hover:bg-cyan-300/18 disabled:opacity-50"
      >
        {busy ? "Recalculating…" : "⟳ Recalculate Standings"}
      </button>
      {message && (
        <p className={`text-xs font-semibold ${message.ok ? "text-emerald-300" : "text-red-400"}`}>{message.text}</p>
      )}
    </div>
  );
}
