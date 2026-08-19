import type { MatchReportStatus } from "@/types/match-report";

export type HostIdentityStatus = "linked" | "duplicate" | "unlinked" | "ambiguous";

export interface HostReviewPlayer {
  index: number;
  side: "home" | "away";
  rawIgn: string;
  playerId: string | null;
  identityStatus: HostIdentityStatus;
}

export interface HostReviewDiagnostics {
  gameCount: number;
  duplicateIgns: string[];
  unlinkedIgns: string[];
  ambiguousIgns: string[];
  games: Array<{
    gameNumber: number;
    players: HostReviewPlayer[];
  }>;
}

export interface HostReviewRosterPlayer {
  id: string;
  ign: string;
}

export interface HostReviewTeam {
  id: string;
  name: string;
  tag: string;
  roster: HostReviewRosterPlayer[];
}

export interface HostMatchReportReview {
  report: {
    id: string;
    revision: number;
    status: MatchReportStatus;
    screenshotUrls: string[];
    games: import("@/types/match-report").ExtractedGame[];
    diagnostics: HostReviewDiagnostics;
  };
  match: {
    id: string;
    seasonId: string;
    divisionId: string;
    scheduledDate: string;
    week: number;
    home: HostReviewTeam;
    away: HostReviewTeam;
  };
}
