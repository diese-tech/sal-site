import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeCache = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock("@vercel/functions", () => ({
  getCache: () => runtimeCache,
}));

import { deliverErrorReport } from "./error-monitor";

describe("deliverErrorReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DISCORD_ERROR_WEBHOOK_URL = "https://discord.invalid/webhook";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  });

  it("sends the first availability error and suppresses an identical repeat via shared cache", async () => {
    runtimeCache.get
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ firstSeenAt: "2026-08-03T22:00:00.000Z" });
    runtimeCache.set.mockResolvedValue(undefined);

    const first = await deliverErrorReport(
      "getLeagueData",
      new Error("Season assignments reference unavailable identities."),
      { seasonId: "preseason-s2", missingPlayerIds: ["player-1"] },
    );
    const repeat = await deliverErrorReport(
      "getLeagueData",
      new Error("Season assignments reference unavailable identities."),
      { seasonId: "preseason-s2", missingPlayerIds: ["player-1"] },
    );

    expect(first).toBe("sent");
    expect(repeat).toBe("suppressed");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(runtimeCache.set).toHaveBeenCalledTimes(1);
    expect(runtimeCache.set).toHaveBeenCalledWith(
      expect.stringMatching(/^availability:/),
      expect.objectContaining({ firstSeenAt: expect.any(String) }),
      expect.objectContaining({ ttl: 300, name: "error-report-deduplication" }),
    );
  });

  it("does nothing when the webhook is disabled", async () => {
    delete process.env.DISCORD_ERROR_WEBHOOK_URL;

    await expect(deliverErrorReport("getLeagueData", new Error("boom"))).resolves.toBe("disabled");
    expect(runtimeCache.get).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
