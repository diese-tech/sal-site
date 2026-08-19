import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSubmitHostReviewHandler } from "./route";

const reportId = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ id: reportId }) };

describe("host match-report submission", () => {
  it("submits the reviewed revision without granting final approval", async () => {
    const result = {
      code: "submitted" as const,
      applied: true,
      reportId,
      pendingActionId: "pending-1",
      matchId: "match-1",
      revision: 4,
      status: "host_review" as const,
      hostSubmittedAt: "2026-08-18T12:00:00.000Z",
      outboxIds: ["outbox-1"],
    };
    const submitReview = vi.fn().mockResolvedValue(result);
    const handler = createSubmitHostReviewHandler({
      canonicalSiteOrigin: "https://sal.example",
      getSession: () => ({
        matchReportId: reportId,
        hostDiscordId: "1234567890",
        expiresAt: Date.now() + 60_000,
      }),
      submitReview,
    });
    const request = new NextRequest(
      `https://sal.example/api/match-reports/${reportId}/submit`,
      {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://sal.example" },
        body: JSON.stringify({ revision: 4 }),
      },
    );

    const response = await handler(request, context);

    expect(response.status).toBe(200);
    expect(submitReview).toHaveBeenCalledWith({
      matchReportId: reportId,
      hostDiscordId: "1234567890",
      expectedRevision: 4,
    });
    expect(await response.json()).toEqual({ ok: true, result });
  });

  it("keeps duplicate or unresolved identities out of admin review", async () => {
    const submitReview = vi.fn().mockRejectedValue({ code: "23505" });
    const handler = createSubmitHostReviewHandler({
      canonicalSiteOrigin: "https://sal.example",
      getSession: () => ({ matchReportId: reportId, hostDiscordId: "1234567890", expiresAt: Date.now() + 60_000 }),
      submitReview,
    });
    const request = new NextRequest(`https://sal.example/api/match-reports/${reportId}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://sal.example" },
      body: JSON.stringify({ revision: 4 }),
    });

    const response = await handler(request, context);

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("Resolve every unlinked");
  });
});
