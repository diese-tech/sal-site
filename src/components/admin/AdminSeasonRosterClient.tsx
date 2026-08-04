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

type Notice = { tone: "success" | "error"; text: string } | null;

function NoticeText({ notice }: { notice: Notice }) {
  if (!notice) return null;
  if (notice.tone === "success") {
    return <p role="status" className="mt-2 text-xs font-semibold text-emerald-300">{notice.text}</p>;
  }
  return <p role="alert" className="mt-2 text-xs font-semibold text-rose-200">{notice.text}</p>;
}

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

/** Form-state seed for an org row — pure so the mount and re-sync paths share one source of truth. */
export function orgRowFormState(org: Org, assignment?: SeasonOrgAdminAssignment): { divisionId: DivisionId } {
  return { divisionId: assignment?.division_id ?? org.divisionId };
}

/** Changes only when this org's own season assignment changes — a sibling row's refresh must not disturb it. */
export function orgRowSyncKey(assignment?: SeasonOrgAdminAssignment): string {
  if (!assignment) return "unassigned";
  return `${assignment.division_id}`;
}

/** Form-state seed for a player row — mirrors the pre-existing mount-only initializer semantics. */
export function playerRowFormState(
  player: LeaguePlayer,
  assignment?: SeasonRosterAdminAssignment,
): { orgId: string; freeAgentDivision: DivisionId | ""; isCaptain: boolean } {
  return {
    orgId: assignment?.org_id ?? "",
    freeAgentDivision: assignment?.division_id ?? player.divisionId ?? "",
    isCaptain: assignment?.is_captain ?? false,
  };
}

/** Changes only when this player's own season assignment changes. */
export function playerRowSyncKey(assignment?: SeasonRosterAdminAssignment): string {
  if (!assignment) return "unassigned";
  return `${assignment.org_id ?? ""}|${assignment.division_id ?? ""}|${assignment.is_captain}`;
}

// Org notice state lives in the parent (keyed by org id) rather than local useState: enrolling
// or removing an org moves its row between the "Enrolled" and "Available" sections, which are
// separate map() calls over separate lists. React unmounts/remounts the row across that move
// even though the key is unchanged, so row-local state would discard the just-set success
// notice the instant router.refresh() lands.
function OrgAssignmentRow({
  seasonId,
  seasonName,
  org,
  assignment,
  divisions,
  notice,
  setNotice,
}: {
  seasonId: string;
  seasonName: string;
  org: Org;
  assignment?: SeasonOrgAdminAssignment;
  divisions: SeasonRosterAdminData["divisions"];
  notice: Notice;
  setNotice: (notice: Notice) => void;
}) {
  const router = useRouter();
  const syncKey = orgRowSyncKey(assignment);
  const [lastSyncKey, setLastSyncKey] = useState(syncKey);
  const [divisionId, setDivisionId] = useState<DivisionId>(() => orgRowFormState(org, assignment).divisionId);
  const [busy, setBusy] = useState(false);

  if (lastSyncKey !== syncKey) {
    setLastSyncKey(syncKey);
    setDivisionId(orgRowFormState(org, assignment).divisionId);
  }

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      await rosterRequest(seasonId, "POST", { entity: "org", orgId: org.id, divisionId });
      setNotice({ tone: "success", text: assignment ? `Saved ${org.name}.` : `Enrolled ${org.name} in ${seasonName}.` });
      router.refresh();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to save organization." });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setNotice(null);
    try {
      await rosterRequest(seasonId, "DELETE", { entity: "org", orgId: org.id });
      setNotice({ tone: "success", text: `Removed ${org.name} from ${seasonName}.` });
      router.refresh();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Remove players and matches first." });
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
        <button onClick={() => void save()} disabled={busy} className={buttonClass}>{assignment ? "Save" : "Enroll Returning Org"}</button>
        {assignment && (
          <button onClick={() => void remove()} disabled={busy} className="rounded-lg border border-rose-300/25 px-3 py-2 text-xs font-black uppercase text-rose-200 disabled:opacity-50">
            Remove
          </button>
        )}
      </div>
      <NoticeText notice={notice} />
    </div>
  );
}

function PlayerAssignmentRow({
  seasonId,
  seasonName,
  player,
  assignment,
  enrolledOrgs,
  orgCatalog,
  divisions,
}: {
  seasonId: string;
  seasonName: string;
  player: LeaguePlayer;
  assignment?: SeasonRosterAdminAssignment;
  enrolledOrgs: SeasonOrgAdminAssignment[];
  orgCatalog: Org[];
  divisions: SeasonRosterAdminData["divisions"];
}) {
  const router = useRouter();
  const syncKey = playerRowSyncKey(assignment);
  const [lastSyncKey, setLastSyncKey] = useState(syncKey);
  const [orgId, setOrgId] = useState(() => playerRowFormState(player, assignment).orgId);
  const [freeAgentDivision, setFreeAgentDivision] = useState<DivisionId | "">(() => playerRowFormState(player, assignment).freeAgentDivision);
  const [isCaptain, setIsCaptain] = useState(() => playerRowFormState(player, assignment).isCaptain);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  if (lastSyncKey !== syncKey) {
    setLastSyncKey(syncKey);
    const next = playerRowFormState(player, assignment);
    setOrgId(next.orgId);
    setFreeAgentDivision(next.freeAgentDivision);
    setIsCaptain(next.isCaptain);
  }

  const enrolledOrg = enrolledOrgs.find((row) => row.org_id === orgId);
  const orgName = (id: string) => orgCatalog.find((org) => org.id === id)?.name ?? id;
  const displayName = player.displayAlias ?? player.ign;

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      await rosterRequest(seasonId, "POST", {
        entity: "player",
        playerId: player.id,
        orgId: orgId || null,
        divisionId: (enrolledOrg?.division_id ?? freeAgentDivision) || null,
        isCaptain: orgId ? isCaptain : false,
      });
      setNotice({ tone: "success", text: assignment ? `Saved ${displayName}.` : `Enrolled ${displayName} in ${seasonName}.` });
      router.refresh();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to save player." });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setNotice(null);
    try {
      await rosterRequest(seasonId, "DELETE", { entity: "player", playerId: player.id });
      setNotice({ tone: "success", text: `Removed ${displayName} from ${seasonName}.` });
      router.refresh();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to remove player." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/8 bg-black/20 p-3">
      <div className="grid gap-2 lg:grid-cols-[minmax(10rem,1fr)_minmax(11rem,1fr)_minmax(9rem,0.7fr)_auto_auto] lg:items-center">
        <div>
          <p className="font-black text-white">{displayName}</p>
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
          <button onClick={() => void save()} disabled={busy} className={buttonClass}>{assignment ? "Save" : "Enroll Player"}</button>
          {assignment && <button onClick={() => void remove()} disabled={busy} className="rounded-lg border border-rose-300/25 px-3 py-2 text-xs font-black uppercase text-rose-200 disabled:opacity-50">Remove</button>}
        </div>
      </div>
      <NoticeText notice={notice} />
    </div>
  );
}

export function AdminSeasonRosterClient({ data }: { data: SeasonRosterAdminData }) {
  const [search, setSearch] = useState("");
  const [orgNotices, setOrgNotices] = useState<Record<string, Notice>>({});
  const orgAssignmentById = new Map(data.orgAssignments.map((row) => [row.org_id, row]));
  const rosterByPlayerId = new Map(data.rosterAssignments.map((row) => [row.player_id, row]));
  const enrolledOrgs = data.orgCatalog.filter((org) => orgAssignmentById.has(org.id));
  const availableOrgs = data.orgCatalog.filter((org) => !orgAssignmentById.has(org.id));
  const visiblePlayers = data.playerCatalog.filter((player) => {
    const value = `${player.ign} ${player.displayAlias ?? ""} ${player.discordUsername}`.toLowerCase();
    return value.includes(search.trim().toLowerCase());
  });

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-4">
        <p className="text-sm font-semibold text-slate-200">
          Orgs and players are league-wide identities. This screen only controls who is enrolled in <strong className="text-white">{data.season.name}</strong>.
          A team returning from a previous season already exists in the catalog below — <strong className="text-white">enroll it, don&apos;t recreate it</strong> on the Teams screen.
        </p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-black text-white">Enrolled in {data.season.name} ({enrolledOrgs.length})</h2>
          <p className="text-sm font-semibold text-slate-400">Removing a team is blocked while roster or match rows still reference it.</p>
        </div>
        {enrolledOrgs.length === 0 && (
          <p role="status" className="rounded-xl border border-white/8 bg-black/20 p-3 text-sm font-semibold text-slate-500">
            No orgs enrolled yet. Enroll returning orgs from the list below.
          </p>
        )}
        {enrolledOrgs.map((org) => (
          <OrgAssignmentRow
            key={org.id}
            seasonId={data.season.id}
            seasonName={data.season.name}
            org={org}
            assignment={orgAssignmentById.get(org.id)}
            divisions={data.divisions}
            notice={orgNotices[org.id] ?? null}
            setNotice={(notice) => setOrgNotices((prev) => ({ ...prev, [org.id]: notice }))}
          />
        ))}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-black text-white">Available Returning Orgs ({availableOrgs.length})</h2>
          <p className="text-sm font-semibold text-slate-400">These orgs already exist league-wide. Enroll a returning org into {data.season.name} instead of creating a duplicate on the Teams screen.</p>
        </div>
        {availableOrgs.length === 0 && (
          <p role="status" className="rounded-xl border border-white/8 bg-black/20 p-3 text-sm font-semibold text-slate-500">
            Every org in the catalog is enrolled in this season.
          </p>
        )}
        {availableOrgs.map((org) => (
          <OrgAssignmentRow
            key={org.id}
            seasonId={data.season.id}
            seasonName={data.season.name}
            org={org}
            assignment={orgAssignmentById.get(org.id)}
            divisions={data.divisions}
            notice={orgNotices[org.id] ?? null}
            setNotice={(notice) => setOrgNotices((prev) => ({ ...prev, [org.id]: notice }))}
          />
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
            seasonName={data.season.name}
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
