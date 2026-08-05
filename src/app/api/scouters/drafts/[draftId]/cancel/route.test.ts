import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { createScouterDraftCancelHandler } from "./route";

const context = { params: Promise.resolve({ draftId: "draft-1" }) };

describe("POST /api/scouters/drafts/[draftId]/cancel", () => {
  it("returns an idempotent cancellation receipt", async () => {
    const cancelDraft = vi.fn().mockResolvedValue({
      code: "already_cancelled",
      applied: false,
      draftId: "draft-1",
      revision: 2,
      status: "cancelled",
    });
    const handler = createScouterDraftCancelHandler({
      isAuthorized: () => true,
      cancelDraft,
    });
    const response = await handler(new NextRequest(
      "https://sal.example/api/scouters/drafts/draft-1/cancel",
      { method: "POST", body: JSON.stringify({ hosted_by_discord_id: "host-1" }) },
    ), context);

    expect(cancelDraft).toHaveBeenCalledWith("draft-1", "host-1");
    await expect(response.json()).resolves.toMatchObject({
      code: "already_cancelled",
      applied: false,
      status: "cancelled",
    });
  });
});
