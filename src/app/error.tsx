"use client";

import { useEffect } from "react";

// Root error boundary (#153). Catches errors thrown while rendering any page
// under the root layout — most importantly LeagueDataUnavailableError from
// src/lib/league-data.ts, which fetchLeagueData()/getAdminLeagueData() throw
// in production instead of silently falling back to MOCK_LEAGUE_DATA. Players
// and admins see an honest "unavailable" message instead of a crash or a page
// quietly rendering fabricated teams/standings.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const isLeagueDataUnavailable = error.name === "LeagueDataUnavailableError";

  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-[#05070d] px-4">
      <div className="max-w-md text-center">
        <p className="mb-2 text-[0.65rem] font-black uppercase tracking-widest text-cyan-300/60">
          {isLeagueDataUnavailable ? "League Data" : "Error"}
        </p>
        <h1 className="mb-4 text-3xl font-black text-white">
          {isLeagueDataUnavailable ? "Temporarily Unavailable" : "Something Went Wrong"}
        </h1>
        <p className="mb-8 text-sm font-semibold text-slate-400">
          {isLeagueDataUnavailable
            ? "League data is temporarily unavailable — please check back shortly."
            : "An unexpected error occurred. Please try again."}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="inline-block rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-6 py-3 text-sm font-black uppercase tracking-wider text-cyan-100 transition hover:bg-cyan-300/20"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
