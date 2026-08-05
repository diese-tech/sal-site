import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createStatReviewResolutionHandler } from "./route";

const context = { params: Promise.resolve({ id: "record-1" }) };

function request(body: unknown) {
  return new NextRequest("https://sal.example/api/admin/tickets/stat-reviews/record-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/admin/tickets/stat-reviews/[id]", () => {
  it("requires an audited Discord admin session", async () => {
    const resolveStatReview = vi.fn();
    const handler = createStatReviewResolutionHandler({
      getSession: () => ({ discordId: "password-admin" }),
      resolveStatReview,
    });

    const response = await handler(request({ decision: "approve" }), context);

    expect(response.status).toBe(403);
    expect(resolveStatReview).not.toHaveBeenCalled();
  });

  it("requires a denial note", async () => {
    const resolveStatReview = vi.fn();
    const handler = createStatReviewResolutionHandler({
      getSession: () => ({ discordId: "admin-1" }),
      resolveStatReview,
    });

    const response = await handler(request({ decision: "deny" }), context);

    expect(response.status).toBe(400);
    expect(resolveStatReview).not.toHaveBeenCalled();
  });

  it("maps approval to the canonical stat resolver", async () => {
    const resolveStatReview = vi.fn().mockResolvedValue({
      code: "applied",
      recordId: "record-1",
      finalStatus: "approved",
      applied: true,
    });
    const handler = createStatReviewResolutionHandler({
      getSession: () => ({ discordId: "admin-1" }),
      resolveStatReview,
    });

    const response = await handler(request({ decision: "approve" }), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, status: "approved" });
    expect(resolveStatReview).toHaveBeenCalledWith({
      recordId: "record-1",
      actorDiscordId: "admin-1",
      decision: "approve",
      note: undefined,
    });
  });

  it("maps database state conflicts to 409", async () => {
    const handler = createStatReviewResolutionHandler({
      getSession: () => ({ discordId: "admin-1" }),
      resolveStatReview: vi.fn().mockRejectedValue({ code: "55000" }),
    });

    const response = await handler(request({ decision: "approve" }), context);

    expect(response.status).toBe(409);
  });
});
