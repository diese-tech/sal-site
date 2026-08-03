import { createHmac } from "crypto";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";
import { getSupabaseServerClient } from "@/lib/supabase-server";
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
  const client = getSupabaseServerClient();
  const hmacSecret = process.env.ADMIN_SESSION_SECRET;
  return client && hmacSecret
    ? createDatabaseBugReportAbuseProtection(client, hmacSecret)
    : null;
}

export function createDatabaseBugReportAbuseProtection(
  client: SupabaseClient<Database>,
  hmacSecret: string,
): BugReportAbuseProtection {
  const currentAttemptBuckets = new Map<string, { bucketHash: string; expiresAt: number }>();

  return {
    async checkAttempt({ request, action }) {
      requireSubmissionAction(action);
      pruneAttemptBuckets();
      const bucketHash = requestBucketHash(request, hmacSecret);
      const { data, error } = await client.rpc("begin_bug_report_attempt", {
        p_bucket_hash: bucketHash,
        p_action: action,
        p_attempt_limit: 12,
        p_window_seconds: 3600,
      });
      if (error) throw error;
      const decision = readDecision(data);
      if (decision.allowed) {
        if (currentAttemptBuckets.size >= 2_000) {
          const oldest = currentAttemptBuckets.keys().next().value;
          if (oldest) currentAttemptBuckets.delete(oldest);
        }
        currentAttemptBuckets.set(decision.decisionId, {
          bucketHash,
          expiresAt: Date.now() + 10 * 60_000,
        });
      }
      return decision;
    },

    async consumeAction({ attemptDecisionId, action }) {
      requireSubmissionAction(action);
      const attempt = currentAttemptBuckets.get(attemptDecisionId);
      if (!attempt || attempt.expiresAt <= Date.now()) {
        currentAttemptBuckets.delete(attemptDecisionId);
        throw new Error("Bug report attempt context is unavailable.");
      }
      currentAttemptBuckets.delete(attemptDecisionId);

      const { data, error } = await client.rpc("consume_bug_report_allowance", {
        p_attempt_decision_id: attemptDecisionId,
        p_bucket_hash: attempt.bucketHash,
        p_action: action,
        p_submission_limit: 3,
        p_window_seconds: 3600,
      });
      if (error) throw error;
      return readDecision(data);
    },
  };

  function readDecision(value: Json): BugReportAbuseDecision {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Bug report limiter returned an invalid decision.");
    }
    const candidate = value as Record<string, Json | undefined>;
    if (candidate.allowed === true && typeof candidate.decisionId === "string") {
      if (typeof candidate.captchaVerified !== "boolean") {
        throw new Error("Bug report limiter returned an invalid decision.");
      }
      return {
        allowed: true,
        decisionId: candidate.decisionId,
        captchaVerified: candidate.captchaVerified,
      };
    }
    if (
      candidate.allowed === false &&
      typeof candidate.retryAfterSeconds === "number" &&
      typeof candidate.captchaRequired === "boolean"
    ) {
      return {
        allowed: false,
        retryAfterSeconds: candidate.retryAfterSeconds,
        captchaRequired: candidate.captchaRequired,
      };
    }
    throw new Error("Bug report limiter returned an invalid decision.");
  }

  function pruneAttemptBuckets() {
    const now = Date.now();
    for (const [decisionId, attempt] of currentAttemptBuckets) {
      if (attempt.expiresAt <= now) currentAttemptBuckets.delete(decisionId);
    }
  }

  function requestBucketHash(request: NextRequest, secret: string): string {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const address = forwarded || request.headers.get("x-real-ip")?.trim() || "unavailable";
    const userAgent = request.headers.get("user-agent")?.slice(0, 256) ?? "unavailable";
    return createHmac("sha256", secret)
      .update(`sal-bug-report-rate-limit\n${address}\n${userAgent}`)
      .digest("hex");
  }
}

function requireSubmissionAction(action: BugReportAbuseAction): asserts action is "ticket_submission" {
  if (action !== "ticket_submission") {
    throw new Error("Screenshot intake is not enabled for this release.");
  }
}
