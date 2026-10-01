// Roll the editorial theme preset out across the Kelly App-in-Skill fleet.
//
// Mechanical only, mirroring apply-base-ui-rollout.mjs's shape and the same
// reason it exists as a script instead of prose: a rule that is only written
// down gets re-derived (or skipped) per app; a rule a script enforces does
// not. This script does NOT attempt the "real adopter" pass kelly-homework-coach
// got in #156 — finding and fixing an app's own behavioral bugs (demo mode,
// locale routing, raw ids) is bespoke work, one app at a time, not something
// a fleet-wide script can safely do. What IS safe and mechanical:
//
//   1. Copy editorial.css + check-editorial.mjs into the app, unmodified.
//   2. Wire editorial.css right after base-ui.css in index.html, before every
//      app-owned stylesheet.
//   3. Set data-theme="ink-paper" data-editorial="desk" on <html> so the app
//      has an explicit, changeable default from day one.
//
// What this does NOT do, corrected after CI caught it: retire
// accent-theme.css/.js. The first version of this script did — "the family
// is the accent now" by analogy to kelly-homework-coach's bespoke pass — and
// that reasoning does not survive contact with a blind fleet-wide pass.
// accent-theme.js renders a real, working, tested Help & Settings control (an
// 8-colour picker; kelly-invoice-sheet's ui_test.py asserts `.accent-settings`
// exists) with no editorial-family replacement built yet. Removing a working,
// tested, operator-facing control with nothing replacing it is a product
// regression, not a mechanical cleanup — the 60 affected apps had their
// accent-theme.css/.js restored byte-identical from the pre-rollout commit.
// See the rollout changelog for the full story and the accepted trade-off
// this leaves (an operator-picked accent can now sit on a paper it was never
// designed against).
//
// This alone is sufficient to re-theme the app correctly: editorial.css's
// canonical tokens (--ink, --accent, --line, --muted, ...) are declared on an
// unlayered `html:root` selector (specificity 0,1,1), which beats every
// existing app's own unlayered `:root { --ink: ...; }` block (0,1,0)
// regardless of load order or which layer base-ui.css's own light-mode block
// sits in. Confirmed by reading computed style with a real app's real CSS
// linked, not assumed — see the editorial-rollout changelog for the
// three-way comparison. The one thing this script does NOT do is edit any
// app's own CSS body: every one of the 70 apps still declares (and many
// still use) a second, pre-rollout set of legacy names (--bg, --panel,
// --text, --warn, --bad, --good, --line-strong, ...) that base-ui.css only
// aliases in its dark-mode block. editorial.css now carries the same alias
// shim so those names resolve to the new palette too, in both colour
// schemes, without this script having to touch a single app-owned selector.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checkOnly = process.argv.includes("--check");
const ASSET_DIR = path.join(root, "skills", "kelly-app-skill-creator", "assets", "editorial-theme");
const editorialTemplate = fs.readFileSync(path.join(ASSET_DIR, "editorial.css"), "utf8");
const checkEditorialTemplate = fs.readFileSync(path.join(ASSET_DIR, "check-editorial.mjs"), "utf8");

// Adopters already carry their own copy from a real, individually-verified
// pass (kelly-homework-coach via #156) and must not be silently overwritten
// by a mechanical run — a future adopter is added here, by name, once its own
// PR lands, the same way apply-accent-theme-rollout.mjs never re-templated an
// app that had already customized its accent picker.
const ADOPTED = new Set(["kelly-homework-coach"]);

function kellyAppDirs() {
  return execFileSync("git", ["ls-files", "skills"], { cwd: root, encoding: "utf8" })
    .trim()
    .split("\n")
    .filter((filePath) => filePath.startsWith("skills/kelly-") && filePath.endsWith("/app/index.html"))
    .map((filePath) => path.dirname(path.join(root, filePath)))
    .sort();
}

function skillName(appDir) {
  // .../skills/<skill-name>/content/<skill-name>-app/app
  const parts = appDir.split(path.sep);
  return parts[parts.length - 4];
}

function wireEditorial(html) {
  if (/editorial\.css/.test(html)) return html; // already wired — idempotent
  const lines = html.split("\n");
  const baseUiIndex = lines.findIndex((line) => /base-ui\.css/.test(line));
  if (baseUiIndex < 0) throw new Error("index.html has no base-ui.css link to wire editorial.css after");
  const indent = lines[baseUiIndex].match(/^\s*/)?.[0] ?? "";
  lines.splice(baseUiIndex + 1, 0, `${indent}<link rel="stylesheet" href="./styles/editorial.css" />`);
  return lines.join("\n");
}

function ensureThemeAttrs(html) {
  return html.replace(/<html\b([^>]*)>/, (match, attrs) => {
    let next = attrs;
    if (!/\sdata-theme=/.test(next)) next += ' data-theme="ink-paper"';
    if (!/\sdata-editorial=/.test(next)) next += ' data-editorial="desk"';
    return `<html${next}>`;
  });
}

const changed = [];

function updateFile(filePath, next) {
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
  if (current === next) return;
  changed.push(path.relative(root, filePath));
  if (!checkOnly) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, next);
  }
}

const appDirs = kellyAppDirs();
let touchedApps = 0;

for (const appDir of appDirs) {
  if (ADOPTED.has(skillName(appDir))) continue;
  touchedApps += 1;

  updateFile(path.join(appDir, "styles", "editorial.css"), editorialTemplate);
  updateFile(path.join(appDir, "..", "scripts", "check-editorial.mjs"), checkEditorialTemplate);

  const indexPath = path.join(appDir, "index.html");
  let html = fs.readFileSync(indexPath, "utf8");
  html = wireEditorial(html);
  html = ensureThemeAttrs(html);
  updateFile(indexPath, html);
}

if (checkOnly && changed.length > 0) {
  console.error(`Editorial rollout is stale for ${touchedApps} app(s):`);
  console.error(changed.map((f) => `    ${f}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `${checkOnly ? "Checked" : "Applied"} editorial rollout across ${touchedApps} app(s) (${ADOPTED.size} already adopted).`,
  );
  if (changed.length) console.log(`${changed.length} file(s) written.`);
}
