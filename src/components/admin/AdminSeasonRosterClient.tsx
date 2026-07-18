"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DivisionId, LeaguePlayer, Org } from "@/types/league";
import type {
  SeasonOrgAdminAssignment,
  SeasonRosterAdminAssignment,
  SeasonRosterAdminData,
} from "@/lib/league-data";

const selectClass = "rounded-lg border border-white/10 bg-black/45 px-2.5 py-2 text-xs font-semibold text-white outline-none focus:border-cyan-300/50";
const buttonClass = "rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-black uppercase text-cyan-100 disabled:opacity-50";

async function rosterRequest(seasonId: string, method: "POST" | "DELETE", body: unknown) {
  const response = await fetch(`/api/admin/seasons/${encodeURIComponent(seasonId)}/roster`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error ?? "Roster update failed.");
  }
}

function OrgAssignmentRow({
  seasonId,
  org,
  assignment,
  divisions,
}: {
  seasonId: string;
  org: Org;
  assignment?: SeasonOrgAdminAssignment;
  divisions: SeasonRosterAdminData["divisions"];
}) {
  const router = useRouter();
  const [divisionId, setDivisionId] = useState<DivisionId>(assignment?.division_id ?? org.divisionId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await rosterRequest(seasonId, "POST", { entity: "org", orgId: org.id, divisionId });
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save organization.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setMessage("");
    try {
      await rosterRequest(seasonId, "DELETE", { entity: "org", orgId: org.id });
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Remove players and matches first.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/8 bg-black/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-40 flex-1">
          <p className="font-black text-white">{org.name} <span className="text-slate-500">[{org.tag}]</span></p>
          <p className="text-[0.65rem] font-semibold uppercase text-slate-500">{assignment ? "Enrolled" : "Not in this season"}</p>
        </div>
        <select aria-label={`Division for ${org.name}`} value={divisionId} onChange={(event) => setDivisionId(event.target.value as DivisionId)} className={selectClass}>
          {divisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}
        </select>
        <button onClick={() => void save()} disabled={busy} className={buttonClass}>{assignment ? "Save" : "Enroll"}</button>
        {assignment && (
          <button onClick={() => void remove()} disabled={busy} className="rounded-lg border border-rose-300/25 px-3 py-2 text-xs font-black uppercase text-rose-200 disabled:opacity-50">
            Remove
          </button>
        )}
      </div>
      {message && <p role="alert" className="mt-2 text-xs font-semibold text-rose-200">{message}</p>}
    </div>
  );
}

function PlayerAssignmentRow({
  seasonId,
  player,
  assignment,
  enrolledOrgs,
  orgCatalog,
  divisions,
}: {
  seasonId: string;
  player: LeaguePlayer;
  assignment?: SeasonRosterAdminAssignment;
  enrolledOrgs: SeasonOrgAdminAssignment[];
  orgCatalog: Org[];
  divisions: SeasonRosterAdminData["divisions"];
}) {
  const router = useRouter();
  const [orgId, setOrgId] = useState(assignment?.org_id ?? "");
  const [freeAgentDivision, setFreeAgentDivision] = useState<DivisionId | "">(assignment?.division_id ?? player.divisionId ?? "");
  const [isCaptain, setIsCaptain] = useState(assignment?.is_captain ?? false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const enrolledOrg = enrolledOrgs.find((row) => row.org_id === orgId);
  const orgName = (id: string) => orgCatalog.find((org) => org.id === id)?.name ?? id;

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await rosterRequest(seasonId, "POST", {
        entity: "player",
        playerId: player.id,
        orgId: orgId || null,
        divisionId: (enrolledOrg?.division_id ?? freeAgentDivision) || null,
        isCaptain: orgId ? isCaptain : false,
      });
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save player.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setMessage("");
    try {
      await rosterRequest(seasonId, "DELETE", { entity: "player", playerId: player.id });
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to remove player.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/8 bg-black/20 p-3">
      <div className="grid gap-2 lg:grid-cols-[minmax(10rem,1fr)_minmax(11rem,1fr)_minmax(9rem,0.7fr)_auto_auto] lg:items-center">
        <div>
          <p className="font-black text-white">{player.displayAlias ?? player.ign}</p>
          <p className="text-[0.65rem] font-semibold text-slate-500">@{player.discordUsername} · {assignment ? assignment.roster_status : "not enrolled"}</p>
        </div>
        <select aria-label={`Team for ${player.ign}`} value={orgId} onChange={(event) => { setOrgId(event.target.value); if (!event.target.value) setIsCaptain(false); }} className={selectClass}>
          <option value="">Free agent / unassigned</option>
          {enrolledOrgs.map((row) => <option key={row.org_id} value={row.org_id}>{orgName(row.org_id)}</option>)}
        </select>
        {orgId ? (
          <span className="px-2 text-xs font-bold uppercase text-slate-400">{enrolledOrg?.division_id ?? "Unknown division"}</span>
        ) : (
          <select aria-label={`Free-agent division for ${player.ign}`} value={freeAgentDivision} onChange={(event) => setFreeAgentDivision(event.target.value as DivisionId | "")} className={selectClass}>
            <option value="">No division</option>
            {divisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}
          </select>
        )}
        <label className="flex items-center gap-2 text-xs font-bold text-slate-300">
          <input type="checkbox" checked={isCaptain} disabled={!orgId} onChange={(event) => setIsCaptain(event.target.checked)} /> Captain
        </label>
        <div className="flex gap-2">
          <button onClick={() => void save()} disabled={busy} className={buttonClass}>{assignment ? "Save" : "Enroll"}</button>
          {assignment && <button onClick={() => void remove()} disabled={busy} className="rounded-lg border border-rose-300/25 px-3 py-2 text-xs font-black uppercase text-rose-200 disabled:opacity-50">Remove</button>}
        </div>
      </div>
      {message && <p role="alert" className="mt-2 text-xs font-semibold text-rose-200">{message}</p>}
    </div>
  );
}

export function AdminSeasonRosterClient({ data }: { data: SeasonRosterAdminData }) {
  const [search, setSearch] = useState("");
  const orgAssignmentById = new Map(data.orgAssignments.map((row) => [row.org_id, row]));
  const rosterByPlayerId = new Map(data.rosterAssignments.map((row) => [row.player_id, row]));
  const visiblePlayers = data.playerCatalog.filter((player) => {
    const value = `${player.ign} ${player.displayAlias ?? ""} ${player.discordUsername}`.toLowerCase();
    return value.includes(search.trim().toLowerCase());
  });

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-black text-white">Season Organizations</h2>
          <p className="text-sm font-semibold text-slate-400">Enroll teams first. Removing a team is blocked while roster or match rows still reference it.</p>
        </div>
        {data.orgCatalog.map((org) => (
          <OrgAssignmentRow key={org.id} seasonId={data.season.id} org={org} assignment={orgAssignmentById.get(org.id)} divisions={data.divisions} />
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-white">Season Players</h2>
            <p className="text-sm font-semibold text-slate-400">Assign players to an enrolled team or keep them visible as free agents.</p>
          </div>
          <input aria-label="Search season players" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search players" className="rounded-lg border border-white/10 bg-black/45 px-3 py-2 text-sm text-white outline-none" />
        </div>
        {visiblePlayers.map((player) => (
          <PlayerAssignmentRow
            key={player.id}
            seasonId={data.season.id}
            player={player}
            assignment={rosterByPlayerId.get(player.id)}
            enrolledOrgs={data.orgAssignments}
            orgCatalog={data.orgCatalog}
            divisions={data.divisions}
          />
        ))}
      </section>
    </div>
  );
}
