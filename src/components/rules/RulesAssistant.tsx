"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { parsePublicAssistantResponse } from "@/lib/public-assistant/contracts";
import {
  PUBLIC_ASSISTANT_MODEL,
  RULING_DEEP_LINKS,
  type PublicAssistantResponse,
} from "@/types/public-assistant";
import { RULING_CONFIRMATION_NOTICE_VERSION } from "@/types/ruling-request";

const MAX_QUESTION_LENGTH = 2_000;
const REQUEST_TIMEOUT_MS = 12_000;
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function clientUnavailableResponse(message: string): PublicAssistantResponse {
  return {
    ok: false,
    apiVersion: "1",
    kind: "assistant_unavailable",
    code: "PUBLIC_ASSISTANT_DISABLED",
    message,
    reasons: ["durable_feature_flag_missing"],
    retryable: false,
    model: PUBLIC_ASSISTANT_MODEL,
    paidFallback: false,
    escalation: {
      available: false,
      requestPath: RULING_DEEP_LINKS.requestAnchor,
      adminTicketPath: null,
      publicStatusPath: null,
    },
  };
}

export function RulesAssistant() {
  const questionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const requestButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<PublicAssistantResponse | null>(null);
  const [officialRequestNotice, setOfficialRequestNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);

  const trimmedQuestion = question.trim();
  const canSubmit = trimmedQuestion.length >= 6 && trimmedQuestion.length <= MAX_QUESTION_LENGTH && !submitting;

  useEffect(() => {
    if (!confirmationOpen) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : requestButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const inerted: Array<{ element: HTMLElement; wasInert: boolean; ariaHidden: string | null }> = [];
    let activeBranch: HTMLElement | null = overlayRef.current;
    while (activeBranch?.parentElement) {
      const parent = activeBranch.parentElement;
      for (const sibling of Array.from(parent.children)) {
        if (sibling === activeBranch || !(sibling instanceof HTMLElement)) continue;
        inerted.push({ element: sibling, wasInert: sibling.inert, ariaHidden: sibling.getAttribute("aria-hidden") });
        sibling.inert = true;
        sibling.setAttribute("aria-hidden", "true");
      }
      if (parent === document.body) break;
      activeBranch = parent;
    }
    cancelButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setConfirmationOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []).filter(
        (element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true",
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (dialogRef.current && event.target instanceof Node && !dialogRef.current.contains(event.target)) {
        cancelButtonRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
      document.body.style.overflow = previousOverflow;
      for (const { element, wasInert, ariaHidden } of inerted.reverse()) {
        element.inert = wasInert;
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      }
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [confirmationOpen]);

  async function submitGuidance() {
    if (!canSubmit) return;

    setSubmitting(true);
    setResult(null);
    setOfficialRequestNotice(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch("/api/assistant/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmedQuestion, scope: { kind: "global" } }),
        signal: controller.signal,
      });
      const parsed = parsePublicAssistantResponse(await response.json());
      setResult(
        parsed ??
          clientUnavailableResponse("The assistant returned an invalid response. No guidance or ticket was created."),
      );
    } catch (error) {
      setResult(
        clientUnavailableResponse(
          error instanceof DOMException && error.name === "AbortError"
            ? "The guidance request timed out. No guidance or ticket was created."
            : "The assistant could not be reached. No guidance or ticket was created.",
        ),
      );
    } finally {
      window.clearTimeout(timeout);
      setSubmitting(false);
    }
  }

  function handleGuidance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitGuidance();
  }

  function openConfirmation() {
    if (!canSubmit) return;
    setOfficialRequestNotice(null);
    setConfirmationOpen(true);
  }

  function confirmRulingRequest() {
    setConfirmationOpen(false);
    setOfficialRequestNotice(
      "Official ruling requests will open after secure Discord sign-in, binding-case facts, CSRF protection, and durable idempotent ticket storage are connected. No ticket was created.",
    );
  }

  return (
    <>
      <section
        id="request-a-ruling"
        aria-labelledby="ruling-assistant-heading"
        className="overflow-hidden rounded-2xl border border-violet-300/25 bg-slate-950/90 shadow-2xl shadow-violet-950/25 backdrop-blur-xl"
      >
        <div className="h-1 bg-gradient-to-r from-violet-400 via-cyan-400 to-emerald-400" />
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-violet-300">
                Public rules assistant
              </p>
              <h2 id="ruling-assistant-heading" className="mt-1 text-xl font-black text-white">
                Request a ruling here
              </h2>
            </div>
            <span className="rounded-full border border-amber-300/25 bg-amber-300/[0.08] px-2.5 py-1 font-mono text-[0.56rem] font-semibold uppercase tracking-wider text-amber-200">
              Preview
            </span>
          </div>

          <p className="mt-3 text-sm font-semibold leading-6 text-slate-400">
            Ask one complete question. Guidance is based only on current published rules and admin-approved sanitized
            precedent. It is not an official ruling.
          </p>

          <form className="mt-5" onSubmit={handleGuidance}>
            <label htmlFor={questionId} className="text-xs font-black uppercase tracking-wide text-slate-300">
              What happened?
            </label>
            <textarea
              id={questionId}
              value={question}
              onChange={(event) => {
                setQuestion(event.target.value);
                setResult(null);
                setOfficialRequestNotice(null);
              }}
              maxLength={MAX_QUESTION_LENGTH}
              rows={6}
              placeholder="Include the rule question and the facts that may change the answer. Do not include private evidence here."
              className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/30 px-3.5 py-3 text-sm font-semibold leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/45 focus:ring-2 focus:ring-cyan-300/10"
            />
            <div className="mt-1.5 flex items-center justify-between gap-3 font-mono text-[0.58rem] text-slate-600">
              <span>One-shot guidance is not stored as chat history.</span>
              <span>{question.length}/{MAX_QUESTION_LENGTH}</span>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <button
                type="submit"
                disabled={!canSubmit}
                className="rounded-xl border border-cyan-300/35 bg-cyan-300/15 px-3 py-2.5 text-xs font-black uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? "Checking..." : "Check guidance"}
              </button>
              <button
                ref={requestButtonRef}
                type="button"
                onClick={openConfirmation}
                disabled={!canSubmit}
                className="rounded-xl border border-violet-300/30 bg-violet-300/10 px-3 py-2.5 text-xs font-black uppercase tracking-wide text-violet-100 transition hover:bg-violet-300/15 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Request official review
              </button>
            </div>
          </form>

          {result && <AssistantResult result={result} />}
          {officialRequestNotice && (
            <div role="status" className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/[0.06] p-3.5">
              <p className="text-xs font-black uppercase tracking-wide text-amber-100">Secure request not yet available</p>
              <p className="mt-1.5 text-xs font-semibold leading-5 text-slate-300">{officialRequestNotice}</p>
            </div>
          )}

          <div className="mt-5 border-t border-white/10 pt-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[0.58rem] uppercase tracking-wider text-slate-600">Model contract</span>
              <span className="font-mono text-[0.58rem] text-slate-500">{PUBLIC_ASSISTANT_MODEL}</span>
            </div>
            <p className="mt-2 text-[0.68rem] font-semibold leading-5 text-slate-500">
              The launch contract has no paid fallback. Once enabled, if the free route or approved sources are
              unavailable, SAL will offer search and ticket options instead of inventing an answer.
            </p>
          </div>
        </div>
      </section>

      {confirmationOpen && (
        <div
          ref={overlayRef}
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/75 p-4 backdrop-blur-sm sm:items-center"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setConfirmationOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ruling-confirmation-title"
            aria-describedby="ruling-confirmation-description"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-violet-300/25 bg-slate-950 shadow-2xl shadow-black/60"
          >
            <div className="h-1 bg-gradient-to-r from-violet-400 to-cyan-400" />
            <div className="p-6">
              <p className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-violet-300">
                Confirmation required
              </p>
              <h2 id="ruling-confirmation-title" className="mt-2 text-xl font-black text-white">
                Continue toward official review?
              </h2>
              <p id="ruling-confirmation-description" className="mt-3 text-sm font-semibold leading-6 text-slate-400">
                Assistant guidance is advisory and can be changed by an authorized SAL admin. Once enabled, an official
                request requires Discord sign-in, binding case facts, and a tracked ticket. Confirmed official requests
                are retained for admin review and precedent history. General guidance is not stored as chat history.
              </p>
              <div className="mt-4 max-h-32 overflow-y-auto rounded-xl border border-white/10 bg-black/25 p-3 text-sm font-semibold leading-6 text-slate-300">
                {trimmedQuestion}
              </div>
              <p className="mt-3 font-mono text-[0.58rem] text-slate-600">
                Notice version: {RULING_CONFIRMATION_NOTICE_VERSION}
              </p>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  ref={cancelButtonRef}
                  type="button"
                  onClick={() => setConfirmationOpen(false)}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-black uppercase tracking-wide text-slate-300 transition hover:bg-white/[0.08]"
                >
                  Go back
                </button>
                <button
                  type="button"
                  onClick={confirmRulingRequest}
                  className="rounded-xl border border-violet-300/35 bg-violet-300/15 px-4 py-2.5 text-xs font-black uppercase tracking-wide text-violet-100 transition hover:bg-violet-300/20"
                >
                  Confirm and check availability
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AssistantResult({ result }: { result: PublicAssistantResponse }) {
  if (!result.ok) {
    const isValidation = result.kind === "validation_error";
    return (
      <div
        role="status"
        className={`mt-4 rounded-xl border p-3.5 ${
          isValidation
            ? "border-rose-300/25 bg-rose-300/[0.06] text-rose-100"
            : "border-amber-300/25 bg-amber-300/[0.06] text-amber-100"
        }`}
      >
        <p className="text-xs font-black uppercase tracking-wide">
          {isValidation ? "Request needs attention" : "Assistant safely unavailable"}
        </p>
        <p className="mt-1.5 text-xs font-semibold leading-5 text-slate-300">{result.message}</p>
        {!isValidation && (
          <a
            href="https://discord.gg/qY8uFve4Dd"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex text-xs font-black uppercase tracking-wide text-amber-200 hover:text-amber-100"
          >
            Open SAL Discord <span aria-hidden="true" className="ml-1">↗</span>
          </a>
        )}
      </div>
    );
  }

  return (
    <div role="status" className="mt-4 rounded-xl border border-cyan-300/25 bg-cyan-300/[0.06] p-3.5">
      <p className="text-xs font-black uppercase tracking-wide text-cyan-100">
        {result.kind === "deterministic_guidance" ? "Published-rule guidance" : "Admin review recommended"}
      </p>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">{result.answer}</p>
      {result.citations.length > 0 && (
        <div className="mt-3 border-t border-cyan-300/10 pt-3">
          <p className="font-mono text-[0.58rem] font-semibold uppercase tracking-wider text-slate-500">Sources</p>
          <ul className="mt-2 space-y-1.5">
            {result.citations.map((citation) => (
              <li key={`${citation.sourceId}:${citation.version}`} className="text-xs font-semibold text-slate-400">
                <a
                  href={citation.publicUrl}
                  target={citation.publicUrl.startsWith("/") ? undefined : "_blank"}
                  rel={citation.publicUrl.startsWith("/") ? undefined : "noopener noreferrer"}
                  className="text-cyan-300 underline decoration-cyan-300/30 underline-offset-2 hover:text-cyan-100"
                >
                  {citation.title}
                </a>{" "}
                <span className="font-mono text-[0.58rem] text-slate-600">
                  v{citation.version}{citation.current ? " · current" : ""}
                  {citation.conflictState !== "none" ? " · review required" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[0.58rem] text-slate-600">
        <span>
          Rule version: {result.determinism.ruleVersion ?? "Not deterministic"}
        </span>
        <span>
          Model confidence: {result.modelConfidence === null ? "Not reported" : `${Math.round(result.modelConfidence * 100)}%`}
        </span>
      </div>
      <p className="mt-3 text-[0.68rem] font-semibold leading-5 text-slate-500">
        This guidance is based on published SAL rules and admin-approved precedent. Request an official admin ruling if
        you need a binding decision.
      </p>
    </div>
  );
}
