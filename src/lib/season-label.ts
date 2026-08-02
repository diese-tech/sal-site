import type { Season, SeasonStatus } from "@/types/league";

const STATUS_LABELS: Record<SeasonStatus, string> = {
  "pre-season": "Pre-Season",
  active: "Active",
  "post-season": "Post-Season",
  offseason: "Offseason",
};

export function formatSeasonLabel(season: Pick<Season, "name" | "status">) {
  return `${season.name} · ${STATUS_LABELS[season.status]}`;
}
