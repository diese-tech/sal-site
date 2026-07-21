import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const GLOBAL_CSS = join(ROOT, "src", "app", "globals.css");
const SOURCE_ROOT = join(ROOT, "src");
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

const bemClassPattern =
  /^sal-[a-z0-9]+(?:-[a-z0-9]+)*(?:__[a-z0-9]+(?:-[a-z0-9]+)*)?(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?$/;
const utilityClassPattern = /^u-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const stateClassPattern = /^(?:is|has)-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const legacyClassPatterns = [
  /^sal-btn-/,
  /^(?:font-display|live-pulse)$/,
  /^skeleton-shimmer(?:-|$)/,
  /^(?:glow|border)-(?:solar|lunar|terra)/,
];

export function extractAuthoredClasses(css) {
  const classes = new Set();
  const source = css.replaceAll(/\/\*[\s\S]*?\*\//g, "");
  const contexts = [{ type: "group", prelude: "" }];
  const groupingRules = new Set([
    "container",
    "document",
    "layer",
    "media",
    "scope",
    "starting-style",
    "supports",
  ]);

  function collectClasses(selector) {
    for (const match of selector.matchAll(/\.((?:\\.|[A-Za-z0-9_-])+)/g)) {
      classes.add(match[1].replaceAll("\\:", ":"));
    }
  }

  for (const character of source) {
    const context = contexts.at(-1);

    if (character === "{") {
      if (context.type === "group") {
        const selector = context.prelude.trim();
        context.prelude = "";
        if (selector.startsWith("@")) {
          const ruleName = selector.slice(1).match(/^[a-z-]+/)?.[0];
          contexts.push({
            type: ruleName && groupingRules.has(ruleName) ? "group" : "ignore",
            prelude: "",
          });
        } else {
          collectClasses(selector);
          contexts.push({ type: "rule", prelude: "" });
        }
      } else {
        contexts.push({ type: "ignore", prelude: "" });
      }
      continue;
    }

    if (character === "}") {
      if (contexts.length > 1) contexts.pop();
      contexts.at(-1).prelude = "";
      continue;
    }

    if (context.type === "group") {
      if (character === ";") context.prelude = "";
      else context.prelude += character;
    }
  }

  return [...classes].sort();
}

export function validateAuthoredClasses(classes) {
  const defined = new Set(classes);
  const errors = [];

  for (const className of classes) {
    const isLegacy = legacyClassPatterns.some((pattern) => pattern.test(className));
    const isAllowed =
      bemClassPattern.test(className) ||
      utilityClassPattern.test(className) ||
      stateClassPattern.test(className);

    if (isLegacy || !isAllowed) {
      errors.push(
        `${className}: use sal-block, sal-block__element, sal-block--modifier, u-utility, or is/has-state naming.`,
      );
      continue;
    }

    const modifierIndex = className.indexOf("--");
    if (modifierIndex > -1) {
      const baseClass = className.slice(0, modifierIndex);
      if (!defined.has(baseClass)) {
        errors.push(`${className}: missing base class .${baseClass}.`);
      }
    }
  }

  return errors;
}

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return SOURCE_EXTENSIONS.has(extname(path)) ? [path] : [];
  });
}

function checkUsage(classes) {
  const files = sourceFiles(SOURCE_ROOT).map((path) => ({
    path,
    source: readFileSync(path, "utf8"),
  }));
  const errors = [];

  for (const className of classes) {
    const references = files.filter(({ source }) => source.includes(className));
    if (references.length === 0) {
      errors.push(`${className}: defined in globals.css but unused in src/**/*.ts(x).`);
      continue;
    }

    const modifierIndex = className.indexOf("--");
    if (modifierIndex > -1) {
      const baseClass = className.slice(0, modifierIndex);
      if (!references.some(({ source }) => source.includes(baseClass))) {
        errors.push(`${className}: no source file also references base class ${baseClass}.`);
      }
    }
  }

  return errors;
}

export function runBemCheck() {
  const classes = extractAuthoredClasses(readFileSync(GLOBAL_CSS, "utf8"));
  const errors = [...validateAuthoredClasses(classes), ...checkUsage(classes)];

  if (errors.length > 0) {
    console.error("BEM compatibility check failed:\n");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Verified ${classes.length} authored global classes against the SAL BEM compatibility contract.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runBemCheck();
}
