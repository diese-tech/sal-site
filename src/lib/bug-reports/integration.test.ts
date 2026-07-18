import { describe, expect, it } from "vitest";
import {
  BUG_REPORT_OUTBOX_TOPICS,
  buildAdminTicketProjection,
  buildAdminTicketUrl,
} from "./integration";

describe("bug report SALbot integration contract", () => {
  it("builds a stable direct admin ticket URL", () => {
    expect(buildAdminTicketUrl("https://sal.example/", "BUG 190/one")).toBe(
      "https://sal.example/admin/tickets/BUG%20190%2Fone",
    );
  });

  it("creates an admin-channel projection without reporter identity or access secrets", () => {
    const projection = buildAdminTicketProjection({
      siteBaseUrl: "https://sal.example",
      ticketId: "BUG-190",
      category: "website",
      severity: "high",
      subject: "The standings page does not load",
      description: "The current season remains blank after it is selected.",
      attachmentCount: 2,
      createdAt: "2026-07-18T23:30:00.000Z",
    });

    expect(projection).toEqual({
      topic: BUG_REPORT_OUTBOX_TOPICS.adminTicketCreated,
      ticketId: "BUG-190",
      category: "website",
      severity: "high",
      subject: "The standings page does not load",
      description: "The current season remains blank after it is selected.",
      attachmentCount: 2,
      status: "open",
      directTicketUrl: "https://sal.example/admin/tickets/BUG-190",
      createdAt: "2026-07-18T23:30:00.000Z",
    });
    expect(JSON.stringify(projection)).not.toMatch(/reporter|discord|accessToken|recoveryCode/i);
  });
});
