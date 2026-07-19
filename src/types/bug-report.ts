export const BUG_REPORT_CATEGORIES = [
  "website",
  "salbot",
  "account",
  "stats_data",
  "scout_match_report",
  "rules_ruling",
  "other",
] as const;

export type BugReportCategory = (typeof BUG_REPORT_CATEGORIES)[number];

export const BUG_REPORT_SEVERITIES = ["low", "normal", "high", "critical"] as const;

export type BugReportSeverity = (typeof BUG_REPORT_SEVERITIES)[number];

export type BugReportStatus =
  | "open"
  | "acknowledged"
  | "waiting_on_reporter"
  | "investigating"
  | "resolved"
  | "no_response";

export interface BugReportSubmissionPayload {
  category: BugReportCategory;
  severity: BugReportSeverity;
  subject: string;
  description: string;
  reproductionSteps: string;
  expectedBehavior: string;
  environment?: string;
  /** Requests a private Discord relay. Identity is resolved from the server session, never this payload. */
  replyRelayConsent: boolean;
}

export interface BugReportAttachmentDescriptor {
  name: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  size: number;
}

/**
 * Opaque claim returned only after a quarantined object passes server-side
 * finalization. It is not a storage key and must be stored hashed at rest.
 */
export interface BugReportAttachmentReference {
  opaqueRef: string;
}

export interface BugReportSubmissionRequest {
  payload: BugReportSubmissionPayload;
  attachments: BugReportAttachmentReference[];
}

export interface BugReportUploadSessionRequest {
  files: BugReportAttachmentDescriptor[];
}

export interface BugReportUploadTarget {
  uploadId: string;
  uploadUrl: string;
  method: "PUT";
  requiredHeaders: Record<string, string>;
  finalizationToken: string;
  expiresAt: string;
}

export interface BugReportUploadSessionReceipt {
  sessionId: string;
  targets: BugReportUploadTarget[];
  /** Exact HTTPS hosts approved by protected server runtime configuration. */
  allowedUploadHosts: string[];
  expiresAt: string;
}

export interface BugReportUploadSessionSuccessResponse {
  ok: true;
  uploadSession: BugReportUploadSessionReceipt;
}

export interface BugReportUploadFinalizationSuccessResponse {
  ok: true;
  attachment: BugReportAttachmentReference;
}

export interface BugReportSubmissionReceipt {
  ticketId: string;
  status: BugReportStatus;
  reporterAccess:
    | {
        kind: "anonymous";
        /** Contains a one-time token in the URL fragment, never the path or query. */
        accessUrl: string;
        recoveryCode: string;
      }
    | {
        kind: "signed_in";
        /** Uses the authenticated site session and contains no bearer secret. */
        accessUrl: string;
      };
  relay: {
    requested: boolean;
    queued: boolean;
  };
}

export type BugReportErrorCode =
  | "disabled"
  | "invalid_request"
  | "too_many_files"
  | "unsupported_file_type"
  | "file_too_large"
  | "invalid_file_content"
  | "upload_unavailable"
  | "upload_failed"
  | "invalid_upload_reference"
  | "rate_limited"
  | "rate_limit_unavailable"
  | "persistence_unavailable"
  | "submission_failed"
  | "submission_uncertain";

export interface BugReportSuccessResponse {
  ok: true;
  ticket: BugReportSubmissionReceipt;
}

export interface BugReportErrorResponse {
  ok: false;
  code: BugReportErrorCode;
  message: string;
  fieldErrors?: Partial<Record<keyof BugReportSubmissionPayload | "attachments", string>>;
  retryAfterSeconds?: number;
}

export type BugReportSubmissionResponse = BugReportSuccessResponse | BugReportErrorResponse;

export type BugReportUploadSessionResponse =
  | BugReportUploadSessionSuccessResponse
  | BugReportErrorResponse;

export type BugReportUploadFinalizationResponse =
  | BugReportUploadFinalizationSuccessResponse
  | BugReportErrorResponse;

export interface BugReportReplyRequest {
  message: string;
  idempotencyKey: string;
}

export interface BugReportReplyReceipt {
  messageId: string;
  ticketId: string;
  status: "queued" | "delivered" | "failed";
  createdAt: string;
}

export interface BugReportStatusResponse {
  ticketId: string;
  status: BugReportStatus;
  updatedAt: string;
  messages: Array<{
    id: string;
    direction: "reporter_to_admin" | "admin_to_reporter";
    message: string;
    deliveryStatus: "queued" | "delivered" | "failed";
    createdAt: string;
  }>;
}

export interface BugReportStatusSuccessResponse {
  ok: true;
  ticket: BugReportStatusResponse;
}

export type BugReportStatusLookupResponse =
  | BugReportStatusSuccessResponse
  | BugReportErrorResponse;
