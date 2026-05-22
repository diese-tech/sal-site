import type { DraftActionType, DraftPhase, DraftSide, DraftState } from "@/types/god-draft";

export const TURN_SECONDS = 45;

export const DRAFT_FORMAT: DraftPhase[] = [
  { type: "ban", sequence: ["A", "B", "A", "B", "A", "B"] },
  { type: "pick", sequence: ["A", "B", "B", "A", "A", "B"] },
  { type: "pick", sequence: ["B", "A", "A", "B"] },
];

export interface DraftTurn {
  phaseIndex: number;
  stepIndex: number;
  type: DraftActionType;
  side: DraftSide;
}

export function getDraftTurn(format: DraftPhase[], phaseIndex: number, stepIndex: number): DraftTurn | null {
  const phase = format[phaseIndex];
  const side = phase?.sequence[stepIndex];
  if (!phase || !side) return null;
  return { phaseIndex, stepIndex, type: phase.type, side };
}

export function getFirstDraftTurn(format: DraftPhase[] = DRAFT_FORMAT) {
  return getDraftTurn(format, 0, 0);
}

export function getNextDraftTurn(format: DraftPhase[], phaseIndex: number, stepIndex: number): DraftTurn | null {
  const phase = format[phaseIndex];
  if (!phase) return null;
  const nextInPhase = getDraftTurn(format, phaseIndex, stepIndex + 1);
  if (nextInPhase) return nextInPhase;
  return getDraftTurn(format, phaseIndex + 1, 0);
}

export function emptyDraftState(): DraftState {
  return { picks: [], bans: [] };
}
