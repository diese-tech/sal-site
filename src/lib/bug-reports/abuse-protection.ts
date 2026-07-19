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

export type BugReportAbuseAction =
  | "upload_session"
  | "upload_finalization"
  | "ticket_submission";

/**
 * Release B supplies a shared implementation. For anonymous reports it may
 * derive a rotating salted hash from request IP headers, but it must never
 * return or persist a raw IP address. The production policy is three anonymous
 * submissions per hour with CAPTCHA escalation after repeated attempts.
 */
export interface BugReportAbuseProtection {
  /** Durable, anonymous, low-cost gate that runs before parsing bodies or resolving auth. */
  checkAttempt(input: {
    request: NextRequest;
    action: BugReportAbuseAction;
  }): Promise<BugReportAbuseDecision>;

  /**
   * Consumes the validated action allowance after syntax and capability checks.
   * Upload reservations and completed ticket submissions may use separate
   * durable buckets so one report is not double-counted.
   */
  consumeAction(input: {
    attemptDecisionId: string;
    action: BugReportAbuseAction;
    reporter: BugReportReporterContext;
  }): Promise<BugReportAbuseDecision>;
}

export function getBugReportAbuseProtection(): BugReportAbuseProtection | null {
  return null;
}
