// Lightweight server-side error reporting (#80). Posts failures to a Discord
// webhook channel when DISCORD_ERROR_WEBHOOK_URL is configured; always falls
// back to console.error (visible in Vercel function logs). Reporting must never
// break the request that triggered it.

import { createHash } from "node:crypto";
import { getCache, waitUntil } from "@vercel/functions";

const WEBHOOK_TIMEOUT_MS = 3_000;
const MAX_FIELD_LENGTH = 1_000;
const ERROR_DEDUPE_TTL_SECONDS = 5 * 60;
const localSuppressionUntil = new Map<string, number>();

function truncate(value: string, max = MAX_FIELD_LENGTH): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export function reportError(context: string, error: unknown, extra?: Record<string, unknown>): void {
  console.error(`[${context}]`, error, extra ?? "");

  const delivery = deliverErrorReport(context, error, extra).catch(() => {
    // Reporting failures are intentionally swallowed.
  });
  try {
    waitUntil(delivery);
  } catch {
    // Build steps and local tests may not provide a request lifecycle.
    void delivery;
  }
}

export async function deliverErrorReport(
  context: string,
  error: unknown,
  extra?: Record<string, unknown>,
): Promise<"disabled" | "suppressed" | "sent"> {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  const webhookUrl = process.env.DISCORD_ERROR_WEBHOOK_URL;
  if (!webhookUrl) return "disabled";

  const fingerprint = errorFingerprint(context, message, extra);
  const now = Date.now();
  if ((localSuppressionUntil.get(fingerprint) ?? 0) > now) return "suppressed";

  // Runtime Cache is shared by every function instance in the deployment's
  // region, so repeated serverless invocations observe the same suppression
  // marker. The local map is only a fallback if shared cache is unavailable.
  let sharedCache: ReturnType<typeof getCache> | undefined;
  try {
    sharedCache = getCache({ namespace: "sal-error-reporting" });
    if (await sharedCache.get(fingerprint)) {
      localSuppressionUntil.set(fingerprint, now + ERROR_DEDUPE_TTL_SECONDS * 1_000);
      return "suppressed";
    }
    await sharedCache.set(
      fingerprint,
      { firstSeenAt: new Date(now).toISOString() },
      {
        ttl: ERROR_DEDUPE_TTL_SECONDS,
        tags: ["error-report-deduplication"],
        name: "error-report-deduplication",
      },
    );
  } catch {
    // Console logging still preserves every event when shared cache is down.
  }
  localSuppressionUntil.set(fingerprint, now + ERROR_DEDUPE_TTL_SECONDS * 1_000);

  const fields = [
    { name: "Message", value: truncate(message) || "(empty)" },
    ...(extra ? [{ name: "Context", value: truncate(JSON.stringify(extra)) }] : []),
    ...(stack ? [{ name: "Stack", value: truncate(`\`\`\`\n${stack.split("\n").slice(0, 8).join("\n")}\n\`\`\``) }] : []),
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        embeds: [
          {
            title: truncate(`🚨 ${context}`, 250),
            color: 0xef4444,
            fields,
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`Discord error webhook returned ${response.status}.`);
    }
  } catch (deliveryError) {
    // The shared marker is provisional until Discord confirms delivery. A
    // timeout/network/HTTP failure must allow the next identical report to
    // retry instead of creating a silent five-minute alert gap.
    localSuppressionUntil.delete(fingerprint);
    if (sharedCache) {
      try {
        await sharedCache.delete(fingerprint);
      } catch {
        // Cache cleanup failures are logged by the next report's console path.
      }
    }
    throw deliveryError;
  } finally {
    clearTimeout(timer);
  }
  return "sent";
}

function errorFingerprint(
  context: string,
  message: string,
  extra?: Record<string, unknown>,
): string {
  const digest = createHash("sha256")
    .update(`${context}\n${message}\n${JSON.stringify(extra ?? {})}`)
    .digest("hex");
  return `availability:${digest}`;
}

/**
 * Extracts a human-readable message from any thrown value — including
 * Supabase PostgrestError objects, which carry .message without reliably
 * passing `instanceof Error`.
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return fallback;
}
