import { afterEach, describe, expect, it, vi } from "vitest";
import { callOpenRouterVision } from "./openrouter-vision";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("callOpenRouterVision", () => {
  it("uses the vision-specific model and returns the assistant content", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("OPENROUTER_MODEL", "fallback-model");
    vi.stubEnv("OPENROUTER_MODEL_VISION", "vision-model");
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ choices: [{ message: { content: "{\"ok\":true}" } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await callOpenRouterVision([
      { role: "user", content: [{ type: "text", text: "Extract this image" }] },
    ]);

    expect(result).toBe("{\"ok\":true}");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "vision-model" });
  });
});
