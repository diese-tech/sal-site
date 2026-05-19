import type { DivisionId } from "@/types/league";

export type DraftStatus = "pending" | "active" | "paused" | "complete";

export interface DraftRoom {
  id: string;
  seasonId: string;
  divisionId: DivisionId;
  status: DraftStatus;
  rounds: number;
  pickTimerSeconds: number;
  baseOrder: string[];       // org IDs in round-1 pick order
  currentPickIndex: number;  // 0-based index into the full snake sequence
  pickStartedAt?: string;    // ISO string — when the current pick clock started
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface DraftPick {
  id: number;
  draftRoomId: string;
  pickNumber: number;         // 1-based
  orgId: string;
  playerId: string;
  pickedAt: string;
}

export interface DraftState {
  room: DraftRoom;
  picks: DraftPick[];
  // Derived: full snake pick sequence for all rounds
  pickSequence: string[];     // org IDs in order for every pick
  currentOrgId: string | null;
  totalPicks: number;         // rounds × baseOrder.length
  secondsRemaining: number | null;
}

/** Compute the full snake pick sequence from base order and round count. */
export function buildPickSequence(baseOrder: string[], rounds: number): string[] {
  const seq: string[] = [];
  for (let r = 0; r < rounds; r++) {
    const row = r % 2 === 0 ? baseOrder : [...baseOrder].reverse();
    seq.push(...row);
  }
  return seq;
}
