import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { BUG_REPORT_ATTACHMENT_LIMITS } from "@/lib/bug-reports/contracts";
import type { BugReportUploadService } from "@/lib/bug-reports/upload-service";
import { createBugReportUploadSessionHandler } from "./route";

function requestFor(files: unknown) {
  return new NextRequest("http://localhost/api/bug-reports/uploads", {
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
    const checkSubmission = vi.fn();
    const handler = createBugReportUploadSessionHandler({
      isEnabled: () => false,
      uploadService: uploadService(createSession),
      abuseProtection: { checkSubmission },
    });

    const response = await handler(
      new NextRequest("http://localhost/api/bug-reports/uploads", {
        method: "POST",
        body: "not json",
      }),
    );

    expect(response.status).toBe(503);
    expect(createSession).not.toHaveBeenCalled();
    expect(checkSubmission).not.toHaveBeenCalled();
  });

  it("creates private direct-upload targets after metadata and anonymous abuse checks", async () => {
    const receipt = {
      sessionId: "upload-session-0001",
      expiresAt: "2026-07-19T00:15:00.000Z",
      targets: [
        {
          uploadId: "upload-object-0000001",
          uploadUrl: "https://storage.example/private-signed-upload",
          method: "PUT" as const,
          requiredHeaders: { "content-type": "image/png" },
          finalizationToken: "f".repeat(48),
          expiresAt: "2026-07-19T00:15:00.000Z",
        },
      ],
    };
    const createSession = vi.fn().mockResolvedValue(receipt);
    const checkSubmission = vi.fn().mockResolvedValue({
      allowed: true,
      decisionId: "abuse-decision-upload-1",
      captchaVerified: false,
    });
    const handler = createBugReportUploadSessionHandler({
      isEnabled: () => true,
      uploadService: uploadService(createSession),
      abuseProtection: { checkSubmission },
    });

    const response = await handler(
      requestFor([{ name: "evidence.png", mediaType: "image/png", size: 121_905 }]),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true, uploadSession: receipt });
    expect(checkSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ reporter: { kind: "anonymous" }, action: "upload_session" }),
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
        checkSubmission: vi.fn().mockResolvedValue({
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
});
