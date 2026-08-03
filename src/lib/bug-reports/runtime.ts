import { getBugReportAbuseProtection } from "./abuse-protection";
import { getBugReportPersistence, getBugReportStatusReader } from "./persistence";
import { getBugReportUploadService } from "./upload-service";
import { getBugReportRuntimeConfig } from "./runtime-config";
import {
  normalizeCanonicalSiteOrigin,
} from "./contracts";

export function getBugReportRuntime() {
  // Enabled by default once every required durable adapter is present. The
  // environment variable remains an emergency kill switch.
  const featureEnabled = process.env.BUG_REPORT_SUBMISSIONS_ENABLED !== "false";
  const persistence = getBugReportPersistence();
  const statusReader = getBugReportStatusReader();
  const abuseProtection = getBugReportAbuseProtection();
  const uploadService = getBugReportUploadService();
  const rawConfiguration = getBugReportRuntimeConfig();
  const canonicalSiteOrigin = normalizeCanonicalSiteOrigin(
    rawConfiguration?.canonicalSiteOrigin,
  );
  const configuration = canonicalSiteOrigin
    ? {
        canonicalSiteOrigin,
        allowedUploadHosts: rawConfiguration?.allowedUploadHosts ?? [],
      }
    : null;

  return {
    featureEnabled,
    persistence,
    statusReader,
    abuseProtection,
    uploadService,
    configuration,
    ready:
      featureEnabled &&
      persistence !== null &&
      statusReader !== null &&
      abuseProtection !== null &&
      configuration !== null,
  };
}
