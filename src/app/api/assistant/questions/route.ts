import { NextRequest, NextResponse } from "next/server";
import { PUBLIC_ASSISTANT_MODEL, type PublicAssistantResponse } from "@/types/public-assistant";
import {
  buildUnavailableResponse,
  buildValidationError,
  parseAssistantQuestion,
} from "@/lib/public-assistant/contracts";
import { evaluateAssistantAvailability } from "@/lib/public-assistant/policy";
import { getSanitizedSourceRetriever } from "@/lib/public-assistant/sources";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

function json(body: PublicAssistantResponse, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = parseAssistantQuestion(body);

  if (!parsed.success) {
    return json(buildValidationError(parsed.error.flatten().fieldErrors), 400);
  }

  // This shell cannot be enabled by an environment variable. Release B must
  // replace these unavailable dependencies with a database-backed feature flag
  // and an Admin-approved sanitized-source repository.
  const durableFeatureFlagEnabled = false;
  const sourceRetriever = getSanitizedSourceRetriever();
  const availability = evaluateAssistantAvailability({
    durableFeatureFlagEnabled,
    sanitizedSourceRepositoryReady: sourceRetriever !== null,
    model: PUBLIC_ASSISTANT_MODEL,
  });

  if (!availability.enabled) {
    return json(buildUnavailableResponse(availability.reasons), 503);
  }

  // Keep the route fail-closed if future wiring accidentally satisfies only
  // the readiness booleans without installing the retrieval and ticket flows.
  return json(buildUnavailableResponse(["sanitized_sources_missing"]), 503);
}
