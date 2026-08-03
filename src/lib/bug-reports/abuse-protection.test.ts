import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createDatabaseBugReportAbuseProtection } from "./abuse-protection";

describe("database bug report abuse protection", () => {
  it("hashes request identity and carries the durable attempt into submission consumption", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: {
          allowed: true,
          decisionId: "11111111-1111-4111-8111-111111111111",
          captchaVerified: false,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          allowed: true,
          decisionId: "22222222-2222-4222-8222-222222222222",
          captchaVerified: false,
        },
        error: null,
      });
    const protection = createDatabaseBugReportAbuseProtection(
      { rpc } as unknown as SupabaseClient<Database>,
      "test-hmac-secret",
    );
    const request = new NextRequest("https://sal.example/api/bug-reports", {
      headers: {
        "x-forwarded-for": "203.0.113.9, 10.0.0.1",
        "user-agent": "SAL test browser",
      },
    });

    const attempt = await protection.checkAttempt({ request, action: "ticket_submission" });
    expect(attempt.allowed).toBe(true);
    if (!attempt.allowed) throw new Error("expected allowed attempt");
    const allowance = await protection.consumeAction({
      attemptDecisionId: attempt.decisionId,
      action: "ticket_submission",
      reporter: { kind: "anonymous" },
    });

    expect(allowance.allowed).toBe(true);
    const beginArgs = rpc.mock.calls[0][1] as Record<string, unknown>;
    const consumeArgs = rpc.mock.calls[1][1] as Record<string, unknown>;
    expect(beginArgs.p_bucket_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(beginArgs.p_bucket_hash).toBe(consumeArgs.p_bucket_hash);
    expect(JSON.stringify([beginArgs, consumeArgs])).not.toContain("203.0.113.9");
  });

  it("does not offer upload allowances before quarantine storage exists", async () => {
    const rpc = vi.fn();
    const protection = createDatabaseBugReportAbuseProtection(
      { rpc } as unknown as SupabaseClient<Database>,
      "test-hmac-secret",
    );
    const request = new NextRequest("https://sal.example/api/bug-reports/uploads");

    await expect(protection.checkAttempt({ request, action: "upload_session" }))
      .rejects.toThrow("Screenshot intake");
    expect(rpc).not.toHaveBeenCalled();
  });
});
