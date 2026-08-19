/**
 * Human-typeable team access codes for draft rooms.
 *
 * This module is deliberately free of node builtins so the draft board and
 * admin panel can share the normalize/format helpers with the server. Code
 * generation needs a CSPRNG and lives in `draft-access-code-server.ts`.
 *
 * Captains used to receive a one-time URL carrying a 32-character base64url
 * token. That failed on draft day in three ways: the link died the moment it
 * was redeemed (so a second device, or a browser that dropped the cookie, was
 * locked out for good), chat clients mangled the long query string, and there
 * was no way to re-read a link once it scrolled away.
 *
 * A code is instead short enough to read aloud in voice chat, survives being
 * typed by hand, and stays valid for the whole draft.
 *
 * The alphabet is Crockford base32: the digits and uppercase letters minus
 * I, L, O and U. Dropping those removes every 1/I/l and 0/O confusion, and
 * dropping U keeps accidental profanity out of generated codes.
 */
export const ACCESS_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Code length in characters. 32^8 ≈ 1.1e12 combinations. */
export const ACCESS_CODE_LENGTH = 8;

/**
 * Fold whatever the captain typed into canonical code characters.
 *
 * Applies the Crockford decoding rules (O reads as 0, I and L read as 1) and
 * discards anything that is not an alphabet character, so "h7k2-qm4x",
 * "H7K2 QM4X" and "h7kz-qm4x " all normalize to the same code. Returns "" when
 * the input contains no usable characters.
 */
export function normalizeAccessCode(input: string): string {
  const folded = input
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");

  let normalized = "";
  for (const char of folded) {
    if (ACCESS_CODE_ALPHABET.includes(char)) normalized += char;
  }
  return normalized;
}

/** Display form of a code: "H7K2QM4X" → "H7K2-QM4X". */
export function formatAccessCode(code: string): string {
  const normalized = normalizeAccessCode(code);
  if (normalized.length !== ACCESS_CODE_LENGTH) return code;
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

/**
 * True when the value is a well-formed team access code.
 *
 * Legacy 32-character link tokens are still redeemable but are not codes —
 * the admin UI uses this to flag seats that should be rotated onto a code.
 */
export function isAccessCode(value: string): boolean {
  if (value.length !== ACCESS_CODE_LENGTH) return false;
  return [...value].every((char) => ACCESS_CODE_ALPHABET.includes(char));
}
