import type {
  BugReportCategory,
  BugReportSeverity,
  BugReportStatus,
} from "@/types/bug-report";

export const BUG_REPORT_OUTBOX_SCHEMA_VERSION = 1 as const;
export const BUG_REPORT_DISCORD_PREVIEW_LIMIT = 1_000;

export const BUG_REPORT_OUTBOX_TOPICS = {
  adminTicketCreated: "bug_report.admin_ticket.created",
  adminTicketReply: "bug_report.admin_ticket.reply",
  reporterDmRequested: "bug_report.reporter_dm.requested",
  reporterDmReply: "bug_report.reporter_dm.reply",
  deliveryAcknowledged: "bug_report.delivery.acknowledged",
} as const;

type BugReportOutboxTopic =
  (typeof BUG_REPORT_OUTBOX_TOPICS)[keyof typeof BUG_REPORT_OUTBOX_TOPICS];

export interface BugReportOutboxEnvelope<TTopic extends BugReportOutboxTopic, TPayload> {
  schemaVersion: typeof BUG_REPORT_OUTBOX_SCHEMA_VERSION;
  eventId: string;
  deduplicationKey: string;
  topic: TTopic;
  occurredAt: string;
  payload: TPayload;
}

export interface AdminTicketProjectionInput {
  eventId: string;
  siteBaseUrl: string;
  ticketId: string;
  category: BugReportCategory;
  severity: BugReportSeverity;
  subject: string;
  description: string;
  attachmentCount: number;
  createdAt: string;
}

/** Staff-channel payload. Identity and access secrets are impossible inputs. */
export interface BugReportAdminTicketProjectionPayload {
  ticketId: string;
  category: BugReportCategory;
  severity: BugReportSeverity;
  subjectPreview: string;
  descriptionPreview: string;
  attachmentCount: number;
  status: "open";
  directTicketUrl: string;
  /** SALbot must also send Discord allowed_mentions with every parse list empty. */
  mentionPolicy: "suppress_all";
}

export type BugReportAdminTicketProjection = BugReportOutboxEnvelope<
  typeof BUG_REPORT_OUTBOX_TOPICS.adminTicketCreated,
  BugReportAdminTicketProjectionPayload
>;

export interface BugReportAdminReplyPayload {
  ticketId: string;
  messageId: string;
  messagePreview: string;
  status: BugReportStatus;
  directTicketUrl: string;
  mentionPolicy: "suppress_all";
}

export interface AdminReplyProjectionInput {
  eventId: string;
  siteBaseUrl: string;
  ticketId: string;
  messageId: string;
  message: string;
  status: BugReportStatus;
  createdAt: string;
}

export type BugReportAdminReplyProjection = BugReportOutboxEnvelope<
  typeof BUG_REPORT_OUTBOX_TOPICS.adminTicketReply,
  BugReportAdminReplyPayload
>;

/** Service-only DM payload. The URL requires the recipient's authenticated site session. */
export interface BugReportReporterDmPayload {
  ticketId: string;
  messageId: string;
  recipientDiscordId: string;
  messagePreview: string;
  authenticatedTicketUrl: string;
  mentionPolicy: "suppress_all";
}

export interface ReporterDmProjectionInput {
  eventId: string;
  topic:
    | typeof BUG_REPORT_OUTBOX_TOPICS.reporterDmRequested
    | typeof BUG_REPORT_OUTBOX_TOPICS.reporterDmReply;
  siteBaseUrl: string;
  publicTicketId: string;
  ticketId: string;
  messageId: string;
  recipientDiscordId: string;
  message: string;
  createdAt: string;
}

export type BugReportReporterDmProjection = BugReportOutboxEnvelope<
  | typeof BUG_REPORT_OUTBOX_TOPICS.reporterDmRequested
  | typeof BUG_REPORT_OUTBOX_TOPICS.reporterDmReply,
  BugReportReporterDmPayload
>;

export interface BugReportDeliveryAcknowledgementPayload {
  ticketId: string;
  messageId: string;
  outboxId: string;
  externalMessageId: string | null;
  status: "delivered" | "failed";
  errorCode?: string;
}

export type BugReportDeliveryAcknowledgement = BugReportOutboxEnvelope<
  typeof BUG_REPORT_OUTBOX_TOPICS.deliveryAcknowledged,
  BugReportDeliveryAcknowledgementPayload
>;

export function buildAdminTicketUrl(siteBaseUrl: string, ticketId: string): string {
  const url = new URL("/admin/tickets", siteBaseUrl);
  url.searchParams.set("ticket", ticketId);
  return url.toString();
}

export function buildAdminTicketProjection(
  input: AdminTicketProjectionInput,
): BugReportAdminTicketProjection {
  return {
    schemaVersion: BUG_REPORT_OUTBOX_SCHEMA_VERSION,
    eventId: input.eventId,
    deduplicationKey: `bug-report:${input.ticketId}:admin-ticket-created`,
    topic: BUG_REPORT_OUTBOX_TOPICS.adminTicketCreated,
    occurredAt: input.createdAt,
    payload: {
      ticketId: input.ticketId,
      category: input.category,
      severity: input.severity,
      subjectPreview: mentionSafePreview(input.subject, 120),
      descriptionPreview: mentionSafePreview(
        input.description,
        BUG_REPORT_DISCORD_PREVIEW_LIMIT,
      ),
      attachmentCount: input.attachmentCount,
      status: "open",
      directTicketUrl: buildAdminTicketUrl(input.siteBaseUrl, input.ticketId),
      mentionPolicy: "suppress_all",
    },
  };
}

export function buildAdminReplyProjection(
  input: AdminReplyProjectionInput,
): BugReportAdminReplyProjection {
  return {
    schemaVersion: BUG_REPORT_OUTBOX_SCHEMA_VERSION,
    eventId: input.eventId,
    deduplicationKey: `bug-report:${input.ticketId}:message:${input.messageId}:admin-ticket-reply`,
    topic: BUG_REPORT_OUTBOX_TOPICS.adminTicketReply,
    occurredAt: input.createdAt,
    payload: {
      ticketId: input.ticketId,
      messageId: input.messageId,
      messagePreview: mentionSafePreview(input.message, BUG_REPORT_DISCORD_PREVIEW_LIMIT),
      status: input.status,
      directTicketUrl: buildAdminTicketUrl(input.siteBaseUrl, input.ticketId),
      mentionPolicy: "suppress_all",
    },
  };
}

export function buildReporterDmProjection(
  input: ReporterDmProjectionInput,
): BugReportReporterDmProjection {
  return {
    schemaVersion: BUG_REPORT_OUTBOX_SCHEMA_VERSION,
    eventId: input.eventId,
    deduplicationKey: `bug-report:${input.ticketId}:message:${input.messageId}:${input.topic}`,
    topic: input.topic,
    occurredAt: input.createdAt,
    payload: {
      ticketId: input.ticketId,
      messageId: input.messageId,
      recipientDiscordId: input.recipientDiscordId,
      messagePreview: mentionSafePreview(input.message, BUG_REPORT_DISCORD_PREVIEW_LIMIT),
      authenticatedTicketUrl: new URL(
        `/report-a-bug/tickets/${encodeURIComponent(input.publicTicketId)}`,
        input.siteBaseUrl,
      ).toString(),
      mentionPolicy: "suppress_all",
    },
  };
}

export function mentionSafePreview(value: string, maxLength: number): string {
  const normalized = value.trim().replace(/@/g, "@\u200b");
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
