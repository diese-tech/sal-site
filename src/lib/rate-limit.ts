// Simple in-memory rate limiter. Provides protection in dev and self-hosted
// deployments. On serverless platforms (Vercel) each function instance has its
// own memory, so this is best-effort — a Redis-backed solution is needed for
// strict per-IP enforcement across instances.

interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10;

export function getRateLimitIdentifier(request: { headers: Headers }): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export function retryAfterSeconds(resetAt: number): string {
  return String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)));
}

export function checkRateLimit(key: string): { allowed: boolean; remaining: number; resetAt: number } {
  // The E2E suite drives every request from one host, so all keys collapse to
  // the ":unknown" identifier and the limiter would lock the whole run out.
  // In test mode only that shared identifier is bypassed — tests that exercise
  // rate limiting send an explicit x-forwarded-for and are still limited.
  // Never set on real deployments.
  if (process.env.E2E_TEST_MODE === "1" && key.endsWith(":unknown")) {
    return { allowed: true, remaining: MAX_ATTEMPTS, resetAt: Date.now() + WINDOW_MS };
  }
  const now = Date.now();
  let entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    store.set(key, entry);
  }

  entry.count++;
  const remaining = Math.max(0, MAX_ATTEMPTS - entry.count);
  return { allowed: entry.count <= MAX_ATTEMPTS, remaining, resetAt: entry.resetAt };
}

export function clearRateLimit(key: string) {
  store.delete(key);
}
