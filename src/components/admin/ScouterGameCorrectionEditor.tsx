"use client";

import { useRef, useState } from "react";
import {
  scouterCorrectionRequestSchema,
  type ScouterCorrectionGame,
  type ScouterGameCorrectionSnapshot,
} from "@/lib/scouter-corrections";

type Participant = ScouterCorrectionGame["participants"][number];
type NullableNumberKey = {
  [Key in keyof Participant]: Participant[Key] extends number | null ? Key : never;
}[keyof Participant];

const nullableStatFields: Array<{ key: NullableNumberKey; label: string }> = [
  { key: "playerLevel", label: "Level" },
  { key: "gpm", label: "GPM" },
  { key: "playerDamage", label: "Player damage" },
  { key: "minionDamage", label: "Minion damage" },
  { key: "jungleDamage", label: "Jungle damage" },
  { key: "structureDamage", label: "Structure damage" },
  { key: "damageTaken", label: "Damage taken" },
  { key: "damageMitigated", label: "Damage mitigated" },
  { key: "selfHealing", label: "Self healing" },
  { key: "allyHealing", label: "Ally healing" },
  { key: "wardsPlaced", label: "Wards placed" },
];

const roles = ["solo", "jungle", "mid", "support", "carry"] as const;

export function ScouterGameCorrectionEditor({
  snapshot,
}: {
  snapshot: ScouterGameCorrectionSnapshot;
}) {
  const [game, setGame] = useState<ScouterCorrectionGame>(() =>
    structuredClone(snapshot.game),
  );
  const [revision, setRevision] = useState(snapshot.revision);
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const correctionKey = useRef<string | null>(null);

  function updateGame(change: Partial<ScouterCorrectionGame>) {
    setGame((current) => ({ ...current, ...change }));
    setConfirming(false);
    setSuccess(null);
  }

  function updateParticipant(index: number, change: Partial<Participant>) {
    setGame((current) => ({
      ...current,
      participants: current.participants.map((participant, participantIndex) =>
        participantIndex === index ? { ...participant, ...change } : participant,
      ),
    }));
    setConfirming(false);
    setSuccess(null);
  }

  async function save() {
    const key = correctionKey.current ?? crypto.randomUUID();
    correctionKey.current = key;
    const input = {
      expectedRevision: revision,
      correctionKey: key,
      reason,
      game,
    };
    const parsed = scouterCorrectionRequestSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Review the correction fields.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/scouters/games/${encodeURIComponent(snapshot.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; revision?: number; correctionId?: string }
        | null;
      if (!response.ok || !payload?.revision) {
        throw new Error(payload?.error || "The scouter correction could not be saved.");
      }

      setRevision(payload.revision);
      setSuccess(
        `Correction ${payload.correctionId ?? "receipt"} saved at revision ${payload.revision}.`,
      );
      setReason("");
      setConfirming(false);
      correctionKey.current = null;
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The scouter correction could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.04] p-5">
        <h2 className="text-sm font-black uppercase tracking-wider text-cyan-100">
          Original OCR evidence
        </h2>
        <p className="mt-2 text-xs text-slate-400">
          Compare both stored screenshots with every editable value. The links expire
          after one hour; refreshing this page creates new signed links.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <EvidenceLink label="Original scoreboard" href={snapshot.scoreboardImageUrl} />
          <EvidenceLink label="Original details" href={snapshot.detailsImageUrl} />
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            label="SMITE match ID"
            value={game.smiteMatchId ?? ""}
            onChange={(value) => updateGame({ smiteMatchId: value || null })}
          />
          <TextField
            label="Game mode"
            value={game.gameMode ?? ""}
            onChange={(value) => updateGame({ gameMode: value || null })}
          />
          <label className="block text-xs font-bold text-slate-300">
            Winning side
            <select
              value={game.winningSide}
              onChange={(event) =>
                updateGame({ winningSide: event.target.value as "order" | "chaos" })
              }
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
            >
              <option value="order">Order</option>
              <option value="chaos">Chaos</option>
            </select>
          </label>
          <NumberField
            label="Match length (seconds)"
            value={game.matchLengthSeconds}
            onChange={(value) => updateGame({ matchLengthSeconds: value })}
          />
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-black text-white">Review all ten rows</h2>
          <p className="mt-1 text-xs text-slate-400">
            Names do not create players. Choose an existing player explicitly, or keep
            the OCR name unlinked and receipt-only.
          </p>
        </div>
        <div className="space-y-4">
          {game.participants.map((participant, index) => (
            <fieldset
              key={participant.id}
              className="rounded-2xl border border-white/10 bg-slate-950/70 p-5"
            >
              <legend className="px-2 text-sm font-black text-white">
                {index + 1}. {participant.rawIgn} · {participant.side}
              </legend>
              <p className="mb-4 text-xs text-slate-500">
                Current player damage: {participant.playerDamage?.toLocaleString("en-US") ?? "Not captured"}
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="block text-xs font-bold text-slate-300">
                  Side
                  <select
                    value={participant.side}
                    onChange={(event) =>
                      updateParticipant(index, {
                        side: event.target.value as "order" | "chaos",
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
                  >
                    <option value="order">Order</option>
                    <option value="chaos">Chaos</option>
                  </select>
                </label>
                <TextField
                  label="Displayed IGN"
                  value={participant.rawIgn}
                  onChange={(rawIgn) => updateParticipant(index, { rawIgn })}
                />
                <label className="block text-xs font-bold text-slate-300">
                  Linked player
                  <select
                    value={participant.playerId ?? ""}
                    onChange={(event) =>
                      updateParticipant(index, { playerId: event.target.value || null })
                    }
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
                  >
                    <option value="">Unlinked / receipt-only</option>
                    {snapshot.players.map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.ign} · @{player.discordUsername} · {player.status} · {player.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-bold text-slate-300">
                  God
                  <select
                    value={participant.godId ?? ""}
                    onChange={(event) =>
                      updateParticipant(index, { godId: event.target.value || null })
                    }
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
                  >
                    <option value="">Unknown</option>
                    {snapshot.gods.map((god) => (
                      <option key={god.id} value={god.id}>{god.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-bold text-slate-300">
                  Role
                  <select
                    value={participant.role ?? ""}
                    onChange={(event) =>
                      updateParticipant(index, {
                        role: (event.target.value || null) as Participant["role"],
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
                  >
                    <option value="">Unknown</option>
                    {roles.map((role) => <option key={role} value={role}>{role}</option>)}
                  </select>
                </label>
                {(["kills", "deaths", "assists"] as const).map((key) => (
                  <NumberField
                    key={key}
                    label={key.charAt(0).toUpperCase() + key.slice(1)}
                    value={participant[key]}
                    required
                    onChange={(value) => updateParticipant(index, { [key]: value ?? 0 })}
                  />
                ))}
                {nullableStatFields.map((field) => (
                  <NumberField
                    key={field.key}
                    label={field.label}
                    value={participant[field.key]}
                    onChange={(value) => updateParticipant(index, { [field.key]: value })}
                  />
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.05] p-5">
        <label className="block text-xs font-bold text-amber-100">
          Correction reason
          <textarea
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setConfirming(false);
            }}
            maxLength={1000}
            rows={4}
            placeholder="Explain exactly what the OCR misread and what evidence you checked."
            className="mt-1 w-full resize-y rounded-lg border border-amber-300/20 bg-black/30 px-3 py-2 text-white placeholder:text-slate-600"
          />
        </label>
        <p className="mt-3 text-xs text-amber-100/80">
          Saving atomically replaces the complete game, records your Discord identity,
          preserves immutable before/after values, and increments revision {revision}.
        </p>
        {confirming ? (
          <div className="mt-4 rounded-xl border border-red-300/30 bg-red-300/10 p-4">
            <p className="text-sm font-black text-red-100">
              Confirm the screenshots and all ten rows match.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy || !reason.trim()}
                className="rounded-lg bg-red-300 px-4 py-2 text-xs font-black uppercase text-slate-950 disabled:opacity-50"
              >
                {busy ? "Saving..." : "Apply audited correction"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="rounded-lg border border-white/15 px-4 py-2 text-xs font-black uppercase text-slate-200 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setConfirming(true);
            }}
            disabled={!reason.trim()}
            className="mt-4 rounded-lg bg-amber-300 px-4 py-2 text-xs font-black uppercase text-slate-950 disabled:opacity-50"
          >
            Review correction
          </button>
        )}
        {error ? <p role="alert" className="mt-3 text-sm font-bold text-red-300">{error}</p> : null}
        {success ? <p className="mt-3 text-sm font-bold text-emerald-300">{success}</p> : null}
      </section>
    </div>
  );
}

function EvidenceLink({ label, href }: { label: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="group block">
      <span className="mb-2 block text-xs font-black uppercase text-cyan-200 group-hover:text-white">
        {label} ↗
      </span>
      {/* These are short-lived service-role signed URLs, never public bucket URLs. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs cannot be allowlisted for Next Image. */}
      <img src={href} alt={label} className="max-h-80 w-full rounded-xl border border-white/10 object-contain" />
    </a>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-bold text-slate-300">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  required = false,
  onChange,
}: {
  label: string;
  value: number | null;
  required?: boolean;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="block text-xs font-bold text-slate-300">
      {label}
      <input
        type="number"
        min={0}
        step={1}
        required={required}
        value={value ?? ""}
        onChange={(event) =>
          onChange(event.target.value === "" ? null : Number(event.target.value))
        }
        className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 tabular-nums text-white"
      />
    </label>
  );
}
