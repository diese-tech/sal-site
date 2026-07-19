export const RULING_REQUEST_API_VERSION = "1" as const;
export const RULING_CONFIRMATION_NOTICE_VERSION = "sal-binding-ruling-request-2026-07-18" as const;

export type BindingCaseType = "eligibility" | "roster" | "game_day" | "conduct" | "other";
export type BindingCaseUrgency = "normal" | "game_day_urgent";
export type AffectedPartyType = "player" | "team" | "match" | "organization";

export interface BindingCaseFact {
  key: string;
  value: string;
}

export interface BindingCaseParty {
  type: AffectedPartyType;
  id: string;
}

interface BindingCaseBase {
  urgency: BindingCaseUrgency;
  seasonId: string;
  divisionId?: string;
  facts: BindingCaseFact[];
}

export interface EligibilityCaseFacts extends BindingCaseBase {
  caseType: "eligibility";
  playerId: string;
  teamId: string;
  matchId?: string;
}

export interface RosterCaseFacts extends BindingCaseBase {
  caseType: "roster";
  playerId: string;
  teamId: string;
  rosterAction: "add" | "remove" | "substitute" | "transfer";
  matchId?: string;
}

export interface GameDayCaseFacts extends Omit<BindingCaseBase, "urgency"> {
  caseType: "game_day";
  urgency: "game_day_urgent";
  matchId: string;
  requestingTeamId: string;
  opponentTeamId: string;
  gameNumber?: number;
}

export interface ConductCaseFacts extends BindingCaseBase {
  caseType: "conduct";
  subject: BindingCaseParty;
  matchId?: string;
}

export interface OtherCaseFacts extends BindingCaseBase {
  caseType: "other";
  affectedParties: BindingCaseParty[];
  matchId?: string;
}

export type BindingCaseFacts =
  | EligibilityCaseFacts
  | RosterCaseFacts
  | GameDayCaseFacts
  | ConductCaseFacts
  | OtherCaseFacts;

export interface OfficialRulingRequest {
  question: string;
  bindingCase: BindingCaseFacts;
  confirmation: {
    accepted: true;
    noticeVersion: typeof RULING_CONFIRMATION_NOTICE_VERSION;
  };
}

export interface SignedInRulingRequester {
  authUserId: string;
  discordId: string;
}

export interface RulingTicketCreatedResponse {
  ok: true;
  apiVersion: typeof RULING_REQUEST_API_VERSION;
  kind: "ruling_ticket_created";
  ticketId: string;
  adminTicketPath: string;
  status: "pending_admin_review";
}

export interface RulingRequestUnavailableResponse {
  ok: false;
  apiVersion: typeof RULING_REQUEST_API_VERSION;
  kind: "ruling_request_unavailable";
  code: "RULING_REQUESTS_DISABLED";
  message: string;
  retryable: false;
}

export interface RulingRequestErrorResponse {
  ok: false;
  apiVersion: typeof RULING_REQUEST_API_VERSION;
  kind: "ruling_request_error";
  code: "SIGN_IN_REQUIRED" | "INVALID_REQUEST" | "INVALID_CSRF_TOKEN";
  message: string;
  fieldErrors?: Record<string, string[]>;
}

export type RulingRequestResponse =
  | RulingTicketCreatedResponse
  | RulingRequestUnavailableResponse
  | RulingRequestErrorResponse;
