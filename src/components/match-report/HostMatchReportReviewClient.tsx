"use client";

import { useEffect, useRef, useState } from "react";
import { ReviewScreenshotPane } from "@/components/admin/ReviewScreenshotPane";
import { IgnInput, StatInput } from "@/components/admin/stat-inputs";
import type { ExtractedGame, ExtractedPlayer } from "@/types/match-report";
import type {
  HostIdentityStatus,
  HostMatchReportReview,
  HostReviewDiagnostics,
} from "@/types/match-report-host";

interface EditablePlayer extends ExtractedPlayer {
  playerId?: string;
}
interface EditableGame extends Omit<ExtractedGame, "players"> {
  players: EditablePlayer[];
}

type LoadState =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "unavailable"; message: string }
  | { kind: "loaded"; review: HostMatchReportReview };

export function hasBlockingIdentityDiagnostics(diagnostics: HostReviewDiagnostics) {
  return diagnostics.duplicateIgns.length > 0 ||
    diagnostics.unlinkedIgns.length > 0 ||
    diagnostics.ambiguousIgns.length > 0;
}

export function identityStatusesForGame(
  diagnostics: HostReviewDiagnostics,
  gameNumber: number,
) {
  return new Map(
    diagnostics.games
      .find((game) => game.gameNumber === gameNumber)
      ?.players.map((player) => [player.index, player.identityStatus] as const) ?? [],
  );
}

const IDENTITY_STATUS_LABEL: Record<HostIdentityStatus, string> = {
  linked: "Linked",
  duplicate: "Duplicate identity",
  unlinked: "Unlinked identity",
  ambiguous: "Ambiguous identity",
};

export function HostIdentityStatusBadge({ status }: { status: HostIdentityStatus }) {
  const valid = status === "linked";
  return (
    <span
      aria-label={`Identity status: ${IDENTITY_STATUS_LABEL[status]}`}
      className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[0.6rem] font-black uppercase tracking-wide ${
        valid ? "bg-emerald-300/10 text-emerald-200" : "bg-amber-300/10 text-amber-200"
      }`}
    >
      {IDENTITY_STATUS_LABEL[status]}
    </span>
  );
}

export function applyHostScreenshotUpload(
  review: HostMatchReportReview,
  result: { allUrls: string[]; revision: number },
): HostMatchReportReview {
  return {
    ...review,
    report: {
      ...review.report,
      screenshotUrls: result.allUrls,
      revision: result.revision,
      status: "pending",
    },
  };
}

function requestOptions(init: RequestInit = {}): RequestInit {
  return { cache: "no-store", referrerPolicy: "no-referrer", ...init };
}

export function HostMatchReportReviewClient({ reportId }: { reportId: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [games, setGames] = useState<EditableGame[]>([]);
  const [activeGame, setActiveGame] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get("access");
    if (window.location.hash) {
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }
    void exchangeAndLoad(reportId, token, controller.signal).then((next) => {
      if (controller.signal.aborted) return;
      setState(next);
      if (next.kind === "loaded") setGames(next.review.report.games as EditableGame[]);
    });
    return () => controller.abort();
  }, [reportId]);

  const review = state.kind === "loaded" ? state.review : null;
  const diagnostics = review?.report.diagnostics;
  const incomplete = games.some((game) =>
    game.winningSide === "unknown" ||
    game.players.filter((player) => player.side === "home").length !== 5 ||
    game.players.filter((player) => player.side === "away").length !== 5
  );
  const submitted = review?.report.status === "host_review" || review?.report.status === "done";
  const canSubmit = Boolean(
    review && !submitted && !dirty && games.length > 0 && !incomplete &&
    diagnostics && !hasBlockingIdentityDiagnostics(diagnostics),
  );

  if (state.kind === "loading") return <ReviewState title="Opening private review…" />;
  if (state.kind === "not_found") {
    return (
      <ReviewState title="This private match report could not be opened">
        The link may be expired or already used. Return to Discord and click Enter stats for a new link.
      </ReviewState>
    );
  }
  if (state.kind === "unavailable") return <ReviewState title="Review temporarily unavailable">{state.message}</ReviewState>;
  if (!review) return null;

  const game = games[Math.min(activeGame, Math.max(games.length - 1, 0))];

  function updatePlayer(index: number, patch: Partial<EditablePlayer>) {
    setGames((current) => current.map((entry, gameIndex) => gameIndex !== activeGame
      ? entry
      : { ...entry, players: entry.players.map((player, playerIndex) => playerIndex === index ? { ...player, ...patch } : player) }));
    setDirty(true);
  }

  function updateWinner(winningSide: "home" | "away") {
    setGames((current) => current.map((entry, index) => index === activeGame ? { ...entry, winningSide } : entry));
    setDirty(true);
  }

  async function uploadScreenshots() {
    const files = Array.from(fileInput.current?.files ?? []);
    if (files.length === 0) return;
    if (!review) return;
    if (review.report.screenshotUrls.length + files.length > 5) {
      setMessage(`A report can contain at most 5 screenshots. ${review.report.screenshotUrls.length} already uploaded.`);
      return;
    }
    setBusy(true);
    setMessage("");
    let uploadedCount = 0;
    try {
      let result: { allUrls?: string[]; error?: string; revision?: number } = {};
      for (let index = 0; index < files.length; index++) {
        setMessage(`Preparing screenshot ${index + 1} of ${files.length}…`);
        const prepared = await prepareScreenshotForUpload(files[index]!);
        const body = new FormData();
        body.append("screenshots", prepared, prepared.name);
        const response = await fetch(`/api/match-reports/${reportId}/upload`, requestOptions({ method: "POST", body }));
        result = await response.json() as { allUrls?: string[]; error?: string; revision?: number };
        if (!response.ok) throw new Error(result.error ?? `Screenshot ${index + 1} failed to upload.`);
        if (!result.allUrls || result.revision === undefined) {
          throw new Error(`Screenshot ${index + 1} returned an invalid upload receipt.`);
        }
        uploadedCount += 1;
        setState((current) => current.kind === "loaded"
          ? { kind: "loaded", review: applyHostScreenshotUpload(current.review, {
              allUrls: result.allUrls!,
              revision: result.revision!,
            }) }
          : current);
      }
      setMessage(`${files.length} screenshot${files.length === 1 ? "" : "s"} uploaded. Extract them to begin correction.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Upload failed.";
      setMessage(uploadedCount > 0
        ? `${uploadedCount} screenshot${uploadedCount === 1 ? " was" : "s were"} uploaded and retained. ${detail}`
        : detail);
    } finally {
      setBusy(false);
    }
  }

  async function extractScreenshots() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/match-reports/${reportId}/extract`, requestOptions({ method: "POST" }));
      const result = await response.json() as { games?: EditableGame[]; review?: HostMatchReportReview; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Extraction failed.");
      if (result.review) {
        setState({ kind: "loaded", review: result.review });
        setGames(result.review.report.games as EditableGame[]);
      } else if (result.games) {
        setGames(result.games);
      }
      setActiveGame(0);
      setDirty(false);
      setMessage("Extraction complete. Check every player and stat before saving.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Extraction failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveCorrections() {
    if (!review) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/match-reports/${reportId}/revise`, requestOptions({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revision: review.report.revision, games }),
      }));
      const payload = await response.json() as {
        ok?: boolean;
        error?: string;
        result?: { revision: number; status: "review"; games: EditableGame[]; diagnostics: HostReviewDiagnostics };
      };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "Save failed.");
      setGames(payload.result.games);
      setState((current) => current.kind === "loaded" ? {
        kind: "loaded",
        review: {
          ...current.review,
          report: {
            ...current.review.report,
            revision: payload.result!.revision,
            status: payload.result!.status,
            games: payload.result!.games,
            diagnostics: payload.result!.diagnostics,
          },
        },
      } : current);
      setDirty(false);
      setMessage(hasBlockingIdentityDiagnostics(payload.result.diagnostics)
        ? "Saved. Resolve the highlighted identity issues before submitting."
        : "Saved. Every identity is uniquely linked.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitForApproval() {
    if (!review) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/match-reports/${reportId}/submit`, requestOptions({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revision: review.report.revision }),
      }));
      const payload = await response.json() as { error?: string; result?: { revision: number; status: "host_review" } };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "Submit failed.");
      setState((current) => current.kind === "loaded" ? {
        kind: "loaded",
        review: { ...current.review, report: { ...current.review.report, revision: payload.result!.revision, status: payload.result!.status } },
      } : current);
      setMessage("Submitted for admin approval. Approved stats will appear publicly after an admin reviews them.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Submit failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-white/10 bg-slate-950/84 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-cyan-300">Week {review.match.week}</p>
            <h2 className="mt-2 text-2xl font-black text-white">{review.match.home.name} vs {review.match.away.name}</h2>
            <p className="mt-1 text-sm text-slate-400">{review.match.scheduledDate} · {review.match.divisionId}</p>
          </div>
          <span className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-xs font-black uppercase text-cyan-100">
            {submitted ? "Awaiting admin approval" : review.report.status.replaceAll("_", " ")}
          </span>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-400">
          Upload each game scoreboard once, correct the OCR, then submit. An admin makes the final publication decision.
        </p>
      </section>

      {message && <div role="status" className="rounded-xl border border-cyan-300/20 bg-cyan-300/8 px-4 py-3 text-sm text-cyan-100">{message}</div>}

      {!submitted && (
        <section className="rounded-2xl border border-white/10 bg-slate-950/84 p-5">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Scoreboard screenshots</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple className="text-xs text-slate-300" />
            <button type="button" disabled={busy} onClick={uploadScreenshots} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-black uppercase text-white disabled:opacity-50">Upload</button>
            <button type="button" disabled={busy || review.report.screenshotUrls.length === 0} onClick={extractScreenshots} className="rounded-lg border border-cyan-300/35 bg-cyan-300/12 px-3 py-2 text-xs font-black uppercase text-cyan-100 disabled:opacity-50">Extract stats</button>
          </div>
          <p className="mt-2 text-xs text-slate-500">Up to 5 images. Large files are compressed, then uploaded one at a time below the 4 MB request limit.</p>
        </section>
      )}

      {games.length > 0 && (
        <div className="grid gap-5 xl:grid-cols-[minmax(18rem,0.9fr)_minmax(0,1.6fr)] xl:items-start">
          <div className="xl:sticky xl:top-24">
            <ReviewScreenshotPane urls={review.report.screenshotUrls} activeIndex={activeGame} onSelect={setActiveGame} />
          </div>
          <section className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/84 p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap gap-2">
              {games.map((entry, index) => <button key={entry.gameNumber} type="button" onClick={() => setActiveGame(index)} className={`rounded-lg border px-3 py-1.5 text-xs font-black uppercase ${index === activeGame ? "border-cyan-300/45 bg-cyan-300/12 text-cyan-100" : "border-white/10 text-slate-400"}`}>Game {entry.gameNumber}</button>)}
            </div>
            {game && (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-300">
                  Winner:
                  {(["home", "away"] as const).map((side) => <button key={side} type="button" disabled={submitted} onClick={() => updateWinner(side)} className={`rounded border px-2 py-1 uppercase ${game.winningSide === side ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-200" : "border-white/10"}`}>{side === "home" ? review.match.home.tag : review.match.away.tag}</button>)}
                </div>
                {diagnostics && hasBlockingIdentityDiagnostics(diagnostics) && (
                  <IdentityIssueSummary diagnostics={diagnostics} />
                )}
                {(["home", "away"] as const).map((side) => (
                  <PlayerTable
                    key={side}
                    side={side}
                    team={side === "home" ? review.match.home : review.match.away}
                    players={game.players}
                    identityStatuses={diagnostics
                      ? identityStatusesForGame(diagnostics, game.gameNumber)
                      : new Map()}
                    disabled={submitted}
                    updatePlayer={updatePlayer}
                  />
                ))}
              </>
            )}
            {!submitted && (
              <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
                <button type="button" disabled={busy || !dirty} onClick={saveCorrections} className="rounded-lg border border-cyan-300/35 bg-cyan-300/12 px-4 py-2 text-xs font-black uppercase text-cyan-100 disabled:opacity-40">Save and validate</button>
                <button type="button" disabled={busy || !canSubmit} onClick={submitForApproval} className="rounded-lg border border-emerald-300/35 bg-emerald-300/12 px-4 py-2 text-xs font-black uppercase text-emerald-100 disabled:opacity-40">Submit for admin approval</button>
                {(dirty || incomplete || (diagnostics && hasBlockingIdentityDiagnostics(diagnostics))) && <p className="text-xs text-amber-300">Save a complete 5v5 record with every identity uniquely linked before submitting.</p>}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

const HOST_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

async function prepareScreenshotForUpload(file: File): Promise<File> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Screenshots must be PNG, JPEG, or WebP images.");
  }
  if (file.size <= HOST_UPLOAD_MAX_BYTES) return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const candidate = new Image();
      candidate.onload = () => resolve(candidate);
      candidate.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      candidate.src = objectUrl;
    });
    const scale = Math.min(1, 1600 / image.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image compression is unavailable in this browser.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob || blob.size > HOST_UPLOAD_MAX_BYTES) {
      throw new Error(`${file.name} is still larger than 4 MB after compression.`);
    }
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function PlayerTable({ side, team, players, identityStatuses, disabled, updatePlayer }: {
  side: "home" | "away";
  team: HostMatchReportReview["match"]["home"];
  players: EditablePlayer[];
  identityStatuses: Map<number, HostIdentityStatus>;
  disabled: boolean;
  updatePlayer: (index: number, patch: Partial<EditablePlayer>) => void;
}) {
  const rows = players.map((player, index) => ({ player, index })).filter(({ player }) => player.side === side);
  return (
    <div className="mb-5 overflow-x-auto">
      <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-300">{team.name}</p>
      <table className="w-full min-w-[680px] text-left">
        <thead><tr className="text-[0.6rem] uppercase text-slate-500"><th className="pb-2">IGN</th><th>God</th><th>Role</th><th>K</th><th>D</th><th>A</th><th>Damage</th><th>Mitigated</th></tr></thead>
        <tbody>{rows.map(({ player, index }) => (
          <tr key={`${side}-${index}`} className="border-t border-white/5">
            <td className="w-36 py-1 pr-2"><fieldset disabled={disabled}><IgnInput value={player.ign} roster={team.roster} unmatched={(identityStatuses.get(index) ?? (player.playerId ? "linked" : "unlinked")) !== "linked"} label={`${team.tag} player ${index + 1} IGN`} onChange={(ign) => updatePlayer(index, { ign })} onPlayerMatch={(playerId) => updatePlayer(index, { playerId })} /></fieldset><HostIdentityStatusBadge status={identityStatuses.get(index) ?? (player.playerId ? "linked" : "unlinked")} /></td>
            <td className="pr-2"><input disabled={disabled} value={player.god ?? ""} onChange={(event) => updatePlayer(index, { god: event.target.value })} aria-label={`${player.ign} god`} className="w-24 rounded border border-white/10 bg-black/30 px-1.5 py-0.5 text-xs text-white" /></td>
            <td className="pr-2"><input disabled={disabled} value={player.role ?? ""} onChange={(event) => updatePlayer(index, { role: event.target.value })} aria-label={`${player.ign} role`} className="w-20 rounded border border-white/10 bg-black/30 px-1.5 py-0.5 text-xs text-white" /></td>
            <td><StatInput disabled={disabled} value={player.kills} onChange={(kills) => updatePlayer(index, { kills })} label={`${player.ign} kills`} /></td>
            <td><StatInput disabled={disabled} value={player.deaths} onChange={(deaths) => updatePlayer(index, { deaths })} label={`${player.ign} deaths`} /></td>
            <td><StatInput disabled={disabled} value={player.assists} onChange={(assists) => updatePlayer(index, { assists })} label={`${player.ign} assists`} /></td>
            <td><StatInput disabled={disabled} wide value={player.damageDealt} onChange={(damageDealt) => updatePlayer(index, { damageDealt })} label={`${player.ign} damage`} /></td>
            <td><StatInput disabled={disabled} wide value={player.damageMitigated} onChange={(damageMitigated) => updatePlayer(index, { damageMitigated })} label={`${player.ign} mitigated`} /></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function IdentityIssueSummary({ diagnostics }: { diagnostics: HostReviewDiagnostics }) {
  const issues = [
    diagnostics.duplicateIgns.length > 0 ? `Duplicate: ${diagnostics.duplicateIgns.join(", ")}` : null,
    diagnostics.ambiguousIgns.length > 0 ? `Ambiguous: ${diagnostics.ambiguousIgns.join(", ")}` : null,
    diagnostics.unlinkedIgns.length > 0 ? `Unlinked: ${diagnostics.unlinkedIgns.join(", ")}` : null,
  ].filter((issue): issue is string => Boolean(issue));
  return (
    <div role="alert" className="mb-4 rounded-lg border border-amber-300/25 bg-amber-300/8 px-3 py-2 text-xs text-amber-100">
      <span className="font-black">Identity issues:</span> {issues.join(" · ")}
    </div>
  );
}

function ReviewState({ title, children }: { title: string; children?: React.ReactNode }) {
  return <section className="rounded-2xl border border-cyan-300/20 bg-slate-950/84 p-8"><p className="font-mono text-xs font-bold uppercase tracking-widest text-cyan-300">Private match review</p><h2 className="mt-3 text-2xl font-black text-white">{title}</h2>{children && <p className="mt-3 text-sm leading-6 text-slate-400">{children}</p>}</section>;
}

async function exchangeAndLoad(reportId: string, token: string | null, signal: AbortSignal): Promise<LoadState> {
  try {
    if (token) {
      const exchange = await fetch(`/api/match-reports/${reportId}/session`, requestOptions({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
        signal,
      }));
      if (!exchange.ok) return exchange.status === 404 ? { kind: "not_found" } : { kind: "unavailable", message: "The private session could not be created." };
    }
    const response = await fetch(`/api/match-reports/${reportId}`, requestOptions({ signal }));
    const payload = await response.json() as { ok?: boolean; review?: HostMatchReportReview; error?: string };
    if (response.ok && payload.review) return { kind: "loaded", review: payload.review };
    if (response.status === 404) return { kind: "not_found" };
    return { kind: "unavailable", message: payload.error ?? "The review is temporarily unavailable." };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return { kind: "loading" };
    return { kind: "unavailable", message: "The review is temporarily unavailable." };
  }
}
