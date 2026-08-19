import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHostReviewExtractHandler } from "./route";

const reportId = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ id: reportId }) };

describe("host match-report OCR extraction", () => {
  it("extracts only through the report-bound host session", async () => {
    const extract = vi.fn().mockResolvedValue({ report: { id: reportId } });
    const handler = createHostReviewExtractHandler({
      canonicalSiteOrigin: "https://sal.example",
      getSession: () => ({
        matchReportId: reportId,
        hostDiscordId: "1234567890",
        expiresAt: Date.now() + 60_000,
      }),
      extract,
    });
    const request = new NextRequest(`https://sal.example/api/match-reports/${reportId}/extract`, {
      method: "POST",
      headers: { origin: "https://sal.example" },
    });

    const response = await handler(request, context);

    expect(response.status).toBe(200);
    expect(extract).toHaveBeenCalledWith({
      matchReportId: reportId,
      hostDiscordId: "1234567890",
    });
    expect(await response.json()).toEqual({ ok: true, review: { report: { id: reportId } } });
  });
});
