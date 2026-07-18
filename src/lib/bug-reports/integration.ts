import type {
  BugReportCategory,
  BugReportSeverity,
  BugReportStatus,
} from "@/types/bug-report";

export const BUG_REPORT_OUTBOX_TOPICS = {
  adminTicketCreated: "bug_report.admin_ticket.created",
  adminTicketReply: "bug_report.admin_ticket.reply",
  reporterDmRequested: "bug_report.reporter_dm.requested",
  reporterDmReply: "bug_report.reporter_dm.reply",
  deliveryAcknowledged: "bug_report.delivery.acknowledged",
} as const;

export interface AdminTicketProjectionInput {
  siteBaseUrl: string;
  ticketId: string;
  category: BugReportCategory;
  severity: BugReportSeverity;
  subject: string;
  description: string;
  attachmentCount: number;
  createdAt: string;
}

/** Safe for the private staff channel. Reporter identity and access secrets are intentionally impossible inputs. */
export interface BugReportAdminTicketProjection {
  topic: typeof BUG_REPORT_OUTBOX_TOPICS.adminTicketCreated;
  ticketId: string;
  category: BugReportCategory;
  severity: BugReportSeverity;
  subject: string;
  description: string;
  attachmentCount: number;
  status: "open";
  directTicketUrl: string;
  createdAt: string;
}

export interface BugReportAdminReplyProjection {
  topic: typeof BUG_REPORT_OUTBOX_TOPICS.adminTicketReply;
  ticketId: string;
  messageId: string;
  message: string;
  status: BugReportStatus;
  directTicketUrl: string;
  createdAt: string;
}

/** Service-only payload. SALbot consumes this to DM a linked reporter without exposing identity in staff channels. */
export interface BugReportReporterDmProjection {
  topic:
    | typeof BUG_REPORT_OUTBOX_TOPICS.reporterDmRequested
    | typeof BUG_REPORT_OUTBOX_TOPICS.reporterDmReply;
  ticketId: string;
  messageId: string;
  recipientDiscordId: string;
  message: string;
  reporterAccessUrl: string;
  createdAt: string;
}

export interface BugReportDeliveryAcknowledgement {
  topic: typeof BUG_REPORT_OUTBOX_TOPICS.deliveryAcknowledged;
  ticketId: string;
  messageId: string;
  outboxId: string;
  externalMessageId: string | null;
  status: "delivered" | "failed";
  errorCode?: string;
  acknowledgedAt: string;
}

export function buildAdminTicketUrl(siteBaseUrl: string, ticketId: string): string {
  return new URL(`/admin/tickets/${encodeURIComponent(ticketId)}`, siteBaseUrl).toString();
}

export function buildAdminTicketProjection(
  input: AdminTicketProjectionInput,
): BugReportAdminTicketProjection {
  return {
    topic: BUG_REPORT_OUTBOX_TOPICS.adminTicketCreated,
    ticketId: input.ticketId,
    category: input.category,
    severity: input.severity,
    subject: input.subject,
    description: input.description,
    attachmentCount: input.attachmentCount,
    status: "open",
    directTicketUrl: buildAdminTicketUrl(input.siteBaseUrl, input.ticketId),
    createdAt: input.createdAt,
  };
}
