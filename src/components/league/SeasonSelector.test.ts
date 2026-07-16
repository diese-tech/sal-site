import { describe, expect, it, vi } from "vitest";
import { SeasonSelector } from "./SeasonSelector";
import type { Season } from "@/types/league";

vi.mock("next/navigation", () => ({ usePathname: () => "/standings" }));

function season(id: string): Season {
  return { id, name: id, status: "active", startDate: "", endDate: "", currentWeek: 1 };
}

describe("SeasonSelector", () => {
  it("returns null for 0 seasons", () => {
    expect(SeasonSelector({ seasons: [], currentSeasonId: "" })).toBeNull();
  });

  it("returns null for 1 season", () => {
    expect(SeasonSelector({ seasons: [season("s1")], currentSeasonId: "s1" })).toBeNull();
  });

  it("renders a link per season for 2 seasons", () => {
    const result = SeasonSelector({ seasons: [season("s1"), season("s2")], currentSeasonId: "s1" });
    expect(result).not.toBeNull();
    expect(result!.props.children).toHaveLength(2);
  });
});
