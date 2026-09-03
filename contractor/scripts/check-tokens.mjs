#!/usr/bin/env node
// Token-drift guard.
//
// This app is a second Next.js app beside `dashboard/`, so it carries a second
// copy of the design tokens. Two copies drift; a drifted copy is exactly the
// failure the "make it match the rest" requirement is about. So the copy is
// checked rather than trusted: the first `:root { … }` block and the
// `@theme inline { … }` block of both files must be byte-identical after
// whitespace normalisation.
//
// Source of truth is the dashboard. If this fails, copy from there — not here.
// Contractor-only additions live BELOW the copied region and are ignored.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(here, "../../dashboard/src/app/globals.css");
const COPY = resolve(here, "../src/app/globals.css");

/** Drop comments, so a selector named inside prose is never mistaken for code. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Return the first `<selector> { … }` block, brace-matched, or null. */
function block(css, selector) {
  const start = css.indexOf(selector);
  if (start === -1) return null;
  const open = css.indexOf("{", start);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
  }
  return null;
}

/** Collapse whitespace, so formatting is not a failure. */
function normalise(text) {
  return text.replace(/\s+/g, " ").trim();
}

const [source, copy] = (
  await Promise.all([readFile(SOURCE, "utf8"), readFile(COPY, "utf8")])
).map(stripComments);

const problems = [];
for (const selector of [":root", "@theme inline"]) {
  const a = block(source, selector);
  const b = block(copy, selector);
  if (a === null) problems.push(`\`${selector}\` not found in ${SOURCE}`);
  else if (b === null) problems.push(`\`${selector}\` not found in ${COPY}`);
  else if (normalise(a) !== normalise(b)) {
    problems.push(
      `\`${selector}\` has drifted from the dashboard's copy.\n` +
        `  Source: dashboard/src/app/globals.css\n` +
        `  Copy:   contractor/src/app/globals.css\n` +
        `  Fix by copying the block from the source, never the other way round.`,
    );
  }
}

if (problems.length > 0) {
  console.error("Design tokens have drifted between the two apps.\n");
  for (const problem of problems) console.error(`- ${problem}`);
  console.error("");
  process.exit(1);
}

console.log("Design tokens match dashboard/src/app/globals.css.");
