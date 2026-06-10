// Lightweight server-side error reporting (#80). Posts failures to a Discord
// webhook channel when DISCORD_ERROR_WEBHOOK_URL is configured; always falls
// back to console.error (visible in Vercel function logs). Fire-and-forget —
// reporting must never break or slow the request that triggered it.

const WEBHOOK_TIMEOUT_MS = 3_000;
const MAX_FIELD_LENGTH = 1_000;

function truncate(value: string, max = MAX_FIELD_LENGTH): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export function reportError(context: string, error: unknown, extra?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  console.error(`[${context}]`, error, extra ?? "");

  const webhookUrl = process.env.DISCORD_ERROR_WEBHOOK_URL;
  if (!webhookUrl) return;

  const fields = [
    { name: "Message", value: truncate(message) || "(empty)" },
    ...(extra ? [{ name: "Context", value: truncate(JSON.stringify(extra)) }] : []),
    ...(stack ? [{ name: "Stack", value: truncate(`\`\`\`\n${stack.split("\n").slice(0, 8).join("\n")}\n\`\`\``) }] : []),
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  void fetch(webhookUrl, {
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
  })
    .catch(() => {
      // Reporting failures are intentionally swallowed.
    })
    .finally(() => clearTimeout(timer));
}
