"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared per-player stat controls for OCR review tables.
 *
 * These live outside MatchReportClient so the admin review screen and the
 * host-facing correction screen edit stats through the same controls instead
 * of drifting apart.
 *
 * Sizing note: these are typed into for ten players per game while reading
 * numbers off a screenshot, so they are sized as real form controls (36px
 * tall, 14px text) rather than table-density chips. Number spinners are
 * suppressed — they stole a third of the box and misfire on scroll.
 */

const NUMBER_FIELD = [
  "h-9 rounded-lg border border-white/10 bg-black/35 px-2 text-center text-sm font-semibold tabular-nums text-white",
  "transition focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/20 focus:outline-none",
  "disabled:cursor-not-allowed disabled:opacity-60",
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
].join(" ");

export function StatInput({
  value,
  onChange,
  wide,
  label,
  disabled,
  className,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
  wide?: boolean;
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      value={value ?? ""}
      aria-label={label}
      disabled={disabled}
      onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      className={cn(NUMBER_FIELD, wide ? "w-20" : "w-12", className)}
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
  className,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  roster: Array<{ id: string; ign: string }>;
  onPlayerMatch: (id?: string) => void;
  unmatched?: boolean;
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  const listId = useId();
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        list={listId}
        aria-label={label}
        disabled={disabled}
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
          "h-9 w-full rounded-lg border px-2.5 text-sm font-semibold text-white placeholder-slate-600",
          "transition focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60",
          unmatched
            ? "border-amber-400/50 bg-amber-400/10 focus:border-amber-400/70 focus:ring-amber-400/20"
            : "border-white/10 bg-black/35 focus:border-cyan-300/50 focus:ring-cyan-300/20",
          className,
        )}
      />
      <datalist id={listId}>
        {roster.map((p) => <option key={p.id} value={p.ign} />)}
      </datalist>
    </div>
  );
}
