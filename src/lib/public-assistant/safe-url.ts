export function isSafePublicUrl(value: string): boolean {
  const relative = value.startsWith("/") && !value.startsWith("//") && !value.includes("\\");

  try {
    const url = relative ? new URL(value, "https://sal.invalid") : new URL(value);
    const sensitiveQuery = [...url.searchParams.keys()].some((key) => /(?:token|secret|password|api[_-]?key)/i.test(key));
    const discordWebhook = /(?:^|\.)discord(?:app)?\.com$/i.test(url.hostname) && url.pathname.includes("/api/webhooks/");
    return (relative || url.protocol === "https:") && !url.username && !url.password && !sensitiveQuery && !discordWebhook;
  } catch {
    return false;
  }
}
