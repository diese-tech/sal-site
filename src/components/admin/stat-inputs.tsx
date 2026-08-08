"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared per-player stat controls for OCR review tables.
 *
 * These live outside MatchReportClient so the admin review screen and the
 * host-facing correction screen edit stats through the same controls instead
 * of drifting apart.
 */

export function StatInput({
  value,
  onChange,
  wide,
  label,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
  wide?: boolean;
  label?: string;
}) {
  return (
    <input
      type="number"
      min={0}
      value={value ?? ""}
      aria-label={label}
      onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      className={cn(
        "rounded border border-white/10 bg-black/30 px-1 py-0.5 text-center text-xs font-semibold tabular-nums text-white focus:border-cyan-300/40 focus:outline-none",
        wide ? "w-16" : "w-10",
      )}
    />
  );
}

export function IgnInput({
  value,
  onChange,
  roster,
  onPlayerMatch,
  unmatched,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  roster: Array<{ id: string; ign: string }>;
  onPlayerMatch: (id?: string) => void;
  unmatched?: boolean;
  label?: string;
}) {
  const listId = useId();
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        list={listId}
        aria-label={label}
        // An unmatched IGN cannot publish to official stats, so flag it here
        // rather than letting it fail at approval time.
        aria-invalid={unmatched || undefined}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v);
          const match = roster.find((r) => r.ign.toLowerCase() === v.toLowerCase());
          onPlayerMatch(match?.id);
        }}
        placeholder="IGN"
        className={cn(
          "w-full rounded border px-1.5 py-0.5 text-xs font-semibold text-white focus:outline-none",
          unmatched
            ? "border-amber-400/40 bg-amber-400/8 focus:border-amber-400/60"
            : "border-white/10 bg-black/30 focus:border-cyan-300/40",
        )}
      />
      <datalist id={listId}>
        {roster.map((p) => <option key={p.id} value={p.ign} />)}
      </datalist>
    </div>
  );
}
