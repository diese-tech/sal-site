import { NextRequest, NextResponse } from "next/server";
import {
  PUBLIC_ASSISTANT_API_VERSION,
  PUBLIC_ASSISTANT_MODEL,
  RULING_DEEP_LINKS,
  type PublicAssistantResponse,
} from "@/types/public-assistant";
import {
  buildUnavailableResponse,
  buildValidationError,
  parseAssistantQuestion,
} from "@/lib/public-assistant/contracts";
import { getDurableRequestLimiter, parseDurableLimiterDecision } from "@/lib/public-assistant/limiter";
import {
  buildPublicModelPayload,
  getAssistantPrivacyGuard,
  verifyQuestionWithPrivacyGuard,
  verifySourcesWithPrivacyGuard,
} from "@/lib/public-assistant/privacy";
import {
  evaluateAssistantAvailability,
  getDurablePublicAssistantFeatureGate,
} from "@/lib/public-assistant/policy";
import { readBoundedJson } from "@/lib/public-assistant/request-body";
import {
  getSanitizedSourceRetriever,
  selectEligibleSources,
  verifySanitizedSourceReadiness,
} from "@/lib/public-assistant/sources";
import { askOpenRouterPublicAssistant } from "@/lib/public-assistant/provider";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};
const MAX_ASSISTANT_BODY_BYTES = 8_192;

function json(body: PublicAssistantResponse, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  const featureGate = getDurablePublicAssistantFeatureGate();
  const sourceRetriever = getSanitizedSourceRetriever();
  const privacyGuard = getAssistantPrivacyGuard();
  const limiter = getDurableRequestLimiter();
  let sanitizedSourceRepositoryReady = false;
  let sanitizedSourceVersionVerified = false;

  if (featureGate?.enabled && sourceRetriever) {
    try {
      const readiness = await sourceRetriever.readiness();
      sanitizedSourceRepositoryReady = readiness.ready;
      sanitizedSourceVersionVerified = verifySanitizedSourceReadiness(
        readiness,
        featureGate.sourceContract,
      ).verified;
    } catch {
      return json(buildUnavailableResponse(["sanitized_sources_missing"]), 503);
    }
  }

  const availability = evaluateAssistantAvailability({
    durableFeatureFlagEnabled: featureGate?.enabled === true,
    sanitizedSourceRepositoryReady,
    sanitizedSourceVersionVerified,
    privacyGuardReady: privacyGuard !== null,
    durableRateLimiterReady: limiter !== null,
    model: PUBLIC_ASSISTANT_MODEL,
  });

  if (!availability.enabled) {
    return json(buildUnavailableResponse(availability.reasons), 503);
  }

  if (!sourceRetriever || !featureGate || !privacyGuard || !limiter) {
    return json(buildUnavailableResponse(["sanitized_sources_missing"]), 503);
  }

  let limitDecision;
  try {
    limitDecision = parseDurableLimiterDecision(await limiter.consume({ route: "public_assistant", request }));
  } catch {
    return json(buildUnavailableResponse(["durable_rate_limiter_missing"]), 503);
  }
  if (!limitDecision) return json(buildUnavailableResponse(["durable_rate_limiter_missing"]), 503);
  if (!limitDecision.allowed) {
    return json(buildValidationError({ question: ["Too many requests. Wait before asking again."] }), 429);
  }

  const body = await readBoundedJson(request, MAX_ASSISTANT_BODY_BYTES);
  if (!body.ok) {
    return json(buildValidationError({ question: ["Submit a valid request under 8 KB."] }), 400);
  }
  const parsed = parseAssistantQuestion(body.value);

  if (!parsed.success) {
    return json(buildValidationError(parsed.error.flatten().fieldErrors), 400);
  }

  let verifiedQuestion;
  try {
    verifiedQuestion = await verifyQuestionWithPrivacyGuard(parsed.data.question, privacyGuard);
  } catch {
    return json(buildUnavailableResponse(["privacy_guard_missing"]), 503);
  }
  if (!verifiedQuestion) {
    return json(buildValidationError({ question: ["Remove private evidence or secret material before asking."] }), 400);
  }

  let retrievedSources;
  try {
    retrievedSources = await sourceRetriever.search({
      question: verifiedQuestion.text,
      scope: parsed.data.scope,
      limit: 8,
      sourceTypes: ["published_rule", "sanitized_precedent"],
    });
  } catch {
    return json(buildUnavailableResponse(["sanitized_sources_missing"]), 503);
  }

  const sources = selectEligibleSources(retrievedSources, {
    contract: featureGate.sourceContract,
    scope: parsed.data.scope,
    now: new Date().toISOString(),
  }).eligible;
  if (sources.length === 0) return json(buildUnavailableResponse(["sanitized_sources_missing"]), 503);

  let verifiedSources;
  try {
    verifiedSources = await verifySourcesWithPrivacyGuard(sources, privacyGuard);
  } catch {
    return json(buildUnavailableResponse(["privacy_guard_missing"]), 503);
  }
  const providerPayload = verifiedSources ? buildPublicModelPayload(verifiedQuestion, verifiedSources) : null;
  if (!providerPayload) return json(buildUnavailableResponse(["privacy_guard_missing"]), 503);

  let providerAnswer;
  try {
    providerAnswer = await askOpenRouterPublicAssistant(providerPayload);
  } catch (error) {
    console.error(
      "Public assistant provider unavailable:",
      error instanceof Error ? error.message : "Unknown provider error.",
    );
    return json(buildUnavailableResponse(["provider_unavailable"]), 503);
  }

  const citedIds = new Set(providerAnswer.citedSourceIds);
  const citations = sources
    .filter((source) => citedIds.has(source.id))
    .map((source) => ({
      sourceId: source.id,
      sourceType: source.sourceType,
      title: source.title,
      ruleSetId: source.ruleSetId,
      releaseId: source.releaseId,
      version: source.sourceVersion,
      current: source.status === "published" && source.supersededBy === null,
      conflictState: source.conflictState,
      publicUrl: source.publicUrl,
    }));

  return json({
    ok: true,
    apiVersion: PUBLIC_ASSISTANT_API_VERSION,
    kind: "ambiguous_guidance",
    authority: "advisory",
    answer: providerAnswer.answer,
    citations,
    determinism: {
      classification: "ambiguous",
      validator: "published-rules-engine",
      verified: false,
      ruleVersion: null,
    },
    modelConfidence: null,
    model: PUBLIC_ASSISTANT_MODEL,
    escalation: {
      available: false,
      requestPath: RULING_DEEP_LINKS.requestAnchor,
      adminTicketPath: null,
      publicStatusPath: null,
    },
  }, 200);
}
