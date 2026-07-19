import { NextRequest, NextResponse } from "next/server";
import { PUBLIC_ASSISTANT_MODEL, type PublicAssistantResponse } from "@/types/public-assistant";
import {
  buildUnavailableResponse,
  buildValidationError,
  parseAssistantQuestion,
} from "@/lib/public-assistant/contracts";
import { buildPublicModelPayload, preparePublicSafeModelInput } from "@/lib/public-assistant/privacy";
import {
  evaluateAssistantAvailability,
  getDurablePublicAssistantFeatureGate,
} from "@/lib/public-assistant/policy";
import { getSanitizedSourceRetriever, verifySanitizedSourceReadiness } from "@/lib/public-assistant/sources";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

function json(body: PublicAssistantResponse, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  // This shell cannot be enabled by an environment variable. Release B must
  // replace these unavailable dependencies with a database-backed feature flag
  // and an Admin-approved sanitized-source repository.
  const featureGate = getDurablePublicAssistantFeatureGate();
  const sourceRetriever = getSanitizedSourceRetriever();
  let sanitizedSourceRepositoryReady = false;
  let sanitizedSourceVersionVerified = false;

  if (featureGate?.enabled && sourceRetriever) {
    const readiness = await sourceRetriever.readiness();
    sanitizedSourceRepositoryReady = readiness.ready;
    sanitizedSourceVersionVerified = verifySanitizedSourceReadiness(
      readiness,
      featureGate.sourceContract,
    ).verified;
  }

  const availability = evaluateAssistantAvailability({
    durableFeatureFlagEnabled: featureGate?.enabled === true,
    sanitizedSourceRepositoryReady,
    sanitizedSourceVersionVerified,
    model: PUBLIC_ASSISTANT_MODEL,
  });

  if (!availability.enabled) {
    return json(buildUnavailableResponse(availability.reasons), 503);
  }

  if (!sourceRetriever) return json(buildUnavailableResponse(["sanitized_sources_missing"]), 503);

  const body = await request.json().catch(() => null);
  const parsed = parseAssistantQuestion(body);

  if (!parsed.success) {
    return json(buildValidationError(parsed.error.flatten().fieldErrors), 400);
  }

  const preparedQuestion = preparePublicSafeModelInput(parsed.data.question);
  if (!preparedQuestion.ok) {
    return json(buildValidationError({ question: ["Remove private evidence or secret material before asking."] }), 400);
  }

  const sources = await sourceRetriever.search({
    question: preparedQuestion.value,
    limit: 8,
    sourceTypes: ["published_rule", "sanitized_precedent", "public_faq"],
  });
  const providerPayload = buildPublicModelPayload(preparedQuestion.value, sources);
  if (!providerPayload) return json(buildUnavailableResponse(["sanitized_sources_missing"]), 503);

  // Keep the route fail-closed if future wiring accidentally satisfies only
  // the readiness booleans without installing the validated provider response.
  void providerPayload;
  return json(buildUnavailableResponse(["sanitized_sources_missing"]), 503);
}
