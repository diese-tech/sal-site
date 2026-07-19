import { getBugReportAbuseProtection } from "./abuse-protection";
import { getBugReportPersistence, getBugReportStatusReader } from "./persistence";
import { getBugReportUploadService } from "./upload-service";
import { getBugReportRuntimeConfig } from "./runtime-config";
import {
  normalizeAllowedUploadHosts,
  normalizeCanonicalSiteOrigin,
} from "./contracts";

export function getBugReportRuntime() {
  const featureEnabled = process.env.BUG_REPORT_SUBMISSIONS_ENABLED === "true";
  const persistence = getBugReportPersistence();
  const statusReader = getBugReportStatusReader();
  const abuseProtection = getBugReportAbuseProtection();
  const uploadService = getBugReportUploadService();
  const rawConfiguration = getBugReportRuntimeConfig();
  const canonicalSiteOrigin = normalizeCanonicalSiteOrigin(
    rawConfiguration?.canonicalSiteOrigin,
  );
  const allowedUploadHosts = normalizeAllowedUploadHosts(
    rawConfiguration?.allowedUploadHosts,
  );
  const configuration =
    canonicalSiteOrigin && allowedUploadHosts
      ? { canonicalSiteOrigin, allowedUploadHosts }
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
      uploadService !== null &&
      configuration !== null,
  };
}
