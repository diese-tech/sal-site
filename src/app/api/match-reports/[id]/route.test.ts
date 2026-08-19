import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { HostMatchReportReview } from "@/types/match-report-host";
import { createHostReviewReadHandler } from "./route";

const reportId = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ id: reportId }) };
const review: HostMatchReportReview = {
  report: {
    id: reportId,
    revision: 1,
    status: "review",
    screenshotUrls: ["https://cdn.example/game-1.png"],
    games: [],
    diagnostics: {
      gameCount: 0,
      duplicateIgns: [],
      unlinkedIgns: [],
      ambiguousIgns: [],
      games: [],
    },
  },
  match: {
    id: "match-1",
    seasonId: "season-1",
    divisionId: "terra",
    scheduledDate: "2026-08-18",
    week: 1,
    home: { id: "home", name: "Home", tag: "H", roster: [] },
    away: { id: "away", name: "Away", tag: "A", roster: [] },
  },
};

describe("host match-report review read", () => {
  it("returns only the report bound to the signed host session", async () => {
    const readReview = vi.fn().mockResolvedValue(review);
    const handler = createHostReviewReadHandler({
      canonicalSiteOrigin: "https://sal.example",
      getSession: () => ({
        matchReportId: reportId,
        hostDiscordId: "1234567890",
        expiresAt: Date.now() + 60_000,
      }),
      readReview,
    });
    const request = new NextRequest(`https://sal.example/api/match-reports/${reportId}`);

    const response = await handler(request, context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, review });
    expect(readReview).toHaveBeenCalledWith({
      matchReportId: reportId,
      hostDiscordId: "1234567890",
    });
  });

  it("returns the same private 404 without a scoped session or matching report", async () => {
    const withoutSession = createHostReviewReadHandler({
      canonicalSiteOrigin: "https://sal.example",
      getSession: () => null,
      readReview: vi.fn(),
    });
    const missingReport = createHostReviewReadHandler({
      canonicalSiteOrigin: "https://sal.example",
      getSession: () => ({ matchReportId: reportId, hostDiscordId: "1234567890", expiresAt: Date.now() + 60_000 }),
      readReview: vi.fn().mockResolvedValue(null),
    });
    const request = new NextRequest(`https://sal.example/api/match-reports/${reportId}`);

    const first = await withoutSession(request, context);
    const second = await missingReport(request, context);

    expect(first.status).toBe(404);
    expect(second.status).toBe(404);
    expect(await first.json()).toEqual(await second.json());
    expect(first.headers.get("cache-control")).toContain("no-store");
    expect(second.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("fails closed for a cancelled report even when an old scoped session remains valid", async () => {
    const handler = createHostReviewReadHandler({
      canonicalSiteOrigin: "https://sal.example",
      getSession: () => ({
        matchReportId: reportId,
        hostDiscordId: "1234567890",
        expiresAt: Date.now() + 60_000,
      }),
      readReview: vi.fn().mockResolvedValue({
        ...review,
        report: { ...review.report, status: "cancelled" },
      }),
    });

    const response = await handler(
      new NextRequest(`https://sal.example/api/match-reports/${reportId}`),
      context,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: "This private match report could not be opened.",
    });
  });
});
