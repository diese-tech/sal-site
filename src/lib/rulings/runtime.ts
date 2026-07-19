import type { NextRequest } from "next/server";
import type { OfficialRulingRequest, RulingTicketCreatedResponse, SignedInRulingRequester } from "@/types/ruling-request";

export interface RulingTicketWrite {
  requester: SignedInRulingRequester;
  request: OfficialRulingRequest;
  idempotencyKey: string;
}

export interface RulingRequestRuntime {
  getSignedInRequester(request: NextRequest): Promise<SignedInRulingRequester | null>;
  verifyCsrfToken(requester: SignedInRulingRequester, token: string): Promise<boolean>;
  createTicket(input: RulingTicketWrite): Promise<RulingTicketCreatedResponse>;
}

/** Release B/C must supply auth, CSRF, and durable idempotent ticket storage together. */
export function getRulingRequestRuntime(): RulingRequestRuntime | null {
  return null;
}
