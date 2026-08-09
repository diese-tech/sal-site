import type { DivisionId } from "@/types/league";

export const DIVISION_HIERARCHY = ["terra", "solar", "lunar"] as const satisfies readonly DivisionId[];

export const DIVISION_FILTER_OPTIONS: ReadonlyArray<{ id: DivisionId; label: string }> = [
  { id: "terra", label: "Terra" },
  { id: "solar", label: "Solar" },
  { id: "lunar", label: "Lunar" },
];

const divisionRank = new Map<DivisionId, number>(
  DIVISION_HIERARCHY.map((divisionId, index) => [divisionId, index]),
);

export function compareDivisionHierarchy(a: DivisionId, b: DivisionId): number {
  return (divisionRank.get(a) ?? Number.MAX_SAFE_INTEGER) - (divisionRank.get(b) ?? Number.MAX_SAFE_INTEGER);
}
