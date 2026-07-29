import { NextRequest, NextResponse } from "next/server";
import { isInternalServiceRequest } from "@/lib/admin-auth";

type RouteContext = {
  params: Promise<{ gameId: string; participantId: string }>;
};

interface ScouterParticipantPatchDependencies {
  isAuthorized: (request: NextRequest) => boolean;
}

export function createScouterParticipantPatchHandler(
  dependencies: ScouterParticipantPatchDependencies,
) {
  return async function PATCH(request: NextRequest, context: RouteContext) {
    if (!dependencies.isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    await context.params;
    return NextResponse.json(
      { error: "Not implemented — v2 correction flow" },
      { status: 501 },
    );
  };
}

export const PATCH = createScouterParticipantPatchHandler({
  isAuthorized: isInternalServiceRequest,
});
