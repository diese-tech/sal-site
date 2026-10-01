import { randomInt } from "crypto";
import { ACCESS_CODE_ALPHABET, ACCESS_CODE_LENGTH } from "@/lib/draft-access-code";

/**
 * Generate a new random team access code (unformatted, e.g. "H7K2QM4X").
 *
 * Server-only: kept out of `draft-access-code.ts` so the client bundle can
 * import the normalize/format helpers without pulling in node crypto.
 */
export function generateAccessCode(): string {
  let code = "";
  for (let i = 0; i < ACCESS_CODE_LENGTH; i++) {
    // randomInt is rejection-sampled, so every character is equally likely.
    code += ACCESS_CODE_ALPHABET[randomInt(ACCESS_CODE_ALPHABET.length)];
  }
  return code;
}
