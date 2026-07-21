import { describe, expect, it } from "vitest";
import { extractAuthoredClasses, validateAuthoredClasses } from "../scripts/check-bem.mjs";

describe("BEM compatibility checker", () => {
  it("extracts authored classes without treating declarations as selectors", () => {
    const css = `
      .sal-card, .sal-card__title:hover { color: rgba(1, 2, 3, 0.25); }
      @keyframes pulse { 50% { opacity: 0.5; } }
      @media (min-width: 40rem) { .sal-card--wide { display: grid; } }
      .u-font-display { font-family: system-ui; }
    `;

    expect(extractAuthoredClasses(css)).toEqual([
      "sal-card",
      "sal-card--wide",
      "sal-card__title",
      "u-font-display",
    ]);
  });

  it("accepts blocks, elements, modifiers, utilities, and state hooks", () => {
    expect(
      validateAuthoredClasses([
        "has-results",
        "is-active",
        "sal-button",
        "sal-button__icon",
        "sal-button--ember",
        "u-font-display",
      ]),
    ).toEqual([]);
  });

  it("rejects legacy aliases and orphan modifiers", () => {
    expect(validateAuthoredClasses(["font-display", "sal-btn-ember", "sal-card--live"]))
      .toEqual([
        "font-display: use sal-block, sal-block__element, sal-block--modifier, u-utility, or is/has-state naming.",
        "sal-btn-ember: use sal-block, sal-block__element, sal-block--modifier, u-utility, or is/has-state naming.",
        "sal-card--live: missing base class .sal-card.",
      ]);
  });
});
