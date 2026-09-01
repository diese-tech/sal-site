"use client";

import { useState } from "react";
import { ACCESS_CODE_LENGTH, formatAccessCode, normalizeAccessCode } from "@/lib/draft-access-code";
import { cn } from "@/lib/utils";

interface Props {
  draftId: string;
  onJoined: (orgId: string) => void;
}

/**
 * Self-serve captain entry: type the team code an admin read out, take the
 * seat. Replaces the one-time links that captains could not use once the link
 * had been opened elsewhere — there is now always a way back into a seat from
 * the draft room itself, without an admin reissuing anything.
 */
export function JoinSeatPanel({ draftId, onJoined }: Props) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const normalized = normalizeAccessCode(code);
  const complete = normalized.length === ACCESS_CODE_LENGTH;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !normalized) return;
    setBusy(true);
    setError("");

    try {
      const res = await fetch(`/api/draft/${draftId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalized }),
      });
      const data = await res.json().catch(() => null) as { orgId?: string; error?: string } | null;
      if (!res.ok || !data?.orgId) {
        setError(data?.error ?? "Could not join with that code. Try again.");
        return;
      }
      onJoined(data.orgId);
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.04] p-4 sm:p-5">
      <h2 className="text-sm font-black uppercase text-cyan-100">Captain? Enter your team code</h2>
      <p className="mt-1 text-xs text-slate-400">
        Your league admin has an 8-character code for your team. It works on any device, as many times as you need.
        Without one you can still watch the draft live.
      </p>

      <form onSubmit={submit} className="mt-3 flex flex-wrap items-center gap-2">
        <label htmlFor="team-code" className="sr-only">Team access code</label>
        <input
          id="team-code"
          value={code}
          onChange={(e) => { setCode(e.target.value); setError(""); }}
          placeholder="ABCD-2345"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={20}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "team-code-error" : undefined}
          className={cn(
            "w-44 rounded-xl border bg-black/40 px-3 py-2 text-center font-mono text-lg font-black uppercase tracking-[0.2em] text-white placeholder:tracking-normal placeholder:text-slate-600 focus:outline-none",
            error ? "border-orange-300/50" : "border-white/15 focus:border-cyan-300/60",
          )}
        />
        <button
          type="submit"
          disabled={busy || !normalized}
          className="rounded-xl border border-cyan-300/40 bg-cyan-300/15 px-5 py-2 text-xs font-black uppercase text-cyan-100 transition disabled:opacity-40"
        >
          {busy ? "Joining…" : "Join draft"}
        </button>
        {complete && !error && !busy && (
          <span className="font-mono text-xs text-slate-500">{formatAccessCode(normalized)}</span>
        )}
      </form>

      {error && (
        <p id="team-code-error" role="alert" className="mt-2 text-xs font-semibold text-orange-200">
          {error}
        </p>
      )}
    </section>
  );
}
