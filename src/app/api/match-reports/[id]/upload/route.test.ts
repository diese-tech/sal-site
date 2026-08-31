import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHostReviewUploadHandler } from "./route";

const reportId = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ id: reportId }) };

describe("host match-report screenshot upload", () => {
  it("uploads only through the report-bound host session", async () => {
    const upload = vi.fn().mockResolvedValue({
      urls: ["https://cdn.example/game-1.png"],
      allUrls: ["https://cdn.example/game-1.png"],
      revision: 2,
    });
    const handler = createHostReviewUploadHandler({
      canonicalSiteOrigin: "https://sal.example",
      getSession: () => ({
        matchReportId: reportId,
        hostDiscordId: "1234567890",
        expiresAt: Date.now() + 60_000,
      }),
      upload,
    });
    const form = new FormData();
    form.append("screenshots", new File([new Uint8Array([1, 2, 3])], "score.png", { type: "image/png" }));
    const request = new NextRequest(`https://sal.example/api/match-reports/${reportId}/upload`, {
      method: "POST",
      headers: { origin: "https://sal.example" },
      body: form,
    });

    const response = await handler(request, context);

    expect(response.status).toBe(200);
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({
      matchReportId: reportId,
      hostDiscordId: "1234567890",
    }));
    expect((upload.mock.calls[0]?.[0].files as File[])[0]?.name).toBe("score.png");
  });
});
