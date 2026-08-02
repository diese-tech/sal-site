import { describe, expect, it } from "vitest";
import { formatEstTime, formatMatchDate, formatShortMatchDate } from "./date-format";

describe("EST schedule formatting", () => {
  it("labels stored league times as EST without applying the runtime timezone", () => {
    expect(formatEstTime("20:00")).toBe("8:00 PM EST");
    expect(formatEstTime("00:30")).toBe("12:30 AM EST");
  });

  it("keeps the scheduled calendar date stable", () => {
    expect(formatMatchDate("2026-08-02", "20:00")).toBe("Sun, Aug 2 · 8:00 PM EST");
    expect(formatShortMatchDate("2026-08-02", "20:00")).toBe("Sun 8:00 PM EST");
  });
});
