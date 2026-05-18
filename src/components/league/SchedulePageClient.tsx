"use client";

import { useMemo, useState } from "react";
import type { DivisionId, LeagueData, MatchStatus } from "@/types/league";
import { MatchCard } from "@/components/league/MatchCard";
import { ScheduleFilters } from "@/components/league/ScheduleFilters";
import { formatLongDate } from "@/lib/date-format";

export function SchedulePageClient({ data }: { data: LeagueData }) {
  const { matches, orgs, season } = data;
  const maxWeek = season.currentWeek + 2;
  const [division, setDivision] = useState<DivisionId | "all">("all");
  const [status, setStatus] = useState<MatchStatus | "all">("all");
  const [week, setWeek] = useState<number | "all">("all");

  const filtered = useMemo(() => {
    return matches.filter((m) => {
      if (division !== "all" && m.divisionId !== division) return false;
      if (status !== "all" && m.status !== status) return false;
      if (week !== "all" && m.week !== week) return false;
      return true;
    });
  }, [matches, division, status, week]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const match of [...filtered].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.scheduledTime.localeCompare(b.scheduledTime))) {
      map.set(match.scheduledDate, [...(map.get(match.scheduledDate) ?? []), match]);
    }
    return map;
  }, [filtered]);

  const getOrg = (id: string) => orgs.find((o) => o.id === id)!;

  return (
    <>
      <div className="mb-8 rounded-2xl border border-cyan-300/15 bg-slate-950/84 p-4 shadow-2xl shadow-cyan-950/20 backdrop-blur">
        <ScheduleFilters
          division={division}
          status={status}
          week={week}
          maxWeek={maxWeek}
          onDivisionChange={setDivision}
          onStatusChange={setStatus}
          onWeekChange={setWeek}
        />
      </div>

      {grouped.size === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-slate-950/84 py-16 text-center backdrop-blur">
          <p className="text-sm font-black uppercase text-slate-500">No matches found for the selected filters.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {[...grouped.entries()].map(([date, dayMatches]) => (
            <div key={date}>
              <p className="mb-3 text-[0.65rem] font-black uppercase tracking-widest text-emerald-300/70">
                {formatLongDate(date)}
              </p>
              <div className="space-y-3">
                {dayMatches.map((m) => (
                  <MatchCard key={m.id} match={m} homeOrg={getOrg(m.homeOrgId)} awayOrg={getOrg(m.awayOrgId)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
