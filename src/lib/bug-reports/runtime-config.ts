export interface BugReportRuntimeConfig {
  /** Exact public SAL origin, for example https://sal.example. No path or credentials. */
  canonicalSiteOrigin: string;
  /** Exact HTTPS storage hosts permitted for browser PUT targets. Never contains credentials. */
  allowedUploadHosts: readonly string[];
}

/**
 * Release B supplies this protected adapter from database-backed platform
 * configuration. It is deliberately null in the shell: request Host headers,
 * NEXT_PUBLIC values, and arbitrary signed-target hosts are not authorities.
 */
export function getBugReportRuntimeConfig(): BugReportRuntimeConfig | null {
  return null;
}
