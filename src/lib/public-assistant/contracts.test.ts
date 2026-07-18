import { describe, expect, it } from "vitest";
import { PUBLIC_ASSISTANT_MODEL } from "@/types/public-assistant";
import { buildUnavailableResponse, parseAssistantQuestion } from "./contracts";

describe("public assistant contracts", () => {
  it("accepts a one-shot guidance question", () => {
    const result = parseAssistantQuestion({
      question: "Can a substitute play in this match?",
      intent: "guidance",
    });

    expect(result.success).toBe(true);
  });

  it("requires explicit confirmation for an official ruling request", () => {
    const result = parseAssistantQuestion({
      question: "Can a substitute play in this match?",
      intent: "request_official_ruling",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.rulingRequestConfirmed).toContain(
        "Confirm the advisory notice before requesting an official ruling.",
      );
    }
  });

  it("rejects chat history so the launch API remains one-shot", () => {
    const result = parseAssistantQuestion({
      question: "What does the published rule say?",
      intent: "guidance",
      chatHistory: [{ role: "user", content: "private prior message" }],
    });

    expect(result.success).toBe(false);
  });

  it("declares the free model and no paid fallback when disabled", () => {
    expect(buildUnavailableResponse(["durable_feature_flag_missing"])).toMatchObject({
      kind: "assistant_unavailable",
      model: PUBLIC_ASSISTANT_MODEL,
      paidFallback: false,
      retryable: false,
      escalation: { available: false },
    });
  });
});
