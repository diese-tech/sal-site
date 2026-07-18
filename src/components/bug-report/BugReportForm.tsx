"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { BugReportConfirmationModal } from "./BugReportConfirmationModal";
import {
  BUG_REPORT_ATTACHMENT_LIMITS,
  BUG_REPORT_CATEGORY_OPTIONS,
  BUG_REPORT_SEVERITY_OPTIONS,
  parseBugReportPayload,
  validateBugReportAttachments,
} from "@/lib/bug-reports/contracts";
import type {
  BugReportErrorResponse,
  BugReportSubmissionPayload,
  BugReportSubmissionReceipt,
  BugReportSubmissionResponse,
} from "@/types/bug-report";

const INITIAL_REPORT: BugReportSubmissionPayload = {
  category: "website",
  severity: "normal",
  subject: "",
  description: "",
  reproductionSteps: "",
  expectedBehavior: "",
  environment: "",
  replyRelayConsent: false,
};

type FieldErrors = Partial<Record<keyof BugReportSubmissionPayload | "attachments", string>>;

export function BugReportForm({
  relayAvailable,
  submissionEnabled,
}: {
  relayAvailable: boolean;
  submissionEnabled: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<BugReportSubmissionPayload>(INITIAL_REPORT);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<BugReportSubmissionReceipt | null>(null);

  function updateField<K extends keyof BugReportSubmissionPayload>(
    field: K,
    value: BugReportSubmissionPayload[K],
  ) {
    setReport((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setSubmitError(null);
  }

  async function prepareConfirmation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    const payloadResult = parseBugReportPayload(report);
    const attachmentResult = await validateBugReportAttachments(attachments);
    const nextErrors: FieldErrors = payloadResult.success ? {} : payloadResult.fieldErrors;
    if (!attachmentResult.success) nextErrors.attachments = attachmentResult.message;
    setFieldErrors(nextErrors);

    if (!payloadResult.success || !attachmentResult.success) {
      focusFirstInvalidField(nextErrors);
      return;
    }

    setReport(payloadResult.data);
    setConfirmationOpen(true);
  }

  async function confirmSubmission() {
    if (!submissionEnabled || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    const body = new FormData();
    body.set("payload", JSON.stringify(report));
    for (const attachment of attachments) body.append("attachments", attachment, attachment.name);

    try {
      const response = await fetch("/api/bug-reports", { method: "POST", body });
      const result = (await response.json()) as BugReportSubmissionResponse;
      if (!response.ok || !result.ok) {
        const failure = result as BugReportErrorResponse;
        setFieldErrors(failure.fieldErrors ?? {});
        setSubmitError(failure.message ?? "The report could not be submitted.");
        setConfirmationOpen(false);
        return;
      }

      setReceipt(result.ticket);
      setConfirmationOpen(false);
    } catch {
      setSubmitError("The report could not reach SAL. Nothing was submitted, so please try again.");
      setConfirmationOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  function addAttachments(files: FileList | null) {
    if (!files) return;
    const next = [...attachments, ...Array.from(files)];
    setAttachments(next);
    setFieldErrors((current) => ({ ...current, attachments: undefined }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeAttachment(index: number) {
    setAttachments((current) => current.filter((_, currentIndex) => currentIndex !== index));
    setFieldErrors((current) => ({ ...current, attachments: undefined }));
  }

  if (receipt) return <BugReportReceipt receipt={receipt} />;

  const inputClass =
    "w-full rounded-lg border border-white/10 bg-black/35 px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/10";

  return (
    <>
      <form
        onSubmit={prepareConfirmation}
        noValidate
        className="overflow-hidden rounded-[var(--sal-card-radius)] border border-white/10 bg-slate-950/80 shadow-2xl shadow-black/25 backdrop-blur"
      >
        {!submissionEnabled ? (
          <div className="border-b border-amber-300/20 bg-amber-300/[0.07] px-5 py-3 text-sm text-amber-100 sm:px-7">
            <strong>Preview available.</strong> Secure storage and shared rate limiting are still being
            connected. You can prepare and review a report, but it cannot be submitted yet.
          </div>
        ) : null}

        <div className="space-y-8 p-5 sm:p-7">
          <FormSection number="01" title="Classify the problem" description="Help us route it without guessing.">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Category" error={fieldErrors.category} required>
                <select
                  id="category"
                  value={report.category}
                  onChange={(event) =>
                    updateField("category", event.target.value as BugReportSubmissionPayload["category"])
                  }
                  className={inputClass}
                >
                  {BUG_REPORT_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-slate-500">
                  {BUG_REPORT_CATEGORY_OPTIONS.find((option) => option.value === report.category)?.description}
                </p>
              </Field>

              <Field label="Severity" error={fieldErrors.severity} required>
                <select
                  id="severity"
                  value={report.severity}
                  onChange={(event) =>
                    updateField("severity", event.target.value as BugReportSubmissionPayload["severity"])
                  }
                  className={inputClass}
                >
                  {BUG_REPORT_SEVERITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-slate-500">
                  {BUG_REPORT_SEVERITY_OPTIONS.find((option) => option.value === report.severity)?.description}
                </p>
              </Field>
            </div>

            <Field label="Short subject" error={fieldErrors.subject} required>
              <input
                id="subject"
                value={report.subject}
                onChange={(event) => updateField("subject", event.target.value)}
                maxLength={120}
                placeholder="Example: Current season standings stay blank"
                className={inputClass}
              />
              <CharacterCount value={report.subject} max={120} />
            </Field>
          </FormSection>

          <FormSection
            number="02"
            title="Show us what happened"
            description="Specific steps make a report much faster to reproduce."
          >
            <Field label="What happened?" error={fieldErrors.description} required>
              <textarea
                id="description"
                value={report.description}
                onChange={(event) => updateField("description", event.target.value)}
                rows={5}
                maxLength={5_000}
                placeholder="Describe the problem, when it happened, and what you were trying to do."
                className={inputClass}
              />
              <CharacterCount value={report.description} max={5_000} />
            </Field>

            <div className="grid gap-5 lg:grid-cols-2">
              <Field label="Steps to reproduce" error={fieldErrors.reproductionSteps} required>
                <textarea
                  id="reproductionSteps"
                  value={report.reproductionSteps}
                  onChange={(event) => updateField("reproductionSteps", event.target.value)}
                  rows={5}
                  maxLength={3_000}
                  placeholder={"1. Open...\n2. Select...\n3. See..."}
                  className={inputClass}
                />
              </Field>

              <Field label="What should have happened?" error={fieldErrors.expectedBehavior} required>
                <textarea
                  id="expectedBehavior"
                  value={report.expectedBehavior}
                  onChange={(event) => updateField("expectedBehavior", event.target.value)}
                  rows={5}
                  maxLength={2_000}
                  placeholder="Tell us what the correct result should be."
                  className={inputClass}
                />
              </Field>
            </div>

            <Field label="Device or environment" error={fieldErrors.environment} hint="Optional">
              <input
                id="environment"
                value={report.environment ?? ""}
                onChange={(event) => updateField("environment", event.target.value)}
                maxLength={500}
                placeholder="Example: Chrome 136, Windows 11, desktop"
                className={inputClass}
              />
            </Field>
          </FormSection>

          <FormSection
            number="03"
            title="Add visual evidence"
            description="Screenshots are optional, private, and often the quickest way to understand a problem."
          >
            <div
              className={`rounded-lg border border-dashed p-5 transition ${
                fieldErrors.attachments
                  ? "border-red-400/50 bg-red-400/[0.06]"
                  : "border-white/15 bg-white/[0.025] hover:border-cyan-300/30"
              }`}
            >
              <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm font-bold text-white">JPEG, PNG, or WebP</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Up to {BUG_REPORT_ATTACHMENT_LIMITS.maxFiles} images, 20 MB each. Metadata is stripped
                    before private storage when intake goes live.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-black uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-300/15"
                >
                  Choose images
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="sr-only"
                  onChange={(event) => addAttachments(event.target.files)}
                />
              </div>

              {attachments.length > 0 ? (
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {attachments.map((file, index) => (
                    <li
                      key={`${file.name}-${file.lastModified}-${index}`}
                      className="flex min-w-0 items-center gap-3 rounded-lg border border-white/10 bg-black/25 px-3 py-2.5"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-cyan-300/10 text-cyan-300">
                        <ImageIcon />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-slate-200">{file.name}</span>
                        <span className="text-[0.65rem] text-slate-500">{formatBytes(file.size)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(index)}
                        aria-label={`Remove ${file.name}`}
                        className="rounded-md p-1.5 text-slate-500 transition hover:bg-white/[0.06] hover:text-white"
                      >
                        <CloseIcon />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {fieldErrors.attachments ? (
                <p className="mt-3 text-xs font-semibold text-red-300">{fieldErrors.attachments}</p>
              ) : null}
            </div>
          </FormSection>

          <FormSection
            number="04"
            title="Choose how we follow up"
            description="Your report stays anonymous either way."
          >
            {relayAvailable ? (
              <label className="flex cursor-pointer gap-3 rounded-lg border border-indigo-300/20 bg-indigo-300/[0.06] p-4">
                <input
                  id="replyRelayConsent"
                  type="checkbox"
                  checked={report.replyRelayConsent}
                  onChange={(event) => updateField("replyRelayConsent", event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-indigo-400"
                />
                <span>
                  <span className="block text-sm font-bold text-indigo-100">Allow private Discord replies</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-400">
                    SALbot may DM you when staff asks a question. Your identity stays hidden from the
                    staff ticket and is never included in its Discord message.
                  </span>
                </span>
              </label>
            ) : (
              <div className="rounded-lg border border-white/10 bg-white/[0.025] p-4">
                <p className="text-sm font-bold text-white">Need a private reply?</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  You can submit anonymously without signing in. To let SALbot relay staff questions by
                  DM, sign in first and return to this page.
                </p>
                <Link
                  href="/auth/signin?next=/report-a-bug"
                  className="mt-3 inline-flex text-xs font-black uppercase tracking-wide text-indigo-300 transition hover:text-indigo-200"
                >
                  Sign in with Discord
                </Link>
              </div>
            )}
            {fieldErrors.replyRelayConsent ? (
              <p className="text-xs font-semibold text-red-300">{fieldErrors.replyRelayConsent}</p>
            ) : null}
          </FormSection>
        </div>

        <div className="flex flex-col gap-4 border-t border-white/10 bg-black/20 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p className="max-w-xl text-xs leading-5 text-slate-500">
            Nothing is sent until you confirm. Reports are retained for operations and may contribute to
            a sanitized, admin-reviewed FAQ later.
          </p>
          <button
            type="submit"
            className="rounded-lg border border-cyan-300/40 bg-cyan-300/15 px-6 py-3 text-sm font-black uppercase tracking-wide text-cyan-50 shadow-lg shadow-cyan-950/30 transition hover:bg-cyan-300/20 active:translate-y-0.5"
          >
            Review report
          </button>
        </div>
      </form>

      {submitError ? (
        <div role="alert" className="mt-4 rounded-lg border border-red-400/30 bg-red-400/[0.08] px-4 py-3 text-sm text-red-100">
          <strong>Not submitted.</strong> {submitError}
        </div>
      ) : null}

      <BugReportConfirmationModal
        open={confirmationOpen}
        report={report}
        attachmentCount={attachments.length}
        submissionEnabled={submissionEnabled}
        submitting={submitting}
        onCancel={() => setConfirmationOpen(false)}
        onConfirm={confirmSubmission}
      />
    </>
  );
}

function FormSection({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-5 border-b border-white/[0.07] pb-8 last:border-0 last:pb-0 md:grid-cols-[10rem_minmax(0,1fr)]">
      <div>
        <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-cyan-400">{number}</p>
        <h2 className="mt-1 font-display text-lg font-bold text-white">{title}</h2>
        <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-300">
        {label}
        {required ? <span className="text-cyan-400">Required</span> : null}
        {hint ? <span className="font-medium normal-case tracking-normal text-slate-600">{hint}</span> : null}
      </span>
      {children}
      {error ? <span className="mt-1.5 block text-xs font-semibold text-red-300">{error}</span> : null}
    </label>
  );
}

function CharacterCount({ value, max }: { value: string; max: number }) {
  return <p className="mt-1.5 text-right font-mono text-[0.65rem] text-slate-600">{value.length} / {max}</p>;
}

function BugReportReceipt({ receipt }: { receipt: BugReportSubmissionReceipt }) {
  return (
    <section className="rounded-[var(--sal-card-radius)] border border-emerald-300/25 bg-slate-950/84 p-6 shadow-2xl shadow-emerald-950/20 sm:p-8">
      <div className="grid h-12 w-12 place-items-center rounded-lg border border-emerald-300/35 bg-emerald-300/10 text-2xl text-emerald-300">
        ✓
      </div>
      <p className="mt-6 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
        Ticket {receipt.ticketId}
      </p>
      <h2 className="mt-2 font-display text-2xl font-black text-white">Report safely stored</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
        Save both items below. The private link contains your access token and lets you see status or
        reply without revealing your identity to staff.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
        <a
          href={receipt.reporterAccess.accessUrl}
          className="min-w-0 truncate rounded-lg border border-cyan-300/25 bg-cyan-300/[0.07] px-4 py-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-300/10"
        >
          {receipt.reporterAccess.accessUrl}
        </a>
        <div className="rounded-lg border border-white/10 bg-white/[0.035] px-4 py-3 text-center font-mono text-sm font-bold text-white">
          {receipt.reporterAccess.recoveryCode}
        </div>
      </div>
      <p className="mt-3 text-xs text-amber-200/80">
        Anyone with the private link can access this ticket. Do not post it in Discord channels.
      </p>
    </section>
  );
}

function focusFirstInvalidField(errors: FieldErrors) {
  const order: Array<keyof FieldErrors> = [
    "category",
    "severity",
    "subject",
    "description",
    "reproductionSteps",
    "expectedBehavior",
    "environment",
    "attachments",
    "replyRelayConsent",
  ];
  const firstField = order.find((field) => errors[field]);
  if (firstField && firstField !== "attachments") document.getElementById(firstField)?.focus();
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m4 17 4.5-4.5 3.5 3 2.5-2.5 5.5 5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}
