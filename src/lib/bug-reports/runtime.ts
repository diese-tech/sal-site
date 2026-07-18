import { getBugReportAbuseProtection } from "./abuse-protection";
import { getBugReportPersistence } from "./persistence";

export function getBugReportRuntime() {
  const featureEnabled = process.env.BUG_REPORT_SUBMISSIONS_ENABLED === "true";
  const persistence = getBugReportPersistence();
  const abuseProtection = getBugReportAbuseProtection();

  return {
    featureEnabled,
    persistence,
    abuseProtection,
    ready: featureEnabled && persistence !== null && abuseProtection !== null,
  };
}
