import { describe, expect, it } from "vitest";
import {
  ACCESS_CODE_ALPHABET,
  ACCESS_CODE_LENGTH,
  formatAccessCode,
  isAccessCode,
  normalizeAccessCode,
} from "./draft-access-code";
import { generateAccessCode } from "./draft-access-code-server";

describe("access code alphabet", () => {
  it("excludes every character pair a captain could misread", () => {
    for (const char of "ILOU") {
      expect(ACCESS_CODE_ALPHABET).not.toContain(char);
    }
    expect(ACCESS_CODE_ALPHABET).toHaveLength(32);
  });
});

describe("generateAccessCode", () => {
  it("produces codes of the declared length using only alphabet characters", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateAccessCode();
      expect(code).toHaveLength(ACCESS_CODE_LENGTH);
      expect(isAccessCode(code)).toBe(true);
    }
  });

  it("does not repeat within a small sample", () => {
    const codes = new Set(Array.from({ length: 200 }, generateAccessCode));
    expect(codes.size).toBe(200);
  });
});

describe("normalizeAccessCode", () => {
  it("accepts the formatted form an admin copies", () => {
    expect(normalizeAccessCode("H7K2-QM4X")).toBe("H7K2QM4X");
  });

  it("accepts lowercase, spaces and stray whitespace", () => {
    expect(normalizeAccessCode("  h7k2 qm4x \n")).toBe("H7K2QM4X");
  });

  it("folds the lookalike characters captains actually type", () => {
    // O reads as 0; I and L read as 1 (Crockford decoding rules).
    expect(normalizeAccessCode("OI L0")).toBe("0110");
    expect(normalizeAccessCode("hokz")).toBe("H0KZ");
  });

  it("returns an empty string when nothing usable was typed", () => {
    expect(normalizeAccessCode("")).toBe("");
    expect(normalizeAccessCode("---")).toBe("");
  });

  it("is idempotent", () => {
    const once = normalizeAccessCode("h7k2-qm4x");
    expect(normalizeAccessCode(once)).toBe(once);
  });
});

describe("formatAccessCode", () => {
  it("groups a full code into two readable halves", () => {
    expect(formatAccessCode("H7K2QM4X")).toBe("H7K2-QM4X");
    expect(formatAccessCode("h7k2qm4x")).toBe("H7K2-QM4X");
  });

  it("returns non-code input unchanged rather than mangling it", () => {
    const legacy = "aVeryLongLegacyLinkToken_123456";
    expect(formatAccessCode(legacy)).toBe(legacy);
  });
});

describe("isAccessCode", () => {
  it("accepts a well-formed code", () => {
    expect(isAccessCode("H7K2QM4X")).toBe(true);
  });

  it("rejects legacy link tokens so the admin UI can flag them", () => {
    expect(isAccessCode("aVeryLongLegacyLinkToken_123456")).toBe(false);
  });

  it("rejects wrong length and off-alphabet characters", () => {
    expect(isAccessCode("H7K2QM4")).toBe(false);
    expect(isAccessCode("H7K2QM4XY")).toBe(false);
    expect(isAccessCode("H7K2QM4I")).toBe(false); // I is not in the alphabet
    expect(isAccessCode("h7k2qm4x")).toBe(false); // canonical form is uppercase
  });
});
