import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { BugReportPersistence } from "@/lib/bug-reports/persistence";
import { createBugReportPostHandler } from "./route";

const validPayload = {
  category: "website",
  severity: "normal",
  subject: "Standings page does not load",
  description: "The standings page stays blank after I select the current season.",
  reproductionSteps: "1. Open standings\n2. Select the current season\n3. Wait for the page",
  expectedBehavior: "The current standings should appear.",
  environment: "Chrome on Windows 11",
  replyRelayConsent: false,
};

function requestFor(payload: unknown = validPayload) {
  const body = new FormData();
  body.set("payload", JSON.stringify(payload));
  return new NextRequest("http://localhost/api/bug-reports", { method: "POST", body });
}

const anonymousReporter = async () => ({ kind: "anonymous" } as const);
const allowedSubmission = {
  checkSubmission: async () => ({ allowed: true, decisionId: "rate-decision-1", captchaVerified: false } as const),
};

describe("POST /api/bug-reports", () => {
  it("fails closed before reading input while the feature is disabled", async () => {
    const persist = vi.fn();
    const handler = createBugReportPostHandler({
      isEnabled: () => false,
      persistence: { persist } as unknown as BugReportPersistence,
      abuseProtection: allowedSubmission,
      resolveReporter: anonymousReporter,
    });

    const response = await handler(
      new NextRequest("http://localhost/api/bug-reports", { method: "POST", body: "not multipart" }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "disabled" });
    expect(persist).not.toHaveBeenCalled();
  });

  it("returns field-level validation errors for an invalid submission", async () => {
    const handler = createBugReportPostHandler({
      isEnabled: () => true,
      persistence: null,
      abuseProtection: null,
      resolveReporter: anonymousReporter,
    });

    const response = await handler(requestFor({ ...validPayload, description: "too short" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "invalid_request",
      fieldErrors: { description: expect.any(String) },
    });
  });

  it("does not claim success when Release B persistence is unavailable", async () => {
    const handler = createBugReportPostHandler({
      isEnabled: () => true,
      persistence: null,
      abuseProtection: null,
      resolveReporter: anonymousReporter,
    });

    const response = await handler(requestFor());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "persistence_unavailable",
    });
  });

  it("requires a signed-in server session before enabling the private Discord reply relay", async () => {
    const handler = createBugReportPostHandler({
      isEnabled: () => true,
      persistence: { persist: vi.fn() },
      abuseProtection: allowedSubmission,
      resolveReporter: anonymousReporter,
    });

    const response = await handler(requestFor({ ...validPayload, replyRelayConsent: true }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      fieldErrors: { replyRelayConsent: expect.any(String) },
    });
  });

  it("returns a ticket only after the durable persistence boundary resolves", async () => {
    const receipt = {
      ticketId: "BUG-0190",
      status: "open" as const,
      reporterAccess: {
        accessToken: "secret-access-token",
        accessUrl: "https://sal.example/report-a-bug/secret-access-token",
        recoveryCode: "SAL-190-A",
      },
      relay: { requested: false, queued: false },
    };
    const persist = vi.fn().mockResolvedValue(receipt);
    const handler = createBugReportPostHandler({
      isEnabled: () => true,
      persistence: { persist },
      abuseProtection: allowedSubmission,
      resolveReporter: anonymousReporter,
    });

    const response = await handler(requestFor());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true, ticket: receipt });
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ subject: validPayload.subject }),
        attachments: [],
        reporter: { kind: "anonymous" },
        abuseDecisionId: "rate-decision-1",
      }),
    );
  });

  it("does not link a signed-in identity unless the reporter consents to private relay", async () => {
    const persist = vi.fn().mockResolvedValue({
      ticketId: "BUG-0191",
      status: "open",
      reporterAccess: {
        accessToken: "secret-access-token",
        accessUrl: "https://sal.example/report-a-bug/secret-access-token",
        recoveryCode: "SAL-191-A",
      },
      relay: { requested: false, queued: false },
    });
    const handler = createBugReportPostHandler({
      isEnabled: () => true,
      persistence: { persist },
      abuseProtection: allowedSubmission,
      resolveReporter: async () => ({
        kind: "signed_in",
        authUserId: "auth-user-1",
        discordId: "discord-user-1",
      }),
    });

    const response = await handler(requestFor());

    expect(response.status).toBe(201);
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({ reporter: { kind: "anonymous" } }),
    );
  });

  it("does not persist when durable shared abuse protection is unavailable", async () => {
    const persist = vi.fn();
    const handler = createBugReportPostHandler({
      isEnabled: () => true,
      persistence: { persist },
      abuseProtection: null,
      resolveReporter: anonymousReporter,
    });

    const response = await handler(requestFor());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "rate_limit_unavailable",
    });
    expect(persist).not.toHaveBeenCalled();
  });

  it("returns a retry time when the shared limiter rejects a submission", async () => {
    const persist = vi.fn();
    const handler = createBugReportPostHandler({
      isEnabled: () => true,
      persistence: { persist },
      abuseProtection: {
        checkSubmission: async () => ({ allowed: false, retryAfterSeconds: 900, captchaRequired: true }),
      },
      resolveReporter: anonymousReporter,
    });

    const response = await handler(requestFor());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("900");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "rate_limited",
      retryAfterSeconds: 900,
    });
    expect(persist).not.toHaveBeenCalled();
  });

  it("returns a retryable failure instead of success when persistence throws", async () => {
    const handler = createBugReportPostHandler({
      isEnabled: () => true,
      persistence: { persist: vi.fn().mockRejectedValue(new Error("database unavailable")) },
      abuseProtection: allowedSubmission,
      resolveReporter: anonymousReporter,
    });

    const response = await handler(requestFor());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "submission_failed" });
  });
});
