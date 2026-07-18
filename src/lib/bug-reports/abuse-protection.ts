import type { NextRequest } from "next/server";
import type { BugReportReporterContext } from "./persistence";

export type BugReportAbuseDecision =
  | {
      allowed: true;
      decisionId: string;
      captchaVerified: boolean;
    }
  | {
      allowed: false;
      retryAfterSeconds: number;
      captchaRequired: boolean;
    };

/**
 * Release B supplies a shared implementation. For anonymous reports it may
 * derive a rotating salted hash from request IP headers, but it must never
 * return or persist a raw IP address. The production policy is three anonymous
 * submissions per hour with CAPTCHA escalation after repeated attempts.
 */
export interface BugReportAbuseProtection {
  checkSubmission(input: {
    request: NextRequest;
    reporter: BugReportReporterContext;
  }): Promise<BugReportAbuseDecision>;
}

export function getBugReportAbuseProtection(): BugReportAbuseProtection | null {
  return null;
}
