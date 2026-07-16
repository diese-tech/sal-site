"use client";

import { useMemo, useState } from "react";
import type { DivisionId, LeagueData } from "@/types/league";
import { OrgCard } from "@/components/league/OrgCard";
import { cn } from "@/lib/utils";

const DIVISION_FILTERS: { id: DivisionId | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "solar", label: "Solar" },
  { id: "lunar", label: "Lunar" },
  { id: "terra", label: "Terra" },
];

const divisionActive: Record<DivisionId, string> = {
  solar: "border-orange-300/40 bg-orange-300/15 text-orange-100",
  lunar: "border-cyan-300/40 bg-cyan-300/15 text-cyan-100",
  terra: "border-emerald-300/40 bg-emerald-300/15 text-emerald-100",
};

const inactiveBtn = "border-white/10 bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-slate-200";

export function TeamsPageClient({ data }: { data: LeagueData }) {
  const { orgs, standings, players } = data;
  const [divisionFilter, setDivisionFilter] = useState<DivisionId | "all">("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return orgs.filter((org) => {
      if (divisionFilter !== "all" && org.divisionId !== divisionFilter) return false;
      if (search && !org.name.toLowerCase().includes(search.toLowerCase()) && !org.tag.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [orgs, divisionFilter, search]);

  const getStanding = (orgId: string) => standings.find((s) => s.orgId === orgId);
  const getCaptainIgn = (captainId?: string) => {
    const captain = captainId ? players.find((p) => p.id === captainId) : undefined;
    return captain ? captain.displayAlias ?? captain.ign : undefined;
  };

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-cyan-300/15 bg-slate-950/84 p-4 shadow-2xl shadow-cyan-950/20 backdrop-blur sm:flex-row sm:flex-wrap sm:items-center">
        <input
          type="text"
          placeholder="Search teams..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-black/45 px-4 py-2 text-sm font-semibold text-white placeholder:text-slate-600 focus:border-cyan-500/40 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 sm:w-56"
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-black uppercase text-slate-500">Division</span>
          {DIVISION_FILTERS.map(({ id, label }) => {
            const isActive = divisionFilter === id;
            const activeStyle = id !== "all" ? divisionActive[id as DivisionId] : "border-white/25 bg-white/10 text-white";
            return (
              <button
                key={id}
                onClick={() => setDivisionFilter(id as DivisionId | "all")}
                className={cn("rounded-xl border px-3 py-1.5 text-xs font-black uppercase transition", isActive ? activeStyle : inactiveBtn)}
              >
                {label}
              </button>
            );
          })}
        </div>
        <span className="ml-auto text-[0.65rem] font-black uppercase text-slate-600">
          {filtered.length} / {orgs.length} teams
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-slate-950/84 py-16 text-center backdrop-blur">
          <p className="text-sm font-black uppercase text-slate-500">No teams match your filters.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((org) => (
            <OrgCard key={org.id} org={org} standing={getStanding(org.id)} captainIgn={getCaptainIgn(org.captainId)} />
          ))}
        </div>
      )}
    </>
  );
}
