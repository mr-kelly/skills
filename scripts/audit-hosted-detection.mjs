import { readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

/**
 * Hosting is decided from the PRESENCE of `BUSABASE_AIRAPP_RUNTIME`, never from
 * membership in a list of engine names. This audit exists because that rule has
 * now been broken twice, in two different places, by the same mistake.
 *
 * The history is the argument for auditing it centrally:
 *
 *  - #127 swept the shape out of every app's `server.js` after `local-node`
 *    became `local` and 66 apps answered "standalone" inside a hosted preview.
 *  - #129 found one server had grown it back during a layout move.
 *  - Neither pass touched `app/js/runtime.js`, where all 66 apps also carried
 *    the list — behind a `body.hosted === true ||` short-circuit that made it
 *    dead code, and therefore invisible, right up until it wasn't.
 *
 * Each app ships its own `check.mjs`, and those copies have drifted, so a rule
 * living only there gets enforced unevenly. This runs over every app on every
 * CI run instead.
 *
 * Matched on the LIST, not on what it is called: the shipped copies named it
 * `HOSTED`, while the rule written to catch them keyed off
 * `AIRAPP_HOSTED_RUNTIMES`. A name is whatever the next author picks; a
 * collection of engine names is the defect itself.
 */

const root = path.resolve(import.meta.dirname, "..");

// One engine name alone is ordinary vocabulary — "local" and "browser" are
// words an app may legitimately use. Two or more in a single literal, with at
// least one that could not be anything else, is the shape.
const ENGINE_NAME = /["'`](?:nodepod|local-node|sandock|srt|embed|browser|remote|local)["'`]/g;
const DISTINCTIVE = /["'`](?:nodepod|local-node|sandock|srt|embed|remote)["'`]/;

const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:'"`\\])\/\/[^\n]*/g, "$1 ");

const findEngineNameList = (code) =>
  (code.match(/\[[^\]]*\]/g) ?? []).find((literal) => {
    const names = literal.match(ENGINE_NAME) ?? [];
    return names.length >= 2 && DISTINCTIVE.test(literal);
  });

/**
 * Vendored `busabase-sdk` bundles are excluded, and that is a real distinction
 * rather than a convenience: the SDK does publish a list of runtime names
 * (`BUSABASE_AIRAPP_RUNTIMES`), but it is documentation — `isBusabaseAirAppHosted`
 * decides from presence and never consults it. The rule here is about an APP
 * forming its own opinion. Third-party build output is also not something an
 * app author can act on, and a rule that reports unactionable findings is a
 * rule that gets switched off.
 */
const IGNORED = /(^|\/)(node_modules|dist|\.pnpm|vendor)(\/|$)/;

const findings = [];
for await (const file of glob("skills/*/content/*-app/**/*.{js,mjs,ts}", { cwd: root })) {
  if (IGNORED.test(file)) continue;
  const source = await readFile(path.join(root, file), "utf8");
  const found = findEngineNameList(stripComments(source));
  if (found) findings.push(`${file} carries a hardcoded engine list ${found.trim()}`);
}

if (findings.length) {
  console.error(`Hosted-detection audit failed (${findings.length} finding(s)):`);
  for (const finding of findings) console.error(`- ${finding}`);
  console.error(
    "Fix: decide hosting from presence — the server's own `hosted` field, or the SDK's isBusabaseAirAppHosted() — and delete the list.",
  );
  process.exitCode = 1;
} else {
  console.log("Hosted-detection audit passed");
}
