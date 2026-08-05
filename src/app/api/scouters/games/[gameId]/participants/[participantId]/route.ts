import { NextResponse, type NextRequest } from "next/server";
import { isInternalServiceRequest } from "@/lib/admin-auth";

type RouteContext = {
  params: Promise<{ gameId: string; participantId: string }>;
};

interface DeprecatedParticipantPatchDependencies {
  isAuthorized: (request: NextRequest) => boolean;
}

/**
 * Participant-only correction can leave a game half-updated when names and
 * stats are swapped across rows. Keep the historical URL fail-closed while
 * callers migrate to the audited, revision-checked full-game admin workflow.
 */
export function createDeprecatedParticipantPatchHandler(
  dependencies: DeprecatedParticipantPatchDependencies,
) {
  return async function PATCH(request: NextRequest, context: RouteContext) {
    if (!dependencies.isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { gameId } = await context.params;
    return NextResponse.json(
      {
        error: "Participant-only corrections are unavailable. Review and replace the complete game atomically.",
        adminPath: `/admin/scouters/${encodeURIComponent(gameId)}`,
      },
      { status: 410 },
    );
  };
}

export const PATCH = createDeprecatedParticipantPatchHandler({
  isAuthorized: isInternalServiceRequest,
});
