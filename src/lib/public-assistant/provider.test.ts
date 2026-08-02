import { afterEach, describe, expect, it, vi } from "vitest";
import { askOpenRouterPublicAssistant } from "./provider";
import type { PublicModelPayload } from "./privacy";

const payload = {
  question: "How many points is a 2-0 win worth?",
  questionPrivacyDecisionId: "privacy-question",
  sources: [{
    id: "rulebook",
    sourceType: "published_rule",
    title: "SAL Rulebook",
    canonicalText: "A 2-0 win is worth 3 points.",
    ruleSetId: "sal-official-rules",
    releaseId: "google-doc-t0",
    sourceVersion: "abc123",
    approvalVersion: "public-sources-v1",
    conflictState: "none",
    privacyDecisionIds: ["privacy-title", "privacy-text"],
  }],
} as unknown as PublicModelPayload;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("OpenRouter public assistant", () => {
  it("uses the free model and accepts citations only from supplied source IDs", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        answer: "A 2-0 win is worth 3 league points.",
        citedSourceIds: ["rulebook", "invented-source"],
      }) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(askOpenRouterPublicAssistant(payload)).resolves.toEqual({
      answer: "A 2-0 win is worth 3 league points.",
      citedSourceIds: ["rulebook"],
    });

    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.model).toBe("openrouter/free");
    expect(request.messages[0].content).toContain("approved precedent scenarios");
  });

  it("fails closed when the model cites no approved source", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        answer: "Unsupported answer.",
        citedSourceIds: ["invented-source"],
      }) } }],
    }), { status: 200 })));

    await expect(askOpenRouterPublicAssistant(payload)).rejects.toThrow("did not cite an approved source");
  });

  it("retries once and extracts a valid JSON object from model prose", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: "I could not format that response." } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: `Here is the requested result:\n${JSON.stringify({
          answer: "Each team may pause once per set for technical reasons.",
          citedSourceIds: ["rulebook"],
        })}` } }],
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(askOpenRouterPublicAssistant(payload)).resolves.toEqual({
      answer: "Each team may pause once per set for technical reasons.",
      citedSourceIds: ["rulebook"],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
