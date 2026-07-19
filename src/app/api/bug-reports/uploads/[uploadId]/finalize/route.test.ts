import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { BUG_REPORT_ATTACHMENT_LIMITS } from "@/lib/bug-reports/contracts";
import type { BugReportUploadService } from "@/lib/bug-reports/upload-service";
import {
  createBugReportUploadFinalizationHandler as createHandler,
  type BugReportUploadFinalizationDependencies,
} from "./route";

const allowedAbuseProtection = {
  checkAttempt: vi.fn().mockResolvedValue({
    allowed: true,
    decisionId: "attempt-finalize-1",
    captchaVerified: false,
  }),
  consumeAction: vi.fn().mockResolvedValue({
    allowed: true,
    decisionId: "finalize-decision-1",
    captchaVerified: false,
  }),
};

function createBugReportUploadFinalizationHandler(
  dependencies: Omit<
    BugReportUploadFinalizationDependencies,
    "abuseProtection" | "canonicalSiteOrigin"
  >,
) {
  return createHandler({
    ...dependencies,
    abuseProtection: allowedAbuseProtection,
    canonicalSiteOrigin: "https://sal.example",
  });
}

function uploadService(finalizeUpload = vi.fn()): BugReportUploadService {
  return {
    limits: BUG_REPORT_ATTACHMENT_LIMITS,
    createSession: vi.fn(),
    finalizeUpload,
  };
}

function requestFor(finalizationToken: string) {
  return new NextRequest("https://sal.example/api/bug-reports/uploads/upload-object-0000001/finalize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ finalizationToken }),
  });
}

describe("POST /api/bug-reports/uploads/[uploadId]/finalize", () => {
  it("fails closed before reading finalization data when storage is unavailable", async () => {
    const finalizeUpload = vi.fn();
    const handler = createBugReportUploadFinalizationHandler({
      isEnabled: () => false,
      uploadService: uploadService(finalizeUpload),
    });

    const response = await handler(
      new NextRequest("https://sal.example/api/bug-reports/uploads/x/finalize", {
        method: "POST",
        body: "not json",
      }),
      { params: Promise.resolve({ uploadId: "x" }) },
    );

    expect(response.status).toBe(503);
    expect(finalizeUpload).not.toHaveBeenCalled();
  });

  it("returns only an opaque finalized reference after server-side validation", async () => {
    const attachment = { opaqueRef: `brup_${"a".repeat(48)}` };
    const finalizeUpload = vi.fn().mockResolvedValue({
      ...attachment,
      internalStorageKey: "sanitized/private/object",
    });
    const handler = createBugReportUploadFinalizationHandler({
      isEnabled: () => true,
      uploadService: uploadService(finalizeUpload),
    });
    const finalizationToken = "f".repeat(48);

    const response = await handler(requestFor(finalizationToken), {
      params: Promise.resolve({ uploadId: "upload-object-0000001" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    await expect(response.json()).resolves.toEqual({ ok: true, attachment });
    expect(finalizeUpload).toHaveBeenCalledWith({
      uploadId: "upload-object-0000001",
      finalizationToken,
      abuseDecisionId: "finalize-decision-1",
    });
  });

  it("runs a durable anonymous attempt gate before parsing a finalization token", async () => {
    const finalizeUpload = vi.fn();
    const consumeAction = vi.fn();
    const handler = createHandler({
      isEnabled: () => true,
      uploadService: uploadService(finalizeUpload),
      canonicalSiteOrigin: "https://sal.example",
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
      new NextRequest("https://sal.example/api/bug-reports/uploads/x/finalize", {
        method: "POST",
        body: "not json",
      }),
      { params: Promise.resolve({ uploadId: "x" }) },
    );

    expect(response.status).toBe(429);
    expect(consumeAction).not.toHaveBeenCalled();
    expect(finalizeUpload).not.toHaveBeenCalled();
  });
});
