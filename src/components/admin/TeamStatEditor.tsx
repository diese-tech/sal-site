"use client";

import { IgnInput, StatInput } from "@/components/admin/stat-inputs";
import { cn } from "@/lib/utils";

/**
 * Per-team stat entry for the match-report review step.
 *
 * Replaces the old `<table min-w-[480px]>` inside `overflow-x-auto`. That table
 * lived in a column narrower than its own minimum width, so every game was
 * corrected through two independently side-scrolling panes with the IGN column
 * pushed off-screen. This lays the same nine fields out on a container-query
 * grid instead: one line per player when the card is wide, a tidy three-line
 * wrap when it is not. Nothing ever scrolls sideways.
 */

export interface TeamStatPlayer {
  ign: string;
  playerId?: string;
  role?: string;
  god?: string;
  kills?: number;
  deaths?: number;
  assists?: number;
  damageDealt?: number;
  damageMitigated?: number;
}

// Shared between the header labels and every row so the columns line up.
const ROW_GRID =
  "grid grid-cols-12 items-end gap-x-2 gap-y-2.5 @4xl:items-center @4xl:gap-y-0 " +
  "@4xl:grid-cols-[minmax(7rem,1.2fr)_6.75rem_minmax(5.5rem,1fr)_3.25rem_3.25rem_3.25rem_4.75rem_4.75rem_1.75rem]";

const MICRO_LABEL = "mb-1 block text-[0.55rem] font-black uppercase tracking-wider text-slate-500 @4xl:hidden";

const SELECTLIKE =
  "h-9 w-full rounded-lg border border-white/10 bg-black/35 px-2 text-sm font-semibold text-white placeholder-slate-600 " +
  "transition focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/20 focus:outline-none";

function Cell({ span, label, children }: { span: string; label: string; children: React.ReactNode }) {
  return (
    <div className={cn("min-w-0", span, "@4xl:col-span-1")}>
      <span className={MICRO_LABEL} aria-hidden>{label}</span>
      {children}
    </div>
  );
}

export function TeamStatEditor({
  teamName,
  side,
  rows,
  roster,
  roles,
  isWinner,
  onSetWinner,
  onChange,
  onRemove,
  onAdd,
  readOnly = false,
}: {
  teamName: string;
  side: "home" | "away";
  rows: Array<{ player: TeamStatPlayer; globalIdx: number }>;
  roster: Array<{ id: string; ign: string }>;
  roles: readonly string[];
  isWinner: boolean;
  onSetWinner: () => void;
  onChange: (globalIdx: number, patch: Partial<TeamStatPlayer>) => void;
  onRemove: (globalIdx: number) => void;
  onAdd: () => void;
  /** Published reports are shown through the same grid, but not editable. */
  readOnly?: boolean;
}) {
  const unmatchedCount = rows.filter(({ player }) => player.ign.trim() && !player.playerId).length;

  return (
    <section
      className={cn(
        "@container overflow-hidden rounded-2xl border bg-slate-950/60",
        isWinner ? "border-emerald-400/30" : "border-white/8",
      )}
    >
      <header
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 px-4 py-2.5",
          isWinner ? "bg-emerald-400/10" : "bg-white/[0.03]",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-sm font-black uppercase text-white">{teamName}</h3>
          {!readOnly && unmatchedCount > 0 && (
            <span className="rounded border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[0.55rem] font-black uppercase text-amber-300">
              {unmatchedCount} unlinked
            </span>
          )}
        </div>
        {/* The winner is set from the team card itself — a separate "Winner:"
            toggle bar duplicated these two team names a third time on screen. */}
        {readOnly ? (
          isWinner && (
            <span className="rounded-lg border border-emerald-400/50 bg-emerald-400/20 px-2.5 py-1 text-[0.65rem] font-black uppercase text-emerald-200">
              ✓ Winner
            </span>
          )
        ) : (
          <button
            type="button"
            onClick={onSetWinner}
            aria-pressed={isWinner}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-[0.65rem] font-black uppercase transition",
              isWinner
                ? "border-emerald-400/50 bg-emerald-400/20 text-emerald-200"
                : "border-white/10 bg-white/[0.04] text-slate-500 hover:border-white/25 hover:text-slate-200",
            )}
          >
            {isWinner ? "✓ Winner" : "Mark winner"}
          </button>
        )}
      </header>

      {/* Column headings only make sense once every field is on one line. */}
      <div className={cn(ROW_GRID, "hidden border-b border-white/8 px-4 py-2 text-[0.55rem] font-black uppercase tracking-wider text-slate-500 @4xl:grid")}>
        <span>IGN</span>
        <span>Role</span>
        <span>God</span>
        <span className="text-center">K</span>
        <span className="text-center">D</span>
        <span className="text-center">A</span>
        <span className="text-center">DMG</span>
        <span className="text-center">MIT</span>
        <span />
      </div>

      <div className="divide-y divide-white/5">
        {rows.map(({ player, globalIdx }) => {
          const unmatched = !!player.ign.trim() && !player.playerId;
          const who = player.ign.trim() || `${side} player ${globalIdx + 1}`;
          return (
            <div
              key={globalIdx}
              className={cn(ROW_GRID, "relative px-4 py-3 @4xl:py-2", unmatched && "bg-amber-400/5")}
            >
              <Cell span="col-span-12 @xl:col-span-5" label="IGN">
                <IgnInput
                  value={player.ign}
                  disabled={readOnly}
                  label={`${who} IGN`}
                  onChange={(v) => onChange(globalIdx, { ign: v })}
                  roster={roster}
                  onPlayerMatch={(id) => onChange(globalIdx, { playerId: id })}
                  unmatched={unmatched}
                  className="pr-9 @xl:pr-2.5"
                />
              </Cell>

              <Cell span="col-span-5 @xl:col-span-3" label="Role">
                <select
                  value={player.role ?? ""}
                  disabled={readOnly}
                  aria-label={`${who} role`}
                  onChange={(e) => onChange(globalIdx, { role: e.target.value || undefined })}
                  className={SELECTLIKE}
                >
                  <option value="">—</option>
                  {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Cell>

              <Cell span="col-span-7 @xl:col-span-4" label="God">
                <input
                  value={player.god ?? ""}
                  disabled={readOnly}
                  aria-label={`${who} god`}
                  onChange={(e) => onChange(globalIdx, { god: e.target.value || undefined })}
                  placeholder="God"
                  // God ends the first line at mid widths, so it yields the
                  // space the floating remove button sits in.
                  className={cn(SELECTLIKE, "@xl:pr-9 @4xl:pr-2")}
                />
              </Cell>

              <Cell span="col-span-2" label="K">
                <StatInput disabled={readOnly} className="w-full" label={`${who} kills`} value={player.kills} onChange={(v) => onChange(globalIdx, { kills: v })} />
              </Cell>
              <Cell span="col-span-2" label="D">
                <StatInput disabled={readOnly} className="w-full" label={`${who} deaths`} value={player.deaths} onChange={(v) => onChange(globalIdx, { deaths: v })} />
              </Cell>
              <Cell span="col-span-2" label="A">
                <StatInput disabled={readOnly} className="w-full" label={`${who} assists`} value={player.assists} onChange={(v) => onChange(globalIdx, { assists: v })} />
              </Cell>
              <Cell span="col-span-3" label="DMG">
                <StatInput disabled={readOnly} className="w-full" label={`${who} damage dealt`} value={player.damageDealt} onChange={(v) => onChange(globalIdx, { damageDealt: v })} />
              </Cell>
              <Cell span="col-span-3" label="MIT">
                <StatInput disabled={readOnly} className="w-full" label={`${who} damage mitigated`} value={player.damageMitigated} onChange={(v) => onChange(globalIdx, { damageMitigated: v })} />
              </Cell>

              {/* Out of flow while wrapped (it would otherwise cost a whole
                  line); a normal grid cell once the row is on one line. */}
              {!readOnly && <button
                type="button"
                onClick={() => onRemove(globalIdx)}
                aria-label={`Remove ${who}`}
                title="Remove row"
                className={cn(
                  "absolute right-4 top-[2.05rem] flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition hover:bg-red-400/10 hover:text-red-300",
                  "@4xl:static @4xl:h-8 @4xl:w-7 @4xl:justify-self-center",
                )}
              >
                ×
              </button>}
            </div>
          );
        })}
      </div>

      {!readOnly && <div className="border-t border-white/5 px-4 py-2">
        <button
          type="button"
          onClick={onAdd}
          className="rounded-lg px-1 py-1 text-[0.65rem] font-black uppercase text-slate-500 transition hover:text-cyan-200"
        >
          + Add player row
        </button>
      </div>}
    </section>
  );
}
