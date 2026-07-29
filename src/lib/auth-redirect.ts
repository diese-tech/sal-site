export function safeRedirectPath(next: string | null | undefined, fallback = "/register") {
  return next?.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

/**
 * Return path carried through the /admin/login round-trip as `?next=`.
 * Only same-site /admin paths (with their query string, so deep links like
 * /admin/tickets?ticket=... survive) are accepted; anything else — external
 * URLs, protocol-relative //host tricks, non-admin paths, or the login page
 * itself — is rejected so login can never bounce somewhere unexpected.
 */
export function safeAdminReturnPath(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!/^\/admin(?:\/|\?|$)/.test(next)) return null;
  if (next.startsWith("/admin/login")) return null;
  return next;
}

/**
 * Login URL that preserves the caller's full path + query through the
 * redirect. Used by the proxy and requireAdmin() so an unauthenticated hit on
 * a deep link (e.g. a Discord embed to /admin/tickets?ticket=...) comes back
 * to the same URL after auth.
 */
export function adminLoginPath(returnTo?: string | null): string {
  const next = safeAdminReturnPath(returnTo);
  return next ? `/admin/login?next=${encodeURIComponent(next)}` : "/admin/login";
}
