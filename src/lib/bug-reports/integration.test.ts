import { describe, expect, it } from "vitest";
import {
  BUG_REPORT_OUTBOX_TOPICS,
  BUG_REPORT_OUTBOX_SCHEMA_VERSION,
  buildAdminTicketProjection,
  buildAdminTicketUrl,
  buildReporterDmProjection,
} from "./integration";

describe("bug report SALbot integration contract", () => {
  it("builds a stable direct admin ticket URL", () => {
    expect(buildAdminTicketUrl("https://sal.example/", "BUG 190/one")).toBe(
      "https://sal.example/admin/tickets/BUG%20190%2Fone",
    );
  });

  it("creates an admin-channel projection without reporter identity or access secrets", () => {
    const projection = buildAdminTicketProjection({
      eventId: "event-bug-190-created",
      siteBaseUrl: "https://sal.example",
      ticketId: "BUG-190",
      category: "website",
      severity: "high",
      subject: "The standings page does not load",
      description: "@everyone The current season remains blank after it is selected.",
      attachmentCount: 2,
      createdAt: "2026-07-18T23:30:00.000Z",
    });

    expect(projection).toEqual({
      schemaVersion: BUG_REPORT_OUTBOX_SCHEMA_VERSION,
      eventId: "event-bug-190-created",
      deduplicationKey: "bug-report:BUG-190:admin-ticket-created",
      topic: BUG_REPORT_OUTBOX_TOPICS.adminTicketCreated,
      occurredAt: "2026-07-18T23:30:00.000Z",
      payload: {
        ticketId: "BUG-190",
        category: "website",
        severity: "high",
        subjectPreview: "The standings page does not load",
        descriptionPreview: "@​everyone The current season remains blank after it is selected.",
        attachmentCount: 2,
        status: "open",
        directTicketUrl: "https://sal.example/admin/tickets/BUG-190",
        mentionPolicy: "suppress_all",
      },
    });
    expect(JSON.stringify(projection)).not.toMatch(
      /reporter|discord|accessToken|accessUrl|recoveryCode/i,
    );
  });

  it("bounds staff previews and makes retries deterministically deduplicable", () => {
    const projection = buildAdminTicketProjection({
      eventId: "event-bug-191-created",
      siteBaseUrl: "https://sal.example",
      ticketId: "BUG-191",
      category: "other",
      severity: "normal",
      subject: "@here Please inspect this report",
      description: "x".repeat(5_000),
      attachmentCount: 0,
      createdAt: "2026-07-18T23:31:00.000Z",
    });

    expect(projection.deduplicationKey).toBe("bug-report:BUG-191:admin-ticket-created");
    expect(projection.payload.subjectPreview).toContain("@​here");
    expect(projection.payload.descriptionPreview.length).toBeLessThanOrEqual(1_000);
    expect(projection.payload.mentionPolicy).toBe("suppress_all");
  });

  it("builds a signed-in reporter DM without an anonymous bearer secret", () => {
    const projection = buildReporterDmProjection({
      eventId: "event-bug-191-dm",
      topic: BUG_REPORT_OUTBOX_TOPICS.reporterDmRequested,
      siteBaseUrl: "https://sal.example",
      publicTicketId: "public-ticket-191",
      ticketId: "BUG-191",
      messageId: "message-1",
      recipientDiscordId: "146116042182098944",
      message: "@everyone Staff requested more details.",
      createdAt: "2026-07-18T23:32:00.000Z",
    });

    expect(projection.payload.authenticatedTicketUrl).toBe(
      "https://sal.example/report-a-bug/tickets/public-ticket-191",
    );
    expect(projection.payload.messagePreview).toContain("@​everyone");
    expect(JSON.stringify(projection)).not.toMatch(/accessToken|recoveryCode|#access=/i);
  });
});
