import { describe, expect, it, vi } from "vitest";
import { uploadHostReviewScreenshots, validateHostReviewScreenshotFiles } from "./upload-service";

describe("host screenshot limits", () => {
  it("accepts one image per request, five total, below Vercel's 4.5 MB body limit", () => {
    const png = new File([new Uint8Array([1])], "score.png", { type: "image/png" });
    expect(() => validateHostReviewScreenshotFiles(4, [png])).not.toThrow();

    expect(() => validateHostReviewScreenshotFiles(5, [png])).toThrow(/at most 5/);
    expect(() => validateHostReviewScreenshotFiles(0, [png, png])).toThrow(/one screenshot at a time/);
    expect(() => validateHostReviewScreenshotFiles(0, [
      new File([new Uint8Array([1])], "score.svg", { type: "image/svg+xml" }),
    ])).toThrow(/PNG, JPEG, or WebP/);
    expect(() => validateHostReviewScreenshotFiles(0, [
      new File([new Uint8Array(4 * 1024 * 1024 + 1)], "huge.png", { type: "image/png" }),
    ])).toThrow(/4 MB/);
    expect(() => validateHostReviewScreenshotFiles(0, [
      new File([new Uint8Array(4 * 1024 * 1024)], "limit.png", { type: "image/png" }),
    ])).not.toThrow();
  });

  it("does not store a screenshot for a cancelled report", async () => {
    const query = {
      select() { return this; },
      eq() { return this; },
      single: async () => ({
        data: { id: "report-1", status: "cancelled", revision: 3, screenshot_urls: [] },
        error: null,
      }),
    };
    const storageFrom = vi.fn();
    const client = { from: () => query, storage: { from: storageFrom } };
    const screenshot = new File([new Uint8Array([1])], "score.png", { type: "image/png" });

    await expect(uploadHostReviewScreenshots(client as never, {
      matchReportId: "11111111-1111-4111-8111-111111111111",
      hostDiscordId: "host-1",
      files: [screenshot],
    })).rejects.toMatchObject({ code: "42501" });
    expect(storageFrom).not.toHaveBeenCalled();
  });
});
