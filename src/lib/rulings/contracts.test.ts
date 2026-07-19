import { describe, expect, it } from "vitest";
import { RULING_CONFIRMATION_NOTICE_VERSION } from "@/types/ruling-request";
import {
  buildRulingRequestUnavailableResponse,
  parseOfficialRulingRequest,
  parseRulingRequestHeaders,
} from "./contracts";

function validRequest() {
  return {
    question: "Is this player eligible for the scheduled match?",
    bindingCase: {
      caseType: "eligibility",
      urgency: "normal",
      seasonId: "season-preseason",
      divisionId: "solar",
      matchId: "match-12",
      playerId: "player-7",
      teamId: "team-2",
      facts: [{ key: "roster_status", value: "The player appears on the current roster." }],
    },
    confirmation: {
      accepted: true,
      noticeVersion: RULING_CONFIRMATION_NOTICE_VERSION,
    },
  };
}

describe("official ruling request contract", () => {
  it("requires complete binding-case facts and the current confirmation notice", () => {
    expect(parseOfficialRulingRequest(validRequest()).success).toBe(true);
    expect(
      parseOfficialRulingRequest({
        ...validRequest(),
        bindingCase: { ...validRequest().bindingCase, facts: [] },
        confirmation: { accepted: true, noticeVersion: "old-notice" },
      }).success,
    ).toBe(false);
  });

  it("requires case-specific eligibility, roster, and game-day facts", () => {
    const eligibility = validRequest();
    expect(
      parseOfficialRulingRequest({
        ...eligibility,
        bindingCase: {
          caseType: "eligibility",
          urgency: "normal",
          seasonId: "season-preseason",
          teamId: "team-2",
          facts: eligibility.bindingCase.facts,
        },
      }).success,
    ).toBe(false);

    expect(
      parseOfficialRulingRequest({
        ...eligibility,
        bindingCase: {
          caseType: "roster",
          urgency: "normal",
          seasonId: "season-preseason",
          playerId: "player-7",
          teamId: "team-2",
          facts: eligibility.bindingCase.facts,
        },
      }).success,
    ).toBe(false);

    expect(
      parseOfficialRulingRequest({
        ...eligibility,
        bindingCase: {
          caseType: "game_day",
          urgency: "game_day_urgent",
          seasonId: "season-preseason",
          matchId: "match-12",
          requestingTeamId: "team-2",
          opponentTeamId: "team-3",
          facts: eligibility.bindingCase.facts,
        },
      }).success,
    ).toBe(true);

    expect(
      parseOfficialRulingRequest({
        ...eligibility,
        bindingCase: {
          caseType: "game_day",
          urgency: "normal",
          seasonId: "season-preseason",
          matchId: "match-12",
          requestingTeamId: "team-2",
          opponentTeamId: "team-2",
          facts: eligibility.bindingCase.facts,
        },
      }).success,
    ).toBe(false);
  });

  it("requires both CSRF and idempotency header contracts", () => {
    const valid = new Headers({
      "Idempotency-Key": "018f99f3-5946-7d24-a0ab-8d936d13d55a",
      "X-CSRF-Token": "a".repeat(32),
    });
    expect(parseRulingRequestHeaders(valid).success).toBe(true);
    expect(parseRulingRequestHeaders(new Headers()).success).toBe(false);
  });

  it("returns future-tense unavailable copy and confirms no ticket was created", () => {
    expect(buildRulingRequestUnavailableResponse()).toMatchObject({
      kind: "ruling_request_unavailable",
      code: "RULING_REQUESTS_DISABLED",
      retryable: false,
    });
    expect(buildRulingRequestUnavailableResponse().message).toContain("No ticket was created");
  });
});
