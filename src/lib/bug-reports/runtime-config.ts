export interface BugReportRuntimeConfig {
  /** Exact public SAL origin, for example https://sal.example. No path or credentials. */
  canonicalSiteOrigin: string;
  /** Exact HTTPS storage hosts permitted for browser PUT targets. Never contains credentials. */
  allowedUploadHosts: readonly string[];
}

export function getBugReportRuntimeConfig(): BugReportRuntimeConfig | null {
  const canonicalSiteOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!canonicalSiteOrigin) return null;
  return {
    canonicalSiteOrigin,
    // Screenshot quarantine is intentionally not part of the text-first
    // release. Upload routes remain fail-closed until its storage contract
    // lands in sal-database.
    allowedUploadHosts: [],
  };
}
