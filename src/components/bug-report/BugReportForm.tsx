"use client";

import { useState } from "react";
import { BugReportConfirmationModal } from "./BugReportConfirmationModal";
import {
  BUG_REPORT_CATEGORY_OPTIONS,
  BUG_REPORT_SEVERITY_OPTIONS,
  parseBugReportPayload,
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
  submissionEnabled,
}: {
  submissionEnabled: boolean;
}) {
  const [report, setReport] = useState<BugReportSubmissionPayload>(INITIAL_REPORT);
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
    const nextErrors: FieldErrors = payloadResult.success ? {} : payloadResult.fieldErrors;
    setFieldErrors(nextErrors);

    if (!payloadResult.success) {
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

    try {
      const response = await fetch("/api/bug-reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload: report, attachments: [] }),
      });
      let result: BugReportSubmissionResponse;
      try {
        result = (await response.json()) as BugReportSubmissionResponse;
      } catch {
        throw new Error("SAL returned an invalid submission response.");
      }
      if (!response.ok || !result.ok) {
        const failure = result as BugReportErrorResponse;
        setFieldErrors(failure.fieldErrors ?? {});
        setSubmitError(failure.message ?? "The report could not be submitted.");
        setConfirmationOpen(false);
        return;
      }

      setReceipt(result.ticket);
      setConfirmationOpen(false);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "The report could not reach SAL. Nothing was submitted, so please try again.",
      );
      setConfirmationOpen(false);
    } finally {
      setSubmitting(false);
    }
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
            <strong>Reports are temporarily unavailable.</strong> You can prepare a report, but it cannot be submitted
            right now.
          </div>
        ) : null}

        <div className="space-y-8 p-5 sm:p-7">
          <FormSection number="01" title="Classify the problem" description="Help us route it without guessing.">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field controlId="category" label="Category" error={fieldErrors.category} required>
                <select
                  id="category"
                  required
                  aria-invalid={Boolean(fieldErrors.category)}
                  aria-describedby={`category-help${fieldErrors.category ? " category-error" : ""}`}
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
                <p id="category-help" className="mt-1.5 text-xs text-slate-500">
                  {BUG_REPORT_CATEGORY_OPTIONS.find((option) => option.value === report.category)?.description}
                </p>
              </Field>

              <Field controlId="severity" label="Severity" error={fieldErrors.severity} required>
                <select
                  id="severity"
                  required
                  aria-invalid={Boolean(fieldErrors.severity)}
                  aria-describedby={`severity-help${fieldErrors.severity ? " severity-error" : ""}`}
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
                <p id="severity-help" className="mt-1.5 text-xs text-slate-500">
                  {BUG_REPORT_SEVERITY_OPTIONS.find((option) => option.value === report.severity)?.description}
                </p>
              </Field>
            </div>

            <Field controlId="subject" label="Short subject" error={fieldErrors.subject} required>
              <input
                id="subject"
                required
                aria-invalid={Boolean(fieldErrors.subject)}
                aria-describedby={fieldErrors.subject ? "subject-error" : undefined}
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
            <Field controlId="description" label="What happened?" error={fieldErrors.description} required>
              <textarea
                id="description"
                required
                aria-invalid={Boolean(fieldErrors.description)}
                aria-describedby={fieldErrors.description ? "description-error" : undefined}
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
              <Field controlId="reproductionSteps" label="Steps to reproduce" error={fieldErrors.reproductionSteps} required>
                <textarea
                  id="reproductionSteps"
                  required
                  aria-invalid={Boolean(fieldErrors.reproductionSteps)}
                  aria-describedby={fieldErrors.reproductionSteps ? "reproductionSteps-error" : undefined}
                  value={report.reproductionSteps}
                  onChange={(event) => updateField("reproductionSteps", event.target.value)}
                  rows={5}
                  maxLength={3_000}
                  placeholder={"1. Open...\n2. Select...\n3. See..."}
                  className={inputClass}
                />
              </Field>

              <Field controlId="expectedBehavior" label="What should have happened?" error={fieldErrors.expectedBehavior} required>
                <textarea
                  id="expectedBehavior"
                  required
                  aria-invalid={Boolean(fieldErrors.expectedBehavior)}
                  aria-describedby={fieldErrors.expectedBehavior ? "expectedBehavior-error" : undefined}
                  value={report.expectedBehavior}
                  onChange={(event) => updateField("expectedBehavior", event.target.value)}
                  rows={5}
                  maxLength={2_000}
                  placeholder="Tell us what the correct result should be."
                  className={inputClass}
                />
              </Field>
            </div>

            <Field controlId="environment" label="Device or environment" error={fieldErrors.environment} hint="Optional">
              <input
                id="environment"
                aria-invalid={Boolean(fieldErrors.environment)}
                aria-describedby={fieldErrors.environment ? "environment-error" : undefined}
                value={report.environment ?? ""}
                onChange={(event) => updateField("environment", event.target.value)}
                maxLength={500}
                placeholder="Example: Chrome 136, Windows 11, desktop"
                className={inputClass}
              />
            </Field>
          </FormSection>

        </div>

        <div className="flex flex-col gap-4 border-t border-white/10 bg-black/20 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p className="max-w-xl text-xs leading-5 text-slate-500">
            Review everything before submitting. Nothing is sent until you confirm.
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
        <h2 className="u-font-display mt-1 text-lg font-bold text-white">{title}</h2>
        <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Field({
  controlId,
  label,
  error,
  hint,
  required,
  children,
}: {
  controlId: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={controlId} className="block">
      <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-300">
        {label}
        {required ? <span className="text-cyan-400">Required</span> : null}
        {hint ? <span className="font-medium normal-case tracking-normal text-slate-600">{hint}</span> : null}
      </span>
      {children}
      {error ? (
        <span id={`${controlId}-error`} role="alert" className="mt-1.5 block text-xs font-semibold text-red-300">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function CharacterCount({ value, max }: { value: string; max: number }) {
  return <p className="mt-1.5 text-right font-mono text-[0.65rem] text-slate-600">{value.length} / {max}</p>;
}

function BugReportReceipt({ receipt }: { receipt: BugReportSubmissionReceipt }) {
  const anonymousAccess = receipt.reporterAccess.kind === "anonymous";
  return (
    <section className="rounded-[var(--sal-card-radius)] border border-emerald-300/25 bg-slate-950/84 p-6 shadow-2xl shadow-emerald-950/20 sm:p-8">
      <div className="grid h-12 w-12 place-items-center rounded-lg border border-emerald-300/35 bg-emerald-300/10 text-2xl text-emerald-300">
        ✓
      </div>
      <p className="mt-6 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
        Ticket {receipt.ticketId}
      </p>
      <h2 className="u-font-display mt-2 text-2xl font-black text-white">Report safely stored</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
        {anonymousAccess
          ? "Save the private status link below so you can return to this report."
          : "Use the link below while signed in with Discord to see status and reply privately."}
      </p>
      <div className="mt-6">
        <a
          href={receipt.reporterAccess.accessUrl}
          referrerPolicy="no-referrer"
          rel="noreferrer"
          className="block w-full min-w-0 truncate rounded-lg border border-cyan-300/25 bg-cyan-300/[0.07] px-4 py-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-300/10"
        >
          {receipt.reporterAccess.accessUrl}
        </a>
      </div>
      {anonymousAccess ? (
        <p className="mt-3 text-xs text-amber-200/80">
          Anyone with the private link can access this ticket. Do not post it in Discord channels.
        </p>
      ) : null}
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
  ];
  const firstField = order.find((field) => errors[field]);
  if (firstField) document.getElementById(firstField)?.focus();
}
