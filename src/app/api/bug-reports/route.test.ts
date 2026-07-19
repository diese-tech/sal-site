import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { BugReportPersistence } from "@/lib/bug-reports/persistence";
import {
  createBugReportPostHandler as createHandler,
  type BugReportPostDependencies,
} from "./route";

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

function requestFor(payload: unknown = validPayload, attachments: unknown = []) {
  return new NextRequest("https://sal.example/api/bug-reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload, attachments }),
  });
}

const anonymousReporter = async () => ({ kind: "anonymous" } as const);
const canonicalSiteOrigin = "https://sal.example";
const allowedSubmission = {
  checkAttempt: async () => ({
    allowed: true,
    decisionId: "attempt-decision-1",
    captchaVerified: false,
  } as const),
  consumeAction: async () => ({
    allowed: true,
    decisionId: "rate-decision-1",
    captchaVerified: false,
  } as const),
};

function createBugReportPostHandler(
  dependencies: Omit<BugReportPostDependencies, "canonicalSiteOrigin">,
) {
  return createHandler({ ...dependencies, canonicalSiteOrigin });
}

describe("POST /api/bug-reports", () => {
  it("fails closed before reading input while the feature is disabled", async () => {
    const persist = vi.fn();
    const resolveReporter = vi.fn(anonymousReporter);
    const handler = createBugReportPostHandler({
      isEnabled: () => false,
      persistence: { persist } as unknown as BugReportPersistence,
      abuseProtection: allowedSubmission,
      resolveReporter,
    });

    const response = await handler(
      new NextRequest("https://sal.example/api/bug-reports", { method: "POST", body: "not json" }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "disabled" });
    expect(persist).not.toHaveBeenCalled();
    expect(resolveReporter).not.toHaveBeenCalled();
  });

  it("fails closed before reading input or resolving identity when a required adapter is unavailable", async () => {
    const resolveReporter = vi.fn(anonymousReporter);
    const handler = createBugReportPostHandler({
      isEnabled: () => true,
      persistence: null,
      abuseProtection: allowedSubmission,
      resolveReporter,
    });

    const response = await handler(
      new NextRequest("https://sal.example/api/bug-reports", { method: "POST", body: "not json" }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "persistence_unavailable" });
    expect(resolveReporter).not.toHaveBeenCalled();
  });

  it("applies the anonymous attempt gate before parsing input or resolving identity", async () => {
    const resolveReporter = vi.fn(anonymousReporter);
    const consumeAction = vi.fn();
    const handler = createBugReportPostHandler({
      isEnabled: () => true,
      persistence: { persist: vi.fn() },
      abuseProtection: {
        checkAttempt: vi.fn().mockResolvedValue({
          allowed: false,
          retryAfterSeconds: 60,
          captchaRequired: true,
        }),
        consumeAction,
      },
      resolveReporter,
    });

    const response = await handler(
      new NextRequest("https://sal.example/api/bug-reports", {
        method: "POST",
        body: "not json",
      }),
    );

    expect(response.status).toBe(429);
    expect(resolveReporter).not.toHaveBeenCalled();
    expect(consumeAction).not.toHaveBeenCalled();
  });

  it("rejects unexpected request hosts before building any public access link", async () => {
    const persist = vi.fn();
    const handler = createBugReportPostHandler({
      isEnabled: () => true,
      persistence: { persist },
      abuseProtection: allowedSubmission,
      resolveReporter: anonymousReporter,
    });

    const request = new NextRequest("https://attacker.example/api/bug-reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: validPayload, attachments: [] }),
    });
    const response = await handler(request);

    expect(response.status).toBe(400);
    expect(persist).not.toHaveBeenCalled();
  });

  it("returns field-level validation errors for an invalid submission", async () => {
    const handler = createBugReportPostHandler({
      isEnabled: () => true,
      persistence: { persist: vi.fn() },
      abuseProtection: allowedSubmission,
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
      publicTicketId: "ticket-public-0190",
      status: "open" as const,
      reporterAccess: {
        kind: "anonymous" as const,
        oneTimeAccessToken: "secret-access-token",
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
    await expect(response.json()).resolves.toEqual({
      ok: true,
      ticket: {
        ticketId: "BUG-0190",
        status: "open",
        reporterAccess: {
          kind: "anonymous",
          accessUrl:
            "https://sal.example/report-a-bug/tickets/ticket-public-0190#access=secret-access-token",
          recoveryCode: "SAL-190-A",
        },
        relay: { requested: false, queued: false },
      },
    });
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ subject: validPayload.subject }),
        attachments: [],
        reporter: { kind: "anonymous" },
        abuseDecisionId: "rate-decision-1",
      }),
    );
  });

  it("passes only finalized opaque attachment claims through the ticket boundary", async () => {
    const persist = vi.fn().mockResolvedValue({
      ticketId: "BUG-0193",
      publicTicketId: "ticket-public-0193",
      status: "open",
      reporterAccess: {
        kind: "anonymous",
        oneTimeAccessToken: "attachment-secret",
        recoveryCode: "SAL-193-A",
      },
      relay: { requested: false, queued: false },
    });
    const handler = createBugReportPostHandler({
      isEnabled: () => true,
      persistence: { persist },
      abuseProtection: allowedSubmission,
      resolveReporter: anonymousReporter,
    });
    const attachment = { opaqueRef: `brup_${"b".repeat(48)}` };

    const response = await handler(requestFor(validPayload, [attachment]));

    expect(response.status).toBe(201);
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: [attachment] }),
    );
    expect(JSON.stringify(persist.mock.calls[0][0])).not.toMatch(/arrayBuffer|uploadUrl|finalizationToken/);
  });

  it("projects a strict public receipt without leaking internal or path-based secrets", async () => {
    const persist = vi.fn().mockResolvedValue({
      ticketId: "BUG-0192",
      publicTicketId: "public-0192",
      status: "open",
      adminTicketUrl: "https://sal.example/admin/tickets/BUG-0192",
      reporterAccess: {
        kind: "anonymous",
        oneTimeAccessToken: "one-time-secret",
        recoveryCode: "SAL-192-A",
      },
      relay: { requested: false, queued: false },
    });
    const handler = createBugReportPostHandler({
      isEnabled: () => true,
      persistence: { persist },
      abuseProtection: allowedSubmission,
      resolveReporter: anonymousReporter,
    });

    const response = await handler(requestFor());
    const result = await response.json();
    const serialized = JSON.stringify(result);

    expect(response.status).toBe(201);
    expect(serialized).not.toContain("adminTicketUrl");
    expect(serialized).not.toContain("/one-time-secret");
    expect(serialized.match(/one-time-secret/g)).toHaveLength(1);
    expect(result.ticket.reporterAccess.accessUrl).toContain("#access=one-time-secret");
  });

  it("does not link a signed-in identity unless the reporter consents to private relay", async () => {
    const consumeAction = vi.fn().mockResolvedValue({
      allowed: true,
      decisionId: "rate-decision-1",
      captchaVerified: false,
    });
    const persist = vi.fn().mockResolvedValue({
      ticketId: "BUG-0191",
      publicTicketId: "ticket-public-0191",
      status: "open",
      reporterAccess: {
        kind: "anonymous",
        oneTimeAccessToken: "secret-access-token",
        recoveryCode: "SAL-191-A",
      },
      relay: { requested: false, queued: false },
    });
    const resolveReporter = vi.fn(async () => ({
      kind: "signed_in" as const,
      authUserId: "auth-user-1",
      discordId: "discord-user-1",
    }));
    const handler = createBugReportPostHandler({
      isEnabled: () => true,
      persistence: { persist },
      abuseProtection: { ...allowedSubmission, consumeAction },
      resolveReporter,
    });

    const response = await handler(requestFor());

    expect(response.status).toBe(201);
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({ reporter: { kind: "anonymous" } }),
    );
    expect(consumeAction).toHaveBeenCalledWith(
      expect.objectContaining({
        reporter: { kind: "anonymous" },
        action: "ticket_submission",
      }),
    );
    expect(resolveReporter).not.toHaveBeenCalled();
  });

  it("rejects private relay consent when the authenticated session has no Discord identity", async () => {
    const persist = vi.fn();
    const handler = createBugReportPostHandler({
      isEnabled: () => true,
      persistence: { persist },
      abuseProtection: allowedSubmission,
      resolveReporter: async () => ({
        kind: "signed_in",
        authUserId: "auth-user-1",
        discordId: null,
      }),
    });

    const response = await handler(requestFor({ ...validPayload, replyRelayConsent: true }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      fieldErrors: { replyRelayConsent: expect.any(String) },
    });
    expect(persist).not.toHaveBeenCalled();
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
        checkAttempt: async () => ({ allowed: false, retryAfterSeconds: 900, captchaRequired: true }),
        consumeAction: vi.fn(),
      },
      resolveReporter: anonymousReporter,
    });

    const response = await handler(requestFor());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("900");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
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
