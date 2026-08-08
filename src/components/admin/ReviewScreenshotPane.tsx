"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Screenshot viewer shown alongside the editable stat table during review.
 *
 * Correcting OCR means reading numbers off the scoreboard and typing them into
 * the table, so the evidence has to stay on screen while the table is edited —
 * previously the screenshots were only visible during upload/extraction.
 */
export function ReviewScreenshotPane({
  urls,
  activeIndex,
  onSelect,
}: {
  urls: string[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  const index = Math.min(Math.max(activeIndex, 0), Math.max(urls.length - 1, 0));
  const current = urls[index];

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomed(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed]);

  if (urls.length === 0) {
    return (
      <div className="rounded-2xl border border-white/8 bg-slate-950/60 p-4">
        <p className="text-[0.65rem] font-black uppercase tracking-widest text-slate-500">Screenshot</p>
        <p className="mt-2 text-xs text-slate-500">
          No screenshot uploaded for this report — stats are being entered manually.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-white/8 bg-slate-950/60">
        <div className="flex items-center justify-between border-b border-white/8 px-3 py-2">
          <p className="text-[0.65rem] font-black uppercase tracking-widest text-cyan-300/70">
            Screenshot {urls.length > 1 ? `${index + 1} / ${urls.length}` : ""}
          </p>
          <div className="flex items-center gap-2">
            {current && (
              <a
                href={current}
                target="_blank"
                rel="noreferrer"
                className="text-[0.6rem] font-black uppercase text-slate-500 transition hover:text-slate-200"
              >
                Open
              </a>
            )}
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="text-[0.6rem] font-black uppercase text-slate-500 transition hover:text-slate-200"
            >
              {collapsed ? "Show" : "Hide"}
            </button>
          </div>
        </div>

        {!collapsed && (
          <>
            {current && (
              <button
                type="button"
                onClick={() => setZoomed(true)}
                className="block w-full cursor-zoom-in bg-black/40"
                title="Click to enlarge"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={current}
                  alt={`Game ${index + 1} scoreboard`}
                  className="max-h-[70vh] w-full object-contain"
                />
              </button>
            )}

            {urls.length > 1 && (
              <div className="flex flex-wrap gap-1.5 border-t border-white/8 px-2 py-2">
                {urls.map((url, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onSelect(idx)}
                    className={cn(
                      "relative overflow-hidden rounded border transition",
                      idx === index
                        ? "border-cyan-300/50 ring-1 ring-cyan-300/30"
                        : "border-white/10 opacity-60 hover:opacity-100",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Game ${idx + 1}`} className="h-10 w-16 object-cover" />
                    <span className="absolute bottom-0 left-0 rounded-tr bg-black/70 px-1 text-[0.5rem] font-black text-white">
                      G{idx + 1}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {zoomed && current && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Enlarged screenshot"
          className="fixed inset-0 z-50 cursor-zoom-out overflow-auto bg-black/90 p-4"
          onClick={() => setZoomed(false)}
        >
          <button
            type="button"
            onClick={() => setZoomed(false)}
            className="sticky left-full top-0 z-10 rounded-lg border border-white/20 bg-slate-900/90 px-3 py-1.5 text-xs font-black uppercase text-slate-200"
          >
            Close
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current}
            alt={`Game ${index + 1} scoreboard, enlarged`}
            className="mx-auto max-w-none"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
