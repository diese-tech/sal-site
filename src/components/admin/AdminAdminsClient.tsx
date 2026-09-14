"use client";

import { useState } from "react";
import type { AdminRole, AdminUserRow } from "@/lib/admin-users";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<AdminRole, string> = {
  admin: "Admin",
  super_admin: "Super Admin",
};

const emptyDraft = () => ({
  discordId: "",
  role: "admin" as AdminRole,
  discordUsername: "",
  displayName: "",
});

export function AdminAdminsClient({
  admins: initial,
  currentDiscordId,
}: {
  admins: AdminUserRow[];
  currentDiscordId: string;
}) {
  const [admins, setAdmins] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  function upsertLocal(admin: AdminUserRow) {
    setAdmins((prev) => {
      const withoutExisting = prev.filter((a) => a.discordId !== admin.discordId);
      return [...withoutExisting, admin].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
  }

  async function saveDraft() {
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/admin/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        discordId: draft.discordId.trim(),
        role: draft.role,
        discordUsername: draft.discordUsername.trim() || undefined,
        displayName: draft.displayName.trim() || undefined,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      upsertLocal(data.admin);
      setAdding(false);
      setDraft(emptyDraft());
      setMessage({ text: `${data.admin.displayName || data.admin.discordId} can now sign in.`, ok: true });
    } else {
      setMessage({ text: data.error ?? "Failed.", ok: false });
    }
    setSaving(false);
  }

  async function changeRole(admin: AdminUserRow, role: AdminRole) {
    if (role === admin.role) return;
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/admin/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        discordId: admin.discordId,
        role,
        discordUsername: admin.discordUsername ?? undefined,
        displayName: admin.displayName ?? undefined,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      upsertLocal(data.admin);
    } else {
      setMessage({ text: data.error ?? "Failed.", ok: false });
    }
    setSaving(false);
  }

  async function removeAdmin(admin: AdminUserRow) {
    const label = admin.displayName || admin.discordUsername || admin.discordId;
    if (!confirm(`Remove ${label}'s admin access? They will no longer be able to sign into /admin.`)) return;
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/admin/admins?discordId=${encodeURIComponent(admin.discordId)}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (res.ok) {
      setAdmins((prev) => prev.filter((a) => a.discordId !== admin.discordId));
      setMessage({ text: `${label} removed.`, ok: true });
    } else {
      setMessage({ text: data.error ?? "Failed.", ok: false });
    }
    setSaving(false);
  }

  return (
    <div>
      <div className="mb-4 space-y-2">
        {admins.map((admin) => {
          const isSelf = admin.discordId === currentDiscordId;
          return (
            <div
              key={admin.discordId}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-slate-950/84 p-3 backdrop-blur"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-black text-white">
                    {admin.displayName || admin.discordUsername || admin.discordId}
                  </p>
                  {isSelf && (
                    <span className="rounded-lg border border-white/15 bg-white/[0.04] px-2 py-0.5 text-[0.6rem] font-black uppercase text-slate-500">
                      You
                    </span>
                  )}
                  {admin.role === "super_admin" && (
                    <span className="rounded-lg border border-red-300/25 bg-red-300/8 px-2 py-0.5 text-[0.6rem] font-black uppercase text-red-400">
                      Super Admin
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600">
                  {admin.discordUsername ? `@${admin.discordUsername} · ` : ""}
                  {admin.discordId}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <select
                  value={admin.role}
                  onChange={(e) => changeRole(admin, e.target.value as AdminRole)}
                  disabled={saving}
                  className="rounded-lg border border-white/10 bg-black/45 px-2.5 py-1 text-[0.65rem] font-black uppercase text-slate-300 focus:outline-none focus:border-cyan-500/40 disabled:opacity-40"
                >
                  {(Object.keys(ROLE_LABEL) as AdminRole[]).map((role) => (
                    <option key={role} value={role}>{ROLE_LABEL[role]}</option>
                  ))}
                </select>
                <button
                  onClick={() => removeAdmin(admin)}
                  disabled={saving || isSelf}
                  title={isSelf ? "Have another super admin remove you" : undefined}
                  className="rounded-lg border border-red-300/20 bg-red-300/8 px-2.5 py-1 text-[0.65rem] font-black uppercase text-red-400 transition hover:bg-red-300/15 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {adding ? (
        <div className="rounded-2xl border border-cyan-300/15 bg-slate-950/84 p-5 backdrop-blur">
          <p className="mb-4 text-sm font-black uppercase text-slate-400">Add Admin</p>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[0.65rem] font-black uppercase text-slate-500">
                Discord ID <span className="normal-case text-slate-600">(17-20 digits, not username)</span>
              </label>
              <input
                type="text"
                value={draft.discordId}
                onChange={(e) => setDraft((d) => ({ ...d, discordId: e.target.value.replace(/\D/g, "") }))}
                placeholder="460242136344821760"
                className="w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-sm font-mono font-semibold text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/40"
              />
              <p className="mt-1 text-[0.65rem] text-slate-600">
                Discord Settings → Advanced → Developer Mode on, then right-click the user → Copy User ID.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[0.65rem] font-black uppercase text-slate-500">Display name (optional)</label>
                <input
                  type="text"
                  value={draft.displayName}
                  onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))}
                  placeholder="For your own reference"
                  className="w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-sm font-semibold text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/40"
                />
              </div>
              <div>
                <label className="mb-1 block text-[0.65rem] font-black uppercase text-slate-500">Role</label>
                <select
                  value={draft.role}
                  onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value as AdminRole }))}
                  className="w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-sm font-semibold text-white focus:outline-none focus:border-cyan-500/40"
                >
                  {(Object.keys(ROLE_LABEL) as AdminRole[]).map((role) => (
                    <option key={role} value={role}>{ROLE_LABEL[role]}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={saveDraft}
              disabled={saving || !/^\d{17,20}$/.test(draft.discordId)}
              className="rounded-xl border border-cyan-300/40 bg-cyan-300/15 px-4 py-2 text-xs font-black uppercase text-cyan-100 transition hover:bg-cyan-300/22 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Add Admin"}
            </button>
            <button
              onClick={() => { setAdding(false); setDraft(emptyDraft()); }}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase text-slate-400 transition hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full rounded-xl border border-dashed border-white/15 bg-transparent py-3 text-xs font-black uppercase text-slate-500 transition hover:border-white/25 hover:text-slate-300"
        >
          + Add admin
        </button>
      )}

      {message && (
        <p className={cn("mt-3 text-xs font-semibold", message.ok ? "text-emerald-400" : "text-red-400")}>
          {message.text}
        </p>
      )}
    </div>
  );
}
