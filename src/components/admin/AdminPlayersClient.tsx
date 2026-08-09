"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { DivisionId, LeagueData, LeaguePlayer } from "@/types/league";
import type { PlayerRole, PlayerStatus } from "@/types/card-lab";
import { cn } from "@/lib/utils";
import type { PlayerMergePreview } from "@/lib/player-merge";

const roles: PlayerRole[] = ["Solo", "Jungle", "Mid", "Carry", "Support", "Flex"];

type Notice = { tone: "success" | "error"; text: string } | null;

const mergeCountLabels: Record<string, string> = {
  players: "Player identities",
  seasonRosters: "Roster assignments",
  organizationCaptainLinks: "Organization captain links",
  pendingStatRecords: "Pending stat records",
  registrations: "Registration rows",
  playerMatchStats: "Match-report stats",
  playerStats: "Official player stats",
  draftPicks: "Draft picks",
  draftShortlists: "Captain shortlist rows",
  captainTokens: "Captain access tokens",
  godPicks: "God picks",
  godBans: "God bans",
  standings: "Standing rows",
  scouterParticipants: "Scouter participants",
  immutableAuditLogs: "Audit logs (preserved)",
  immutableAdminAuditLogs: "Admin audit logs (preserved)",
  immutableOutboxEvents: "Outbox evidence (preserved)",
  immutableScouterCorrections: "Scouter corrections (preserved)",
};

export function getPlayerMergeTargets(players: LeaguePlayer[], sourcePlayerId: string): LeaguePlayer[] {
  return players.filter((player) => (
    player.id !== sourcePlayerId
    && !player.archivedAt
    && !player.deletionScheduledAt
  ));
}

export function canApplyPlayerMerge(
  preview: PlayerMergePreview | null,
  sourcePlayerId: string,
  targetPlayerId: string,
  confirmation: string,
): boolean {
  return !!preview?.canMerge
    && preview.source?.id === sourcePlayerId
    && preview.target?.id === targetPlayerId
    && confirmation === "MERGE";
}

export function playerMergeSuccessMessage(
  sourceName: string,
  targetName: string,
  code: "merged" | "already_merged",
  warning?: string | null,
): string {
  const message = code === "already_merged"
    ? `${sourceName} was already merged into ${targetName}.`
    : `Merged ${sourceName} into ${targetName}.`;
  return warning ? `${message} ${warning}` : message;
}

function playerMergeTargetLabel(player: LeaguePlayer, orgs: LeagueData["orgs"]): string {
  const orgName = orgs.find((org) => org.id === player.orgId)?.name ?? "Free agent";
  const division = player.divisionId
    ? player.divisionId.charAt(0).toUpperCase() + player.divisionId.slice(1)
    : "No division";
  const rosterRole = player.isCaptain ? "Captain" : player.isStarter ? "Starter" : "Sub";
  const claimState = player.profileClaimed ? "Claimed" : "Unclaimed";
  const discordState = player.hasDiscordId ? "Discord linked" : "Discord not linked";
  return `${player.ign} (@${player.discordUsername}) · ${orgName} · ${division} · ${rosterRole} · ${claimState} · ${discordState} · ${player.id}`;
}

function mergeIdentityDetails(
  identity: NonNullable<PlayerMergePreview["source"]>,
  orgs: LeagueData["orgs"],
): string[] {
  const orgName = orgs.find((org) => org.id === identity.orgId)?.name ?? "Free agent";
  const division = identity.divisionId
    ? identity.divisionId.charAt(0).toUpperCase() + identity.divisionId.slice(1)
    : "No division";
  return [
    orgName,
    division,
    identity.isCaptain ? "Captain" : identity.isStarter ? "Starter" : "Sub",
    identity.profileClaimed ? "Profile claimed" : "Profile unclaimed",
    identity.hasDiscordId ? "Discord linked" : "Discord not linked",
  ];
}

export function PlayerMergePreviewSummary({
  preview,
  orgs,
}: {
  preview: PlayerMergePreview;
  orgs: LeagueData["orgs"];
}) {
  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-black/25 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          { label: "Duplicate", player: preview.source },
          { label: "Canonical", player: preview.target },
        ].map(({ label, player }) => (
          <div key={label} className="rounded-lg border border-white/8 bg-black/20 p-3">
            <p className="text-[0.6rem] font-black uppercase text-slate-500">{label}</p>
            <p className="font-black text-white">{player?.ign ?? "Unavailable"}</p>
            {player && (
              <>
                <p className="text-xs font-semibold text-slate-500">@{player.discordUsername} · {player.id}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {mergeIdentityDetails(player, orgs).map((detail) => (
                    <span key={detail} className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[0.6rem] font-black uppercase text-slate-300">
                      {detail}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="grid gap-1 text-xs font-semibold text-slate-300 sm:grid-cols-2">
        {Object.entries(preview.counts).filter(([, count]) => count > 0).map(([key, count]) => (
          <p key={key}>{mergeCountLabels[key] ?? key}: <strong className="text-white">{count}</strong></p>
        ))}
      </div>
      {preview.blockers.length > 0 ? (
        <div role="alert" className="rounded-lg border border-rose-300/25 bg-rose-300/5 p-3 text-xs font-semibold text-rose-200">
          {preview.blockers.map((blocker, index) => (
            <p key={`${preview.blockerCodes[index] ?? "BLOCKED"}:${blocker}`}>
              {preview.blockerCodes[index] ? `[${preview.blockerCodes[index]}] ` : ""}{blocker}
            </p>
          ))}
        </div>
      ) : (
        <p role="status" className="text-xs font-semibold text-emerald-300">No merge blockers found.</p>
      )}
    </div>
  );
}

function emptyPlayer(): LeaguePlayer {
  return {
    id: crypto.randomUUID(),
    ign: "",
    discordUsername: "",
    primaryRole: "Flex",
    secondaryRoles: [],
    status: "free-agent",
    isStarter: false,
    isCaptain: false,
    avatarInitials: "",
    avatarGradient: "",
  };
}

export function AdminPlayersClient({
  data,
  isSuperAdmin = false,
  initialMergePlayerId,
}: {
  data: LeagueData;
  isSuperAdmin?: boolean;
  initialMergePlayerId?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<LeaguePlayer | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [confirmScheduleId, setConfirmScheduleId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(() => {
    if (!isSuperAdmin) return null;
    const initial = data.players.find((player) => (
      player.id === initialMergePlayerId
      && !player.archivedAt
      && !player.deletionScheduledAt
    ));
    return initial?.id ?? null;
  });
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergePreview, setMergePreview] = useState<PlayerMergePreview | null>(null);
  const [mergeConfirmation, setMergeConfirmation] = useState("");
  const [mergeBusy, setMergeBusy] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [divFilter, setDivFilter] = useState<DivisionId | "all">("all");
  const [orgFilter, setOrgFilter] = useState<string | "all">("all");

  const getOrg = (id?: string) => data.orgs.find((org) => org.id === id);
  // An org can field a team in multiple divisions, so data.orgs can carry more than one
  // row per org id. Team selection here is independent of the separate Division field,
  // so dedupe to one entry per org for the picker and filter chips.
  const uniqueOrgs = useMemo(() => {
    const byId = new Map(data.orgs.map((org) => [org.id, org]));
    return [...byId.values()];
  }, [data.orgs]);

  const activePlayers = data.players.filter((p) => !p.archivedAt);
  const archivedPlayers = data.players.filter((p) => !!p.archivedAt);
  const mergeSource = isSuperAdmin
    ? activePlayers.find((player) => player.id === mergeSourceId)
    : undefined;
  const mergeTargets = mergeSource ? getPlayerMergeTargets(activePlayers, mergeSource.id) : [];

  const q = search.toLowerCase();
  const filtered = activePlayers.filter((p) => {
    if (divFilter !== "all" && p.divisionId !== divFilter) return false;
    if (orgFilter !== "all" && (orgFilter === "__free_agent__" ? !!p.orgId : p.orgId !== orgFilter)) return false;
    if (q && !p.ign.toLowerCase().includes(q) && !p.discordUsername.toLowerCase().includes(q)) return false;
    return true;
  });

  function openEdit(player: LeaguePlayer) {
    setEditing({ ...player });
    setIsNew(false);
    setNotice(null);
  }

  function openNew() {
    setEditing(emptyPlayer());
    setIsNew(true);
    setNotice(null);
  }

  function openMerge(player: LeaguePlayer) {
    setMergeSourceId(player.id);
    setMergeTargetId("");
    setMergePreview(null);
    setMergeConfirmation("");
    setEditing(null);
    setNotice(null);
  }

  function closeMerge() {
    setMergeSourceId(null);
    setMergeTargetId("");
    setMergePreview(null);
    setMergeConfirmation("");
  }

  async function previewMerge() {
    if (!mergeSource || !mergeTargetId) return;
    setMergeBusy(true);
    setMergePreview(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/players/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          sourcePlayerId: mergeSource.id,
          targetPlayerId: mergeTargetId,
        }),
      });
      const payload = await response.json().catch(() => null) as {
        error?: string;
        preview?: PlayerMergePreview;
      } | null;
      if (!response.ok || !payload?.preview) {
        setNotice({ tone: "error", text: payload?.error ?? "Unable to preview player merge." });
        return;
      }
      setMergePreview(payload.preview);
    } catch {
      setNotice({ tone: "error", text: "Unable to preview player merge." });
    } finally {
      setMergeBusy(false);
    }
  }

  async function applyMerge() {
    if (!mergeSource || !canApplyPlayerMerge(
      mergePreview,
      mergeSource.id,
      mergeTargetId,
      mergeConfirmation,
    )) return;
    const target = data.players.find((player) => player.id === mergeTargetId);
    if (!target) return;

    setMergeBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/players/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply",
          sourcePlayerId: mergeSource.id,
          targetPlayerId: target.id,
          confirmation: mergeConfirmation,
        }),
      });
      const payload = await response.json().catch(() => null) as {
        error?: string;
        code?: "merged" | "already_merged";
        warning?: string | null;
      } | null;
      if (!response.ok || !payload?.code) {
        setNotice({ tone: "error", text: payload?.error ?? "Unable to merge players." });
        return;
      }
      const successText = playerMergeSuccessMessage(
        mergeSource.ign,
        target.ign,
        payload.code,
        payload.warning,
      );
      closeMerge();
      setNotice({ tone: "success", text: successText });
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: "Unable to merge players." });
    } finally {
      setMergeBusy(false);
    }
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    setNotice(null);
    const status: PlayerStatus = editing.orgId ? "org-affiliated" : editing.status;
    // An org can field a team in multiple divisions, so its divisionId is no longer a
    // stand-in for "the" division of a team assignment — always trust the explicit
    // Division field the admin selected instead of deriving it from the chosen org.
    const payload: LeaguePlayer = {
      ...editing,
      orgId: editing.orgId || undefined,
      divisionId: editing.orgId ? (editing.divisionId ?? "solar") : editing.divisionId,
      status,
    };
    const wasNew = isNew;
    const playerName = payload.ign || "player";
    const res = await fetch("/api/admin/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const json = await res.json().catch(() => null) as { error?: string } | null;
      setNotice({ tone: "error", text: json?.error ? `Save failed: ${json.error}` : "Save failed. Check Supabase env and admin session." });
      return;
    }
    setEditing(null);
    setNotice({ tone: "success", text: wasNew ? `Created ${playerName}.` : `Saved ${playerName}.` });
    router.refresh();
  }

  async function doArchive(player: LeaguePlayer, unarchive = false) {
    setActionLoadingId(player.id);
    setNotice(null);
    const res = await fetch(`/api/admin/players/${player.id}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unarchive }),
    });
    setActionLoadingId(null);
    if (!res.ok) {
      const json = await res.json().catch(() => null) as { error?: string } | null;
      setNotice({ tone: "error", text: json?.error ?? "Archive action failed." });
      return;
    }
    setNotice({ tone: "success", text: unarchive ? `Unarchived ${player.ign}.` : `Archived ${player.ign}.` });
    router.refresh();
  }

  async function doScheduleDelete(player: LeaguePlayer) {
    setActionLoadingId(player.id);
    setConfirmScheduleId(null);
    setNotice(null);
    const res = await fetch(`/api/admin/players/${player.id}/schedule-delete`, { method: "POST" });
    setActionLoadingId(null);
    if (!res.ok) {
      const json = await res.json().catch(() => null) as { error?: string } | null;
      setNotice({ tone: "error", text: json?.error ?? "Schedule delete failed." });
      return;
    }
    setNotice({ tone: "success", text: `Scheduled ${player.ign} for deletion.` });
    router.refresh();
  }

  const freeAgentStatuses: PlayerStatus[] = ["free-agent", "drafted", "queued-ghost", "active"];

  function renderPlayerCard(player: LeaguePlayer, archived = false) {
    const isScheduled = !!player.deletionScheduledAt;
    return (
      <div
        key={player.id}
        className={cn(
          "rounded-2xl border bg-slate-950/70 p-4",
          isScheduled ? "border-red-400/25 bg-red-950/10" : archived ? "border-white/5" : "border-white/8",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <button onClick={() => openEdit(player)} className="min-w-0 flex-1 text-left hover:opacity-80">
            <div className="flex items-center gap-2">
              <p className="truncate font-black text-white">{player.ign}</p>
              {archived && (
                <span className="rounded border border-slate-500/40 bg-slate-500/10 px-1.5 py-0.5 text-[0.55rem] font-black uppercase text-slate-400">Archived</span>
              )}
              {isScheduled && (
                <span className="rounded border border-red-400/40 bg-red-400/10 px-1.5 py-0.5 text-[0.55rem] font-black uppercase text-red-400">Pending Delete</span>
              )}
            </div>
            <p className="truncate text-xs font-semibold text-slate-500">@{player.discordUsername}</p>
            <p className="mt-1.5 text-xs font-semibold text-slate-400">
              {getOrg(player.orgId)?.name ?? "Free agent"} · {player.isCaptain ? "Captain" : player.isStarter ? "Starter" : "Sub"}
            </p>
          </button>
          <span className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[0.65rem] font-black uppercase text-cyan-100 shrink-0">
            {player.primaryRole}
          </span>
        </div>

        {/* Superadmin actions */}
        {isSuperAdmin && (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/5 pt-3">
            {!archived && !isScheduled && (
              <button
                onClick={() => openMerge(player)}
                className="rounded-lg border border-violet-300/25 px-2.5 py-1 text-[0.65rem] font-black uppercase text-violet-200 transition hover:border-violet-300/50"
              >
                Merge Duplicate
              </button>
            )}
            {!archived ? (
              <button
                onClick={() => void doArchive(player)}
                disabled={actionLoadingId === player.id}
                className="rounded-lg border border-amber-400/25 px-2.5 py-1 text-[0.65rem] font-black uppercase text-amber-400/70 transition hover:border-amber-400/50 hover:text-amber-300 disabled:opacity-50"
              >
                {actionLoadingId === player.id ? "…" : "Archive"}
              </button>
            ) : (
              <button
                onClick={() => void doArchive(player, true)}
                disabled={actionLoadingId === player.id}
                className="rounded-lg border border-emerald-400/25 px-2.5 py-1 text-[0.65rem] font-black uppercase text-emerald-400/70 transition hover:border-emerald-400/50 hover:text-emerald-300 disabled:opacity-50"
              >
                {actionLoadingId === player.id ? "…" : "Unarchive"}
              </button>
            )}
            {!isScheduled ? (
              confirmScheduleId === player.id ? (
                <div className="flex gap-1">
                  <button
                    onClick={() => void doScheduleDelete(player)}
                    disabled={actionLoadingId === player.id}
                    className="rounded-lg border border-red-400/40 bg-red-400/10 px-2.5 py-1 text-[0.65rem] font-black uppercase text-red-300 transition hover:bg-red-400/20 disabled:opacity-50"
                  >
                    Confirm Schedule Delete
                  </button>
                  <button
                    onClick={() => setConfirmScheduleId(null)}
                    className="rounded-lg border border-white/10 px-2.5 py-1 text-[0.65rem] font-black uppercase text-slate-500 transition hover:text-slate-300"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmScheduleId(player.id)}
                  className="rounded-lg border border-red-400/20 px-2.5 py-1 text-[0.65rem] font-black uppercase text-red-400/60 transition hover:border-red-400/40 hover:text-red-300"
                >
                  Schedule Delete
                </button>
              )
            ) : null}
          </div>
        )}
      </div>
    );
  }

  const rosterHref = `/admin/seasons/${encodeURIComponent(data.season.id)}/roster`;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-4">
        <p className="text-sm font-semibold text-slate-200">
          This screen edits league-wide player identities. Season membership — which team a player is on, and who is captain —
          is decided per season. A returning player&apos;s org should be <strong className="text-white">enrolled into the season, not recreated here</strong>.
        </p>
        <Link href={rosterHref} className="mt-2 inline-block text-sm font-black uppercase text-cyan-300 hover:text-cyan-100">
          Manage {data.season.name} Roster →
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-400">
            {activePlayers.length} active · {filtered.length} shown
            {archivedPlayers.length > 0 && ` · ${archivedPlayers.length} archived`}
          </p>
          {notice && (
            <p role={notice.tone === "success" ? "status" : "alert"} className={cn("mt-1 text-sm font-semibold", notice.tone === "success" ? "text-emerald-300" : "text-orange-200")}>
              {notice.text}
            </p>
          )}
        </div>
        {isSuperAdmin && (
          <button onClick={openNew} className="rounded-xl border border-cyan-300/35 bg-cyan-300/15 px-4 py-2 text-sm font-black uppercase text-cyan-100 transition hover:bg-cyan-300/20">
            + New Player
          </button>
        )}
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search IGN or Discord…"
          className="rounded-xl border border-white/10 bg-black/45 px-3 py-1.5 text-sm font-semibold text-white placeholder-slate-500 outline-none focus:border-cyan-300/50"
        />
        <span className="w-px self-stretch bg-white/10" />
        {(["all", "terra", "solar", "lunar"] as const).map((d) => (
          <FilterChip key={d} active={divFilter === d} onClick={() => setDivFilter(d)}>
            {d === "all" ? "All Divisions" : d.charAt(0).toUpperCase() + d.slice(1)}
          </FilterChip>
        ))}
        <span className="w-px self-stretch bg-white/10" />
        <FilterChip active={orgFilter === "all"} onClick={() => setOrgFilter("all")}>All Teams</FilterChip>
        <FilterChip active={orgFilter === "__free_agent__"} onClick={() => setOrgFilter("__free_agent__")}>Free Agents</FilterChip>
        {uniqueOrgs.filter((o) => !o.archivedAt).map((org) => (
          <FilterChip key={org.id} active={orgFilter === org.id} onClick={() => setOrgFilter(org.id)}>{org.tag}</FilterChip>
        ))}
      </div>

      {mergeSource && (
        <div className="rounded-2xl border border-violet-300/25 bg-slate-950/84 p-4 shadow-xl shadow-violet-950/20">
          <p className="text-xs font-black uppercase text-violet-200">Merge duplicate player</p>
          <h2 className="mt-1 text-lg font-black text-white">Move {mergeSource.ign} into a canonical player identity</h2>
          <p className="mt-1 text-sm font-semibold text-slate-400">
            The canonical profile wins. Live account, roster, draft, match, and statistics references move in one database transaction.
          </p>
          <p className="mt-2 text-xs font-semibold text-amber-200">
            Review both directions carefully: the linked Discord profile is not always the identity with the competitive history.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Canonical player identity">
              <select
                aria-label="Canonical player identity"
                value={mergeTargetId}
                onChange={(event) => {
                  setMergeTargetId(event.target.value);
                  setMergePreview(null);
                  setMergeConfirmation("");
                }}
                className={inputClass}
              >
                <option value="">Select the identity to keep</option>
                {mergeTargets.map((player) => (
                  <option key={player.id} value={player.id}>{playerMergeTargetLabel(player, data.orgs)}</option>
                ))}
              </select>
            </Field>
            <button
              onClick={() => void previewMerge()}
              disabled={!mergeTargetId || mergeBusy}
              className="rounded-xl border border-violet-300/35 bg-violet-300/15 px-4 py-2 text-sm font-black uppercase text-violet-100 disabled:opacity-50"
            >
              {mergeBusy ? "Checking…" : "Preview Merge"}
            </button>
          </div>
          {mergePreview && (
            <div className="mt-4">
              <PlayerMergePreviewSummary preview={mergePreview} orgs={data.orgs} />
            </div>
          )}
          {mergePreview?.canMerge && (
            <div className="mt-4">
              <Field label="Type MERGE to confirm permanent deletion of the duplicate">
                <input
                  aria-label="Merge confirmation"
                  value={mergeConfirmation}
                  onChange={(event) => setMergeConfirmation(event.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
          )}
          <div className="mt-4 flex gap-2">
            {mergePreview?.canMerge && (
              <button
                onClick={() => void applyMerge()}
                disabled={mergeBusy || !canApplyPlayerMerge(
                  mergePreview,
                  mergeSource.id,
                  mergeTargetId,
                  mergeConfirmation,
                )}
                className="rounded-xl border border-rose-300/35 bg-rose-300/15 px-4 py-2 text-sm font-black uppercase text-rose-100 disabled:opacity-50"
              >
                Merge and Delete Duplicate
              </button>
            )}
            <button
              onClick={closeMerge}
              disabled={mergeBusy}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-black uppercase text-slate-300 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Edit / New panel */}
      {editing && (
        <div className="rounded-2xl border border-emerald-300/20 bg-slate-950/84 p-4 shadow-xl shadow-emerald-950/20">
          <p className="mb-3 text-xs font-black uppercase text-slate-400">{isNew ? "New Player" : `Editing: ${editing.ign || "…"}`}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="IGN">
              <input value={editing.ign} onChange={(e) => setEditing({ ...editing, ign: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Discord">
              <input value={editing.discordUsername} onChange={(e) => setEditing({ ...editing, discordUsername: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Team">
              <select value={editing.orgId ?? ""} onChange={(e) => setEditing({ ...editing, orgId: e.target.value || undefined })} className={inputClass}>
                <option value="">Free agent</option>
                {uniqueOrgs.filter((o) => !o.archivedAt).map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
              </select>
            </Field>
            <Field label="Division">
              <select value={editing.divisionId ?? "solar"} onChange={(e) => setEditing({ ...editing, divisionId: e.target.value as DivisionId })} className={inputClass}>
                {data.divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Primary role">
              <select value={editing.primaryRole} onChange={(e) => setEditing({ ...editing, primaryRole: e.target.value as PlayerRole })} className={inputClass}>
                {roles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            {editing.orgId ? (
              <Field label="Status">
                <div className={cn(inputClass, "flex items-center text-slate-400")}>org-affiliated (auto)</div>
              </Field>
            ) : (
              <Field label="Status">
                <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as PlayerStatus })} className={inputClass}>
                  {freeAgentStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            )}
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-black uppercase text-slate-300">
              <input type="checkbox" checked={editing.isStarter} onChange={(e) => setEditing({ ...editing, isStarter: e.target.checked })} />
              Starter
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-black uppercase text-slate-300">
              <input type="checkbox" checked={editing.isCaptain} onChange={(e) => setEditing({ ...editing, isCaptain: e.target.checked })} />
              Captain
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => void save()} disabled={saving} className="rounded-xl border border-emerald-300/35 bg-emerald-300/15 px-4 py-2 text-sm font-black uppercase text-emerald-100 disabled:opacity-60">
              {saving ? "Saving..." : isNew ? "Create Player" : "Save Player"}
            </button>
            <button onClick={() => setEditing(null)} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-black uppercase text-slate-300">Cancel</button>
          </div>
        </div>
      )}

      {/* Active players grid */}
      <div className="grid gap-3 lg:grid-cols-2">
        {filtered.length === 0 && (
          <p className="col-span-2 py-6 text-center text-sm font-semibold text-slate-500">No players match the current filters.</p>
        )}
        {filtered.map((p) => renderPlayerCard(p))}
      </div>

      {/* Archived players (collapsible) */}
      {archivedPlayers.length > 0 && (
        <div>
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-slate-500 transition hover:text-slate-300"
          >
            <span>{showArchived ? "▾" : "▸"}</span>
            Archived Players ({archivedPlayers.length})
          </button>
          {showArchived && (
            <div className="grid gap-3 lg:grid-cols-2">
              {archivedPlayers.map((p) => renderPlayerCard(p, true))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const inputClass = "w-full rounded-lg border border-white/10 bg-black/45 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-cyan-300/50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[0.65rem] font-black uppercase text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn("rounded-full border px-3 py-1 text-[0.65rem] font-black uppercase transition", active ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100" : "border-white/10 bg-white/[0.04] text-slate-400 hover:text-slate-200")}>
      {children}
    </button>
  );
}
