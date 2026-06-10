import type { Match } from "@/types/league";

/** How long before its scheduled start a match may show as live. */
const EARLY_START_MS = 30 * 60 * 1000;
/** How long after its scheduled start a match may keep showing as live. */
const MAX_LIVE_DURATION_MS = 6 * 60 * 60 * 1000;

/**
 * A match counts as live only if its stored status is "live" AND the current
 * time falls inside a window around its scheduled start. This prevents a row
 * left in `live` status (e.g. stale seed data) from advertising a fake LIVE
 * match sitewide indefinitely (issue #112).
 */
export function isMatchLive(match: Match, now: Date = new Date()): boolean {
  if (match.status !== "live") return false;
  const start = new Date(`${match.scheduledDate}T${match.scheduledTime}:00`);
  if (Number.isNaN(start.getTime())) return false;
  const elapsed = now.getTime() - start.getTime();
  return elapsed >= -EARLY_START_MS && elapsed <= MAX_LIVE_DURATION_MS;
}
