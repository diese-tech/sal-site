import { describe, expect, it } from "vitest";
import { PUBLIC_ASSISTANT_MODEL, RULING_DEEP_LINKS } from "@/types/public-assistant";
import {
  buildUnavailableResponse,
  parseAssistantQuestion,
  parsePublicAssistantResponse,
} from "./contracts";

const escalation = {
  available: true,
  requestPath: RULING_DEEP_LINKS.requestAnchor,
  adminTicketPath: null,
  publicStatusPath: null,
};

function deterministicResponse() {
  return {
    ok: true,
    apiVersion: "1",
    kind: "deterministic_guidance",
    authority: "advisory",
    answer: "The current published rule directly addresses the supplied facts.",
    citations: [
      {
        sourceId: "rule-1",
        sourceType: "published_rule",
        title: "Roster Rule",
        ruleSetId: "rules-2026",
        releaseId: "rules-2026.1",
        version: "3.1",
        current: true,
        conflictState: "none",
        publicUrl: "/rules#rule-1",
      },
    ],
    determinism: {
      classification: "deterministic",
      validator: "published-rules-engine",
      verified: true,
      ruleVersion: "3.1",
    },
    modelConfidence: 0.94,
    model: PUBLIC_ASSISTANT_MODEL,
    escalation,
  };
}

describe("public assistant contracts", () => {
  it("accepts a one-shot guidance question", () => {
    expect(parseAssistantQuestion({ question: "Can a substitute play in this match?" }).success).toBe(true);
  });

  it("rejects official-request intent and chat history on the guidance endpoint", () => {
    expect(
      parseAssistantQuestion({
        question: "Can a substitute play in this match?",
        intent: "request_official_ruling",
        chatHistory: [{ role: "user", content: "private prior message" }],
      }).success,
    ).toBe(false);
  });

  it("requires a current published-rule citation matching deterministic ruleVersion", () => {
    const invalid = deterministicResponse();
    invalid.citations[0].version = "2.0";
    expect(parsePublicAssistantResponse(invalid)).toBeNull();
  });

  it("rejects unsafe citation URLs and out-of-range confidence", () => {
    const unsafe = deterministicResponse();
    unsafe.citations[0].publicUrl = "javascript:alert(1)";
    unsafe.modelConfidence = 1.1;
    expect(parsePublicAssistantResponse(unsafe)).toBeNull();

    const secretQuery = deterministicResponse();
    secretQuery.citations[0].publicUrl = "https://rules.example.com/rule?access_token=secret";
    expect(parsePublicAssistantResponse(secretQuery)).toBeNull();
  });

  it("requires ambiguous guidance to remain unverified", () => {
    expect(
      parsePublicAssistantResponse({
        ...deterministicResponse(),
        kind: "ambiguous_guidance",
        determinism: {
          classification: "ambiguous",
          validator: "published-rules-engine",
          verified: true,
          ruleVersion: null,
        },
      }),
    ).toBeNull();
  });

  it("accepts a fully validated deterministic response", () => {
    expect(parsePublicAssistantResponse(deterministicResponse())).toMatchObject({
      kind: "deterministic_guidance",
      determinism: { verified: true, ruleVersion: "3.1" },
    });
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
