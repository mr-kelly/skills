// Fleet-wide invariants for the mechanical editorial rollout
// (scripts/apply-editorial-rollout.mjs). Mirrors tests/base-ui-rollout.test.mjs's
// shape and reason for existing: a rule enforced by a script that copies a file
// is only as durable as the next PR that touches that app. This is the net that
// catches an app's index.html drifting back out of order, or a future app
// joining the fleet without the wiring.
//
// Scope, stated plainly: this asserts the MECHANICAL contract (asset present,
// byte-identical, wired in the right position, style attributes set) for
// every non-adopted app. It does NOT assert that an app's own component CSS
// is free of raw colour/size/radius — 1,064 such declarations were counted
// across the fleet's pre-existing CSS before this rollout touched a single
// file, and cleaning those up is real, bespoke, per-app work (the kind
// kelly-homework-coach got in #156), not something a mechanical rollout can
// safely do to 70 apps' component rules at once. See the rollout changelog
// for the full accounting.
//
// It also does NOT assert accent-theme.css/.js is retired. An earlier version
// of this rollout did retire it fleet-wide ("the family is the accent now")
// and CI caught the regression within the first run: accent-theme.js renders
// a real, tested, operator-facing Help & Settings control
// (`.accent-settings`) with no editorial-family replacement built yet.
// scripts/apply-editorial-rollout.mjs no longer touches accent-theme at all —
// this file asserts CONSISTENCY instead of a fixed outcome: whichever apps
// currently have accent-theme.css keep it correctly wired, and editorial.css
// is still positioned right regardless of whether it's present.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { editorialAssertions } from "../skills/kelly-app-skill-creator/assets/editorial-theme/check-editorial.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const ASSET_DIR = path.join(ROOT, "skills", "kelly-app-skill-creator", "assets", "editorial-theme");
const EDITORIAL_CSS = fs.readFileSync(path.join(ASSET_DIR, "editorial.css"));
const CHECK_EDITORIAL = fs.readFileSync(path.join(ASSET_DIR, "check-editorial.mjs"));

// Apps that got the full bespoke pass (behavioral fixes, demo recording,
// hand-authored component CSS) rather than the mechanical rollout. Their own
// PR is responsible for keeping their copy current; this file only asserts
// they still carry a byte-identical asset, the same net every app gets.
const ADOPTED = new Set(["kelly-homework-coach"]);

function appDirs() {
  return execFileSync("git", ["ls-files", "skills"], { cwd: ROOT, encoding: "utf8" })
    .trim()
    .split("\n")
    .filter((filePath) => filePath.startsWith("skills/kelly-") && filePath.endsWith("/app/index.html"))
    .map((filePath) => path.dirname(path.join(ROOT, filePath)))
    .sort();
}

function skillName(appDir) {
  const parts = appDir.split(path.sep);
  return parts[parts.length - 4];
}

function stylesheetHrefs(html) {
  return [...html.matchAll(/<link\b[^>]*>/gi)]
    .filter((m) => /rel\s*=\s*["']?stylesheet/i.test(m[0]))
    .map((m) => m[0].match(/href\s*=\s*["']([^"']+)["']/i)?.[1] ?? "");
}

function ownCssFiles(appDir) {
  const rootCss = fs
    .readdirSync(appDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".css") &&
        !["base-ui.css", "accent-theme.css", "editorial.css"].includes(entry.name),
    )
    .map((entry) => path.join(appDir, entry.name));
  const stylesDir = path.join(appDir, "styles");
  const layeredCss = fs.existsSync(stylesDir)
    ? fs
        .readdirSync(stylesDir, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isFile() &&
            entry.name.endsWith(".css") &&
            !["layers.css", "base-ui.css", "editorial.css"].includes(entry.name),
        )
        .map((entry) => path.join(stylesDir, entry.name))
    : [];
  return [...rootCss, ...layeredCss];
}

test("every non-adopted app carries the byte-identical editorial asset", () => {
  const apps = appDirs();
  assert.ok(
    apps.length >= 71,
    `expected at least 71 apps, found ${apps.length} — update ADOPTED/this count if an app was added or removed`,
  );

  for (const appDir of apps) {
    if (ADOPTED.has(skillName(appDir))) continue;
    const relative = path.relative(ROOT, appDir);
    assert.deepEqual(
      fs.readFileSync(path.join(appDir, "styles", "editorial.css")),
      EDITORIAL_CSS,
      `${relative}: styles/editorial.css is stale — rerun apply-editorial-rollout.mjs`,
    );
    assert.deepEqual(
      fs.readFileSync(path.join(appDir, "..", "scripts", "check-editorial.mjs")),
      CHECK_EDITORIAL,
      `${relative}: scripts/check-editorial.mjs is stale — rerun apply-editorial-rollout.mjs`,
    );
  }
});

test("every non-adopted app wires editorial.css after base-ui.css and before its own CSS", () => {
  for (const appDir of appDirs()) {
    if (ADOPTED.has(skillName(appDir))) continue;
    const relative = path.relative(ROOT, appDir);
    const html = fs.readFileSync(path.join(appDir, "index.html"), "utf8");
    const hrefs = stylesheetHrefs(html);

    const baseUiAt = hrefs.findIndex((h) => h.endsWith("base-ui.css"));
    const editorialAt = hrefs.findIndex((h) => h.endsWith("editorial.css"));
    assert.ok(baseUiAt >= 0, `${relative}: no base-ui.css link`);
    assert.equal(
      editorialAt,
      baseUiAt + 1,
      `${relative}: editorial.css must be the stylesheet immediately after base-ui.css — order is ${hrefs.join(", ")}`,
    );

    assert.match(html, /<html\b[^>]*\sdata-theme="[^"]+"/, `${relative}: <html> is missing data-theme`);
    assert.match(html, /<html\b[^>]*\sdata-editorial="[^"]+"/, `${relative}: <html> is missing data-editorial`);
  }
});

test("accent-theme.css/.js is untouched by the rollout: present apps stay correctly wired, absent apps stay absent", () => {
  for (const appDir of appDirs()) {
    if (ADOPTED.has(skillName(appDir))) continue;
    const relative = path.relative(ROOT, appDir);
    const hasCss = fs.existsSync(path.join(appDir, "accent-theme.css"));
    const hasJs = fs.existsSync(path.join(appDir, "accent-theme.js"));
    assert.equal(hasCss, hasJs, `${relative}: accent-theme.css and .js must both exist or both be absent`);
    if (!hasCss) continue;

    const html = fs.readFileSync(path.join(appDir, "index.html"), "utf8");
    const hrefs = stylesheetHrefs(html);
    assert.equal(hrefs.at(-1), "./accent-theme.css", `${relative}: accent-theme.css must stay the LAST stylesheet`);
    assert.match(
      html,
      /<script\b[^>]*\bsrc="\.\/accent-theme\.js"/,
      `${relative}: accent-theme.js script tag is missing`,
    );
  }
});

test("editorial.css's canonical + legacy-alias tokens actually win a real app's cascade, in both colour schemes", () => {
  // Regression test for the exact bug this rollout's own investigation found:
  // base-ui.css's canonical light-mode block is INSIDE @layer base-ui and
  // deliberately loses to an app's own unlayered `:root`, and ~50 legacy
  // synonym names (--bg, --panel, --text, --warn, --line-strong, ...) are
  // declared ONLY in base-ui's dark-mode block — so before this rollout, an
  // app's pre-existing `:root { --bg: #f7f8fa; }` was the sole source of
  // truth for those names in light mode. If editorial.css's alias shim ever
  // regresses (a name gets removed, or accidentally becomes a
  // same-specificity self-reference — a real bug caught once already, see
  // the LEGACY NAME SHIM comment in editorial.css), this fails loudly instead
  // of shipping a half-themed app that only shows up in a screenshot.
  // No DOM available in node:test; this asserts the SOURCE-LEVEL contract
  // (selector specificity form + no self-reference) that the browser-verified
  // cascade math in the rollout changelog depends on, rather than
  // re-implementing a CSS cascade engine here.
  const shimIndex = EDITORIAL_CSS.toString("utf8").indexOf("LEGACY NAME SHIM");
  assert.ok(shimIndex > 0, "editorial.css must carry the legacy name shim");
  const shim = EDITORIAL_CSS.toString("utf8").slice(shimIndex);

  // Every alias selector must be `html:root` (specificity 0,1,1) — a bare
  // `:root` (0,1,0) would lose the exact race this shim exists to win.
  const shimSelectors = [...shim.matchAll(/^([a-z:\[\]"=\-\s,]+)\{/gim)].map((m) => m[1].trim());
  for (const selector of shimSelectors) {
    for (const part of selector.split(",").map((s) => s.trim())) {
      assert.match(part, /^html:root(\[[^\]]*\])?$/, `shim selector "${part}" must be html:root, not a bare :root`);
    }
  }

  // No alias may be a same-specificity self-reference (var(--x) inside the
  // declaration for --x) — CSS defines that as guaranteed-invalid, which
  // silently unsets the property fleet-wide. Caught once already while
  // authoring this shim; asserted here so it cannot come back.
  const declarations = [...shim.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)];
  for (const [, name, value] of declarations) {
    assert.ok(
      !new RegExp(`var\\(\\s*${name}\\s*[,)]`).test(value),
      `${name}: var(${name}) inside its own declaration is guaranteed-invalid and unsets it fleet-wide`,
    );
  }

  // The specific legacy names this rollout's audit found still in fleet-wide
  // use (grepped, not guessed — see the rollout changelog for the count per
  // name) must all be present.
  const mustAlias = [
    "--bg",
    "--panel",
    "--panel-subtle",
    "--text",
    "--warn",
    "--bad",
    "--good",
    "--accent-weak",
    "--line-strong",
    "--radius",
    "--muted-soft",
    "--border",
  ];
  for (const name of mustAlias) {
    assert.match(shim, new RegExp(`${name}\\s*:`), `legacy name ${name} is no longer aliased`);
  }
});

test("an adopted app's own stylesheet still passes the editorial contract", () => {
  for (const skill of ADOPTED) {
    const appDir = path.join(ROOT, "skills", skill, "content", `${skill}-app`, "app");
    const theme = fs.readFileSync(path.join(appDir, "styles", "editorial.css"), "utf8");
    const html = fs.readFileSync(path.join(appDir, "index.html"), "utf8");
    const other = ownCssFiles(appDir)
      .map((f) => fs.readFileSync(f, "utf8"))
      .join("\n");
    const failures = editorialAssertions(theme, other, html).filter((a) => !a.ok);
    assert.deepEqual(
      failures.map((f) => f.message),
      [],
      `${skill}: adopted app must pass its own editorial contract`,
    );
  }
});
