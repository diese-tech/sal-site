import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { createScouterParticipantPatchHandler } from "./route";

const context = {
  params: Promise.resolve({ gameId: "game-1", participantId: "participant-1" }),
};

describe("PATCH /api/scouters/games/[gameId]/participants/[participantId]", () => {
  it("rejects callers without the internal service token", async () => {
    const handler = createScouterParticipantPatchHandler({ isAuthorized: () => false });
    const request = new NextRequest(
      "https://sal.example/api/scouters/games/game-1/participants/participant-1",
      { method: "PATCH" },
    );

    const response = await handler(request, context);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
  });

  it("reserves the correction path for the v2 workflow", async () => {
    const handler = createScouterParticipantPatchHandler({ isAuthorized: () => true });
    const request = new NextRequest(
      "https://sal.example/api/scouters/games/game-1/participants/participant-1",
      { method: "PATCH", headers: { Authorization: "Bearer internal-token" } },
    );

    const response = await handler(request, context);

    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toEqual({
      error: "Not implemented — v2 correction flow",
    });
  });
});
