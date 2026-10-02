import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { editorialAssertions } from "../skills/kelly-app-skill-creator/assets/editorial-theme/check-editorial.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const ASSET_DIR = path.join(ROOT, "skills", "kelly-app-skill-creator", "assets", "editorial-theme");
const THEME = fs.readFileSync(path.join(ASSET_DIR, "editorial.css"), "utf8");

const FAMILIES = ["ink-paper", "rose-ochre", "mauve-plum", "coral-amber", "sage-clay", "ink-blush", "graphite"];
const REGISTERS = ["desk", "spread", "gallery"];

const CLEAN_HTML = `<html data-theme="rose-ochre" data-editorial="desk"><head>
<link rel="stylesheet" href="./styles/base-ui.css">
<link rel="stylesheet" href="./styles/editorial.css">
<link rel="stylesheet" href="./styles/shell.css"></head></html>`;

const CLEAN_CSS = `.row { color: var(--ink); font-size: var(--text-base); border-radius: var(--radius-sm); transition: background var(--ease); }
.headline { font-family: var(--font-display); font-size: var(--display-size); }
.card { border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
.sharp { border-radius: 0; }
.avatar { border-radius: 50%; }
.mix { background: color-mix(in srgb, var(--accent) 12%, var(--surface)); }`;

const failures = (css, html = CLEAN_HTML) =>
  editorialAssertions(THEME, css, html)
    .filter((a) => !a.ok)
    .map((a) => a.message);

test("the serif can be turned off in one attribute", () => {
  assert.match(THEME, /html:root\[data-display="sans"\]/);
});

test("the asset declares every family and register", () => {
  for (const family of FAMILIES) {
    assert.match(THEME, new RegExp(`html:root\\[data-theme="${family}"\\]`), `missing ${family}`);
  }
  for (const register of REGISTERS) {
    assert.match(THEME, new RegExp(`html:root\\[data-editorial="${register}"\\]`), `missing ${register}`);
  }
  // Every family must also have a dark override; a family that only exists in
  // light mode fails silently, as a screenshot nobody takes.
  const dark = THEME.slice(THEME.indexOf("@media (prefers-color-scheme: dark)"));
  for (const family of FAMILIES.slice(1)) {
    assert.match(dark, new RegExp(`html:root\\[data-theme="${family}"\\]`), `${family} has no dark tokens`);
  }
});

test("every token block outranks base-ui's unlayered html:root", () => {
  // base-ui.css declares its dark tokens on `html:root` (0,1,1). A bare
  // `:root` (0,1,0) loses to it in dark mode regardless of load order.
  const bare = THEME.split("\n").filter((line) => /^\s*:root[,{\s]/.test(line));
  assert.deepEqual(bare, [], `bare :root selectors would lose to base-ui: ${bare.join(" / ")}`);
});

test("a conforming stylesheet passes", () => {
  assert.deepEqual(failures(CLEAN_CSS), []);
});

// Each of these is a regression that shipped, or would have: the assertions
// only earn their place by going red here.
const violations = [
  ["raw colour", `${CLEAN_CSS}\n.bad { background: rgba(255,255,255,0.94); }`, /raw colour/],
  ["raw font size", `${CLEAN_CSS}\n.bad { font-size: 13px; }`, /font-size must read/],
  ["raw radius", `${CLEAN_CSS}\n.bad { border-radius: 14px; }`, /border-radius must read/],
  ["raw duration", `${CLEAN_CSS}\n.bad { transition: opacity 0.18s ease; }`, /transition\/animation must read/],
  [
    "serif at body size",
    `${CLEAN_CSS}\n.bad { font-family: var(--font-display); font-size: var(--text-sm); }`,
    /serif is display-only/,
  ],
];

for (const [name, css, expected] of violations) {
  test(`rejects ${name}`, () => {
    const found = failures(css);
    assert.equal(found.length, 1, `expected exactly one failure, got: ${found.join(" / ")}`);
    assert.match(found[0], expected);
  });
}

const orderings = [
  [
    "editorial before base-ui",
    `<html data-theme="x"><head><link rel=stylesheet href="./editorial.css"><link rel=stylesheet href="./base-ui.css"></head></html>`,
  ],
  [
    "app stylesheet before editorial",
    `<html data-theme="x"><head><link rel=stylesheet href="./shell.css"><link rel=stylesheet href="./editorial.css"></head></html>`,
  ],
  ["editorial missing", `<html data-theme="x"><head><link rel=stylesheet href="./shell.css"></head></html>`],
];

for (const [name, html] of orderings) {
  test(`rejects load order: ${name}`, () => {
    assert.match(failures(CLEAN_CSS, html).join(" "), /must load after base-ui\.css/);
  });
}

test("rejects an app that cannot switch family", () => {
  const html = CLEAN_HTML.replace(' data-theme="rose-ochre"', "");
  assert.match(failures(CLEAN_CSS, html).join(" "), /must drive data-theme/);
});

test("the reference page obeys its own contract", () => {
  const preview = fs.readFileSync(path.join(ASSET_DIR, "preview.html"), "utf8");
  const style = preview.slice(preview.indexOf("<style>"), preview.indexOf("</style>"));
  assert.deepEqual(
    failures(
      style,
      preview
        .replace("./editorial.css", "./base-ui.css")
        .replace("</head>", '<link rel="stylesheet" href="./editorial.css"></head>'),
    ),
    [],
  );
});

// ── Adopters ───────────────────────────────────────────────────────────────
// An app that has adopted the theme carries two copies of asset files:
// `app/styles/editorial.css` and `scripts/check-editorial.mjs`. They are
// copies rather than imports because each app ships as a self-contained
// Busabase template — which is exactly the arrangement that silently drifts,
// so it is asserted here, the same way base-ui.css is in base-ui-rollout.
const CHECKER = fs.readFileSync(path.join(ASSET_DIR, "check-editorial.mjs"));

// Scanned from disk, not `git ls-files`: an adopter that has not been
// committed yet is exactly when a drifted copy is cheapest to catch, and a
// vacuous pass here reads identical to a real one.
// Apps that got the full bespoke pass — hand-authored component CSS with
// zero raw colour/size/radius left anywhere, not just in a metric band or
// two. This used to be "every app with styles/editorial.css present", which
// was correct when there was exactly one such app (kelly-homework-coach, #156)
// and became wrong the moment apply-editorial-rollout.mjs gave the SAME file
// to all 70 remaining apps for a narrower reason: a correct new palette and
// type scale, not a from-scratch component rewrite. Those 70 apps still carry
// 1,064 pre-existing raw-colour declarations in their own component CSS
// (demo-visuals.css illustrations, status badges never touched by the
// original base-ui rollout either) — real, but out of THIS rollout's scope,
// and asserting them clean here would fail on day one for reasons unrelated
// to the rollout. tests/editorial-rollout.test.mjs asserts the mechanical
// contract (asset present, wired, accent-theme retired) for all 70; this
// list is only the ones held to the stricter, fully-clean bar.
const FULLY_ADOPTED = new Set(["kelly-homework-coach"]);

function adopters() {
  const skills = path.join(ROOT, "skills");
  const found = [];
  for (const skill of fs.readdirSync(skills, { withFileTypes: true })) {
    if (!skill.isDirectory() || !FULLY_ADOPTED.has(skill.name)) continue;
    const content = path.join(skills, skill.name, "content");
    if (!fs.existsSync(content)) continue;
    for (const app of fs.readdirSync(content, { withFileTypes: true })) {
      if (!app.isDirectory()) continue;
      const appDir = path.join(content, app.name);
      if (fs.existsSync(path.join(appDir, "app", "styles", "editorial.css"))) found.push(appDir);
    }
  }
  return found;
}

test("every adopter ships the asset byte-identically and enforces it", () => {
  for (const appDir of adopters()) {
    const relative = path.relative(ROOT, appDir);
    assert.deepEqual(
      fs.readFileSync(path.join(appDir, "app", "styles", "editorial.css")),
      Buffer.from(THEME),
      relative,
    );
    assert.deepEqual(fs.readFileSync(path.join(appDir, "scripts", "check-editorial.mjs")), CHECKER, relative);
    assert.match(
      fs.readFileSync(path.join(appDir, "scripts", "check.mjs"), "utf8"),
      /editorialAssertions/,
      `${relative}: check.mjs must run editorialAssertions`,
    );
  }
});

test("an adopted app's own stylesheet passes the contract", () => {
  for (const appDir of adopters()) {
    const relative = path.relative(ROOT, appDir);
    const appCss = fs
      .readdirSync(path.join(appDir, "app"), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".css") && entry.name !== "base-ui.css")
      .map((entry) => fs.readFileSync(path.join(appDir, "app", entry.name), "utf8"))
      .join("\n");
    const html = fs.readFileSync(path.join(appDir, "app", "index.html"), "utf8");
    assert.deepEqual(failures(appCss, html), [], relative);
  }
});

// ── Style picker: family swatches must not drift from editorial.css ────────
// style-picker.js hardcodes each family's canvas/ink/accent for its swatch
// tiles (the same pattern accent-theme.js already uses for its 8 colours —
// a literal copy, not a DOM read, because editorial.css's selectors are
// `html:root[data-theme]` specifically and probing via a detached element
// never matches them without flashing the whole page through all 7
// families). The literal table is real duplication, so it is verified here
// against the actual source on every run instead of trusted by inspection.
test("style-picker.js's family swatch table matches editorial.css's real values", () => {
  const pickerSource = fs.readFileSync(path.join(ASSET_DIR, "style-picker.js"), "utf8");
  const familiesMatch = pickerSource.match(/const FAMILIES = \[([\s\S]*?)\n\];/);
  assert.ok(familiesMatch, "style-picker.js must declare a FAMILIES table");

  const entries = [
    ...familiesMatch[1].matchAll(
      /id:\s*"([\w-]+)".*?canvas:\s*"(#[0-9a-f]+)".*?ink:\s*"(#[0-9a-f]+)".*?accent:\s*"(#[0-9a-f]+)"/gi,
    ),
  ];
  assert.equal(entries.length, FAMILIES.length, "FAMILIES table entry count must match the asset's family count");

  for (const [, id, canvas, ink, accent] of entries) {
    const blockMatch = THEME.match(new RegExp(`html:root\\[data-theme="${id}"\\]\\s*\\{([^}]*)\\}`));
    assert.ok(blockMatch, `editorial.css has no html:root[data-theme="${id}"] block`);
    const block = blockMatch[1];
    const realCanvas = block.match(/--canvas:\s*(#[0-9a-f]+);/i)?.[1];
    const realInk = block.match(/--ink:\s*(#[0-9a-f]+);/i)?.[1];
    const realAccent = block.match(/--accent:\s*(#[0-9a-f]+);/i)?.[1];
    assert.equal(canvas.toLowerCase(), realCanvas?.toLowerCase(), `${id}: canvas swatch drifted from editorial.css`);
    assert.equal(ink.toLowerCase(), realInk?.toLowerCase(), `${id}: ink swatch drifted from editorial.css`);
    assert.equal(accent.toLowerCase(), realAccent?.toLowerCase(), `${id}: accent swatch drifted from editorial.css`);
  }
});

test("style-picker.css reads every value from a token, like editorial.css requires of app CSS", () => {
  const pickerCss = fs.readFileSync(path.join(ASSET_DIR, "style-picker.css"), "utf8");
  // The swatch custom properties (--swatch-canvas/--swatch-ink/--swatch-accent)
  // are intentionally excluded from the "no raw colour" rule here: they are
  // per-instance values injected by style-picker.js, the same role
  // accent-theme.css's --swatch/--swatch-check inline custom properties play.
  const strippedOfSwatchVars = pickerCss.replace(/--swatch-(canvas|ink|accent)/g, "--swatchvar");
  const failures = editorialAssertions(THEME, strippedOfSwatchVars, CLEAN_HTML).filter((a) => !a.ok);
  assert.deepEqual(
    failures.map((f) => f.message),
    [],
  );
});
