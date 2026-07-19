import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { BUG_REPORT_ATTACHMENT_LIMITS } from "@/lib/bug-reports/contracts";
import type { BugReportUploadService } from "@/lib/bug-reports/upload-service";
import {
  createBugReportUploadSessionHandler as createHandler,
  type BugReportUploadSessionDependencies,
} from "./route";

const now = new Date("2026-07-19T00:05:00.000Z");

function createBugReportUploadSessionHandler(
  dependencies: Omit<
    BugReportUploadSessionDependencies,
    "canonicalSiteOrigin" | "allowedUploadHosts" | "now"
  >,
) {
  return createHandler({
    ...dependencies,
    canonicalSiteOrigin: "https://sal.example",
    allowedUploadHosts: ["storage.example"],
    now: () => now,
  });
}

function requestFor(files: unknown) {
  return new NextRequest("https://sal.example/api/bug-reports/uploads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ files }),
  });
}

function uploadService(createSession = vi.fn()): BugReportUploadService {
  return {
    limits: BUG_REPORT_ATTACHMENT_LIMITS,
    createSession,
    finalizeUpload: vi.fn(),
  };
}

describe("POST /api/bug-reports/uploads", () => {
  it("fails closed before reading a body when upload infrastructure is not ready", async () => {
    const createSession = vi.fn();
    const checkAttempt = vi.fn();
    const consumeAction = vi.fn();
    const handler = createBugReportUploadSessionHandler({
      isEnabled: () => false,
      uploadService: uploadService(createSession),
      abuseProtection: { checkAttempt, consumeAction },
    });

    const response = await handler(
      new NextRequest("https://sal.example/api/bug-reports/uploads", {
        method: "POST",
        body: "not json",
      }),
    );

    expect(response.status).toBe(503);
    expect(createSession).not.toHaveBeenCalled();
    expect(checkAttempt).not.toHaveBeenCalled();
  });

  it("creates private direct-upload targets after metadata and anonymous abuse checks", async () => {
    const receipt = {
      sessionId: "upload-session-0001",
      expiresAt: "2026-07-19T00:15:00.000Z",
      internalStorageBucket: "must-not-serialize",
      targets: [
        {
          uploadId: "upload-object-0000001",
          uploadUrl: "https://storage.example/private-signed-upload",
          method: "PUT" as const,
          requiredHeaders: { "content-type": "image/png" },
          finalizationToken: "f".repeat(48),
          expiresAt: "2026-07-19T00:15:00.000Z",
          internalObjectKey: "quarantine/secret",
        },
      ],
    };
    const createSession = vi.fn().mockResolvedValue(receipt);
    const checkAttempt = vi.fn().mockResolvedValue({
      allowed: true,
      decisionId: "attempt-upload-1",
      captchaVerified: false,
    });
    const consumeAction = vi.fn().mockResolvedValue({
      allowed: true,
      decisionId: "abuse-decision-upload-1",
      captchaVerified: false,
    });
    const handler = createBugReportUploadSessionHandler({
      isEnabled: () => true,
      uploadService: uploadService(createSession),
      abuseProtection: { checkAttempt, consumeAction },
    });

    const response = await handler(
      requestFor([{ name: "evidence.png", mediaType: "image/png", size: 121_905 }]),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    const responseBody = await response.json();
    expect(responseBody).toEqual({
      ok: true,
      uploadSession: {
        sessionId: "upload-session-0001",
        expiresAt: "2026-07-19T00:15:00.000Z",
        allowedUploadHosts: ["storage.example"],
        targets: [
          {
            uploadId: "upload-object-0000001",
            uploadUrl: "https://storage.example/private-signed-upload",
            method: "PUT",
            requiredHeaders: { "content-type": "image/png" },
            finalizationToken: "f".repeat(48),
            expiresAt: "2026-07-19T00:15:00.000Z",
          },
        ],
      },
    });
    expect(JSON.stringify(responseBody)).not.toMatch(/internalStorageBucket|internalObjectKey/);
    expect(checkAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ action: "upload_session" }),
    );
    expect(consumeAction).toHaveBeenCalledWith(
      expect.objectContaining({
        reporter: { kind: "anonymous" },
        action: "upload_session",
        attemptDecisionId: "attempt-upload-1",
      }),
    );
    expect(createSession).toHaveBeenCalledWith({
      files: [{ name: "evidence.png", mediaType: "image/png", size: 121_905 }],
      abuseDecisionId: "abuse-decision-upload-1",
    });
  });

  it("rejects a client-declared file above the per-file limit before issuing storage access", async () => {
    const createSession = vi.fn();
    const handler = createBugReportUploadSessionHandler({
      isEnabled: () => true,
      uploadService: uploadService(createSession),
      abuseProtection: {
        checkAttempt: vi.fn().mockResolvedValue({
          allowed: true,
          decisionId: "attempt-unused",
          captchaVerified: false,
        }),
        consumeAction: vi.fn().mockResolvedValue({
          allowed: true,
          decisionId: "unused",
          captchaVerified: false,
        }),
      },
    });

    const response = await handler(
      requestFor([
        {
          name: "too-large.png",
          mediaType: "image/png",
          size: BUG_REPORT_ATTACHMENT_LIMITS.maxBytesPerFile + 1,
        },
      ]),
    );

    expect(response.status).toBe(400);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("runs the durable attempt gate before parsing upload metadata", async () => {
    const consumeAction = vi.fn();
    const handler = createBugReportUploadSessionHandler({
      isEnabled: () => true,
      uploadService: uploadService(),
      abuseProtection: {
        checkAttempt: vi.fn().mockResolvedValue({
          allowed: false,
          retryAfterSeconds: 60,
          captchaRequired: true,
        }),
        consumeAction,
      },
    });

    const response = await handler(
      new NextRequest("https://sal.example/api/bug-reports/uploads", {
        method: "POST",
        body: "not json",
      }),
    );

    expect(response.status).toBe(429);
    expect(consumeAction).not.toHaveBeenCalled();
  });

  it("rejects a signed target outside protected server upload-host configuration", async () => {
    const createSession = vi.fn().mockResolvedValue({
      sessionId: "upload-session-0002",
      expiresAt: "2026-07-19T00:15:00.000Z",
      targets: [
        {
          uploadId: "upload-object-0000002",
          uploadUrl: "https://attacker.example/private-signed-upload",
          method: "PUT",
          requiredHeaders: { "content-type": "image/png" },
          finalizationToken: "f".repeat(48),
          expiresAt: "2026-07-19T00:15:00.000Z",
        },
      ],
    });
    const handler = createBugReportUploadSessionHandler({
      isEnabled: () => true,
      uploadService: uploadService(createSession),
      abuseProtection: {
        checkAttempt: vi.fn().mockResolvedValue({
          allowed: true,
          decisionId: "attempt-upload-2",
          captchaVerified: false,
        }),
        consumeAction: vi.fn().mockResolvedValue({
          allowed: true,
          decisionId: "upload-2",
          captchaVerified: false,
        }),
      },
    });

    const response = await handler(
      requestFor([{ name: "evidence.png", mediaType: "image/png", size: 100 }]),
    );

    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("attacker.example");
  });
});
