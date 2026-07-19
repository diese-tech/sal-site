import { getBugReportAbuseProtection } from "./abuse-protection";
import { getBugReportPersistence } from "./persistence";
import { getBugReportUploadService } from "./upload-service";

export function getBugReportRuntime() {
  const featureEnabled = process.env.BUG_REPORT_SUBMISSIONS_ENABLED === "true";
  const persistence = getBugReportPersistence();
  const abuseProtection = getBugReportAbuseProtection();
  const uploadService = getBugReportUploadService();

  return {
    featureEnabled,
    persistence,
    abuseProtection,
    uploadService,
    ready:
      featureEnabled &&
      persistence !== null &&
      abuseProtection !== null &&
      uploadService !== null,
  };
}
