import { describe, expect, it } from "vitest";
import { formatAuditEntry, relativeTime } from "@/lib/audit-format";
import type { AuditLogEntry } from "@/lib/league-data";

function entry(overrides: Partial<AuditLogEntry>): AuditLogEntry {
  return {
    id: 1,
    action: "save_player",
    entityType: "player",
    entityId: "d74f43d3-37fc-4993-a7f3-e2d7df95a38f",
    payload: null,
    createdAt: "2026-06-11T01:48:15Z",
    ...overrides,
  };
}

describe("formatAuditEntry", () => {
  it("uses the IGN from the payload instead of the raw uuid", () => {
    const f = formatAuditEntry(entry({ payload: { ign: "AzraelP-HRX" } }));
    expect(f.text).toBe('Player "AzraelP-HRX" saved');
    expect(f.href).toBe("/admin/players");
    expect(f.category).toBe("Roster");
  });

  it("shortens raw ids when no friendly name exists", () => {
    const f = formatAuditEntry(entry({ payload: null }));
    expect(f.text).toContain("d74f43d3…");
    expect(f.text).not.toContain("e2d7df95a38f");
  });

  it("describes registration approval in plain language", () => {
    const f = formatAuditEntry(entry({ action: "approve_registration", entityType: "registration", entityId: "reg-1" }));
    expect(f.text).toBe("Registration approved — player record created");
    expect(f.href).toBe("/admin/registrations");
  });

  it("formats match report submissions with the matchup and score", () => {
    const f = formatAuditEntry(
      entry({
        action: "match_report_submitted",
        entityType: "match_report",
        payload: { homeOrg: "Helix Reign", awayOrg: "Venom Strike", homeScore: 2, awayScore: 1 },
      }),
    );
    expect(f.text).toBe("Result submitted: Helix Reign 2–1 Venom Strike");
    expect(f.href).toBe("/admin/match-report");
  });

  it("falls back to a title-cased action for unknown actions", () => {
    const f = formatAuditEntry(entry({ action: "mystery_action", entityType: null, entityId: null }));
    expect(f.text).toBe("Mystery action");
    expect(f.tone).toBe("slate");
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-06-11T12:00:00Z");
  it("formats recent and older timestamps", () => {
    expect(relativeTime("2026-06-11T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-06-11T11:45:00Z", now)).toBe("15m ago");
    expect(relativeTime("2026-06-11T08:00:00Z", now)).toBe("4h ago");
    expect(relativeTime("2026-06-09T08:00:00Z", now)).toBe("2d ago");
  });
});
