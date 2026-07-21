"use client";

import { useEffect, useRef } from "react";
import {
  BUG_REPORT_CATEGORY_OPTIONS,
  BUG_REPORT_SEVERITY_OPTIONS,
} from "@/lib/bug-reports/contracts";
import type { BugReportSubmissionPayload } from "@/types/bug-report";

export function BugReportConfirmationModal({
  open,
  report,
  attachmentNames,
  submissionEnabled,
  submitting,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  report: BugReportSubmissionPayload;
  attachmentNames: string[];
  submissionEnabled: boolean;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-dialog-autofocus]")?.focus();

    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [open]);

  const category = BUG_REPORT_CATEGORY_OPTIONS.find(
    (option) => option.value === report.category,
  )?.label;
  const severity = BUG_REPORT_SEVERITY_OPTIONS.find(
    (option) => option.value === report.severity,
  )?.label;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="bug-report-confirm-title"
      aria-describedby="bug-report-confirm-description"
      className="m-auto max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-[var(--sal-card-radius)] border border-cyan-300/25 bg-[#07101f] p-0 text-left text-white shadow-2xl shadow-cyan-950/40 backdrop:bg-slate-950/85 backdrop:backdrop-blur-sm"
      onCancel={(event) => {
        event.preventDefault();
        if (!submitting) onCancel();
      }}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !submitting) onCancel();
      }}
    >
      <div className="flex max-h-[calc(100vh-2rem)] flex-col">
        <div className="border-b border-white/10 p-5 sm:p-6">
          <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-cyan-300">
            Final check
          </p>
          <h2 id="bug-report-confirm-title" className="u-font-display mt-2 text-2xl font-black text-white">
            Ready to send this report?
          </h2>
          <p id="bug-report-confirm-description" className="mt-2 text-sm leading-6 text-slate-400">
            Review the complete normalized report below. Your report remains anonymous unless you
            opted into the hidden Discord reply relay.
          </p>
        </div>

        <div className="overflow-y-auto">
          <dl className="grid grid-cols-2 gap-px bg-white/10">
            <SummaryItem label="Category" value={category ?? report.category} />
            <SummaryItem label="Severity" value={severity ?? report.severity} />
            <SummaryItem
              label="Images"
              value={attachmentNames.length === 1 ? "1 image" : `${attachmentNames.length} images`}
            />
            <SummaryItem
              label="Private replies"
              value={report.replyRelayConsent ? "Allowed" : "Not linked"}
            />
          </dl>

          <div className="space-y-5 p-5 sm:p-6">
            <ReviewText label="Subject" value={report.subject} />
            <ReviewText label="What happened" value={report.description} />
            <ReviewText label="Steps to reproduce" value={report.reproductionSteps} />
            <ReviewText label="Expected behavior" value={report.expectedBehavior} />
            {report.environment ? <ReviewText label="Environment" value={report.environment} /> : null}
            {attachmentNames.length > 0 ? (
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Images</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-300">
                  {attachmentNames.map((name, index) => (
                    <li key={`${name}-${index}`} className="break-all">
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {!submissionEnabled ? (
              <div className="rounded-lg border border-amber-300/25 bg-amber-300/[0.08] p-3 text-xs leading-5 text-amber-100">
                Submission is safely disabled until durable ticket storage, private upload
                finalization, and shared rate limiting pass their release checks. This report has not
                been sent.
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-white/10 p-5 sm:flex-row sm:justify-end sm:p-6">
          <button
            data-dialog-autofocus
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
            {submitting
              ? "Saving..."
              : submissionEnabled
                ? "Confirm and submit"
                : "Submission unavailable"}
          </button>
        </div>
      </div>
    </dialog>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#07101f] px-5 py-4">
      <dt className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-slate-600">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-bold text-slate-200">{value}</dd>
    </div>
  );
}

function ReviewText({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{value}</p>
    </div>
  );
}
