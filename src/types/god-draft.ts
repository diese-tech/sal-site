import type { Match, Org } from "@/types/league";

export type DraftSide = "A" | "B";
export type DraftActionType = "ban" | "pick";
export type DraftStatus = "pending" | "lobby" | "banning" | "picking" | "complete";
export type DraftChatChannel = "team" | "spectator";
export type DraftRole = "home_captain" | "away_captain" | "team" | "spectator" | "admin";

export interface DraftPhase {
  type: DraftActionType;
  sequence: DraftSide[];
}

export interface DraftGod {
  id: string;
  name: string;
  class: string | null;
  damageType: "physical" | "magical" | null;
}

export interface DraftSelection {
  side: DraftSide;
  type: DraftActionType;
  godId: string;
  godName: string;
  skipped?: boolean;
  createdAt: string;
}

export interface DraftState {
  picks: DraftSelection[];
  bans: DraftSelection[];
}

export interface GodDraftSession {
  id: string;
  matchId: string;
  gameNumber: number;
  status: DraftStatus;
  homeReady: boolean;
  awayReady: boolean;
  currentPhaseIndex: number;
  currentStepIndex: number;
  currentType: DraftActionType | null;
  currentSide: DraftSide | null;
  turnStartedAt: string | null;
  draftState: DraftState;
  resetRequestedBy: DraftSide | null;
}

export interface DraftChatMessage {
  id: string;
  sessionId: string;
  channel: DraftChatChannel;
  senderName: string;
  body: string;
  createdAt: string;
}

export interface GodDraftRoomData {
  session: GodDraftSession;
  match: Match;
  homeOrg: Org;
  awayOrg: Org;
  gods: DraftGod[];
  vaultedGodIds: string[];
  chatMessages: DraftChatMessage[];
  role: DraftRole | null;
  side: DraftSide | null;
  canChatTeam: boolean;
  canChatSpectator: boolean;
  isAuthenticated: boolean;
}
