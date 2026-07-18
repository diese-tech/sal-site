"use client";

import { useEffect } from "react";
import {
  BUG_REPORT_CATEGORY_OPTIONS,
  BUG_REPORT_SEVERITY_OPTIONS,
} from "@/lib/bug-reports/contracts";
import type { BugReportSubmissionPayload } from "@/types/bug-report";

export function BugReportConfirmationModal({
  open,
  report,
  attachmentCount,
  submissionEnabled,
  submitting,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  report: BugReportSubmissionPayload;
  attachmentCount: number;
  submissionEnabled: boolean;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, open, submitting]);

  if (!open) return null;

  const category = BUG_REPORT_CATEGORY_OPTIONS.find((option) => option.value === report.category)?.label;
  const severity = BUG_REPORT_SEVERITY_OPTIONS.find((option) => option.value === report.severity)?.label;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/85 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !submitting) onCancel();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="bug-report-confirm-title"
        className="w-full max-w-lg overflow-hidden rounded-[var(--sal-card-radius)] border border-cyan-300/25 bg-[#07101f] shadow-2xl shadow-cyan-950/40"
      >
        <div className="border-b border-white/10 p-5 sm:p-6">
          <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-cyan-300">
            Final check
          </p>
          <h2 id="bug-report-confirm-title" className="mt-2 font-display text-2xl font-black text-white">
            Ready to send this report?
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Confirm the summary below. Your report remains anonymous unless you opted into the hidden
            Discord reply relay.
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-px bg-white/10">
          <SummaryItem label="Category" value={category ?? report.category} />
          <SummaryItem label="Severity" value={severity ?? report.severity} />
          <SummaryItem label="Images" value={attachmentCount === 1 ? "1 image" : `${attachmentCount} images`} />
          <SummaryItem label="Private replies" value={report.replyRelayConsent ? "Allowed" : "Not linked"} />
        </dl>

        <div className="p-5 sm:p-6">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Subject</p>
          <p className="mt-1 text-sm font-semibold text-white">{report.subject}</p>

          {!submissionEnabled ? (
            <div className="mt-5 rounded-lg border border-amber-300/25 bg-amber-300/[0.08] p-3 text-xs leading-5 text-amber-100">
              Submission is safely disabled until durable ticket storage and shared rate limiting pass
              their release checks. This report has not been sent.
            </div>
          ) : null}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-black uppercase text-slate-300 transition hover:bg-white/[0.08] disabled:opacity-50"
            >
              Go back
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!submissionEnabled || submitting}
              className="rounded-lg border border-cyan-300/40 bg-cyan-300/15 px-5 py-2.5 text-sm font-black uppercase text-cyan-50 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Saving..." : submissionEnabled ? "Confirm and submit" : "Submission unavailable"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#07101f] px-5 py-4">
      <dt className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-slate-600">{label}</dt>
      <dd className="mt-1 text-sm font-bold text-slate-200">{value}</dd>
    </div>
  );
}
