"use client";

import { useId, useState, type FormEvent } from "react";
import { parsePublicAssistantResponse } from "@/lib/public-assistant/contracts";
import {
  PUBLIC_ASSISTANT_MODEL,
  RULING_DEEP_LINKS,
  type PublicAssistantResponse,
} from "@/types/public-assistant";

const MAX_QUESTION_LENGTH = 2_000;
const REQUEST_TIMEOUT_MS = 12_000;

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
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<PublicAssistantResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const trimmedQuestion = question.trim();
  const canSubmit = trimmedQuestion.length >= 6 && trimmedQuestion.length <= MAX_QUESTION_LENGTH && !submitting;

  async function submitGuidance() {
    if (!canSubmit) return;

    setSubmitting(true);
    setResult(null);
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
        parsed ?? clientUnavailableResponse("The rules assistant returned an invalid response. Please try again."),
      );
    } catch (error) {
      setResult(
        clientUnavailableResponse(
          error instanceof DOMException && error.name === "AbortError"
            ? "The request timed out. Please try again."
            : "The rules assistant could not be reached. Please try again later.",
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

  return (
    <section
      id="request-a-ruling"
      aria-labelledby="ruling-assistant-heading"
      className="overflow-hidden rounded-2xl border border-violet-300/25 bg-slate-950/90 shadow-2xl shadow-violet-950/25 backdrop-blur-xl"
    >
      <div className="h-1 bg-gradient-to-r from-violet-400 via-cyan-400 to-emerald-400" />
      <div className="p-5 sm:p-6">
        <p className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-violet-300">
          Rules assistant
        </p>
        <h2 id="ruling-assistant-heading" className="mt-1 text-xl font-black text-white">
          Ask about a rule
        </h2>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-400">
          Describe the situation and ask one clear question. Do not include private evidence or personal information.
        </p>

        <form className="mt-5" onSubmit={handleGuidance}>
          <label htmlFor={questionId} className="text-xs font-black uppercase tracking-wide text-slate-300">
            Your question
          </label>
          <textarea
            id={questionId}
            value={question}
            onChange={(event) => {
              setQuestion(event.target.value);
              setResult(null);
            }}
            maxLength={MAX_QUESTION_LENGTH}
            rows={6}
            placeholder="Describe what happened and which rule you need help with."
            className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/30 px-3.5 py-3 text-sm font-semibold leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/45 focus:ring-2 focus:ring-cyan-300/10"
          />
          <p className="mt-1.5 text-right font-mono text-[0.58rem] text-slate-600">
            {question.length}/{MAX_QUESTION_LENGTH}
          </p>
          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-4 w-full rounded-xl border border-cyan-300/35 bg-cyan-300/15 px-3 py-2.5 text-xs font-black uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Checking..." : "Check the rules"}
          </button>
        </form>

        {result && <AssistantResult result={result} />}
      </div>
    </section>
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
          {isValidation ? "Question needs attention" : "Rules assistant unavailable"}
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
        Advisory rules guidance
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
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 text-[0.68rem] font-semibold leading-5 text-slate-500">
        For a binding decision, contact a SAL admin.
      </p>
    </div>
  );
}
