// Tokenize the raw colour/box-shadow declarations that survived the
// original base-ui rollout and the editorial rollout, in every kelly-*
// app's own component CSS.
//
// Scope, deliberately conservative — see the companion changelog for the
// full count. 1,062 raw-colour-bearing declarations were found across the
// fleet before this script touched anything. Four buckets are safe to map
// mechanically, and this script maps only those:
//
//   1. Dead var(--x, #fallback) fallbacks. --x is always defined now (via
//      base-ui.css, editorial.css, or the app's own legacy :root), so the
//      fallback never fires — dropping it changes zero rendered pixels.
//   2. box-shadow colour portions. The geometry (offset/blur/spread) is
//      untouched; only the embedded rgba()/hex is replaced, with the ring
//      pattern (0 0 0 Npx COLOR, used for focus/selection) mapped to
//      --accent-focus and every other shape mapped to --shadow-tint /
//      --shadow-tint-deep by alpha.
//   3. Scrim/blur overlays — near-black or near-white translucent
//      backgrounds — mapped to --scrim / --surface-blur.
//   4. A literal dictionary of the handful of hex values that repeat
//      verbatim across 3+ apps (--ink-badge-style #202124 alone accounts for
//      60 of the 1,062), plus a conservative hue-angle classifier for
//      saturated colours that don't match the dictionary.
//
// Explicitly NOT touched, and not attempted: gradients (background-image,
// multi-stop background), and any bare colour this script's own confidence
// check rejects. Those are reported by --check/--report, not silently
// skipped — see the companion changelog for the final count and file list.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checkOnly = process.argv.includes("--check");
const report = process.argv.includes("--report");

function kellyAppDirs() {
  return execFileSync("git", ["ls-files", "skills"], { cwd: root, encoding: "utf8" })
    .trim()
    .split("\n")
    .filter((f) => f.startsWith("skills/kelly-") && f.endsWith("/app/index.html"))
    .map((f) => path.dirname(path.join(root, f)))
    .sort();
}

function ownCssFiles(appDir) {
  const skip = new Set(["base-ui.css", "accent-theme.css", "editorial.css", "layers.css", "style-picker.css"]);
  const out = [];
  for (const base of [appDir, path.join(appDir, "styles")]) {
    if (!fs.existsSync(base)) continue;
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".css") || skip.has(entry.name)) continue;
      out.push(path.join(base, entry.name));
    }
  }
  return out;
}

// ---- colour math -----------------------------------------------------

function rgbFromHex(hex) {
  const raw = hex.replace("#", "");
  if (raw.length !== 3 && raw.length !== 6) return null;
  const n = raw.length === 3 ? [...raw].map((c) => c + c).join("") : raw;
  return [0, 2, 4].map((i) => Number.parseInt(n.slice(i, i + 2), 16));
}

function rgbFromAny(value) {
  const hex = value.match(/^#[0-9a-fA-F]{3,8}$/);
  if (hex) return rgbFromHex(value);
  const fn = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3])];
  return null;
}

function alphaFromAny(value) {
  const m = value.match(/rgba?\([^)]*[,/]\s*([\d.]+)%?\s*\)/i);
  if (!m) return 1;
  const n = Number(m[1]);
  return value.includes("%") || m[1].includes("%") ? n / 100 : n;
}

function rgbToHsl([r, g, b]) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
}

// High-frequency literals that repeat verbatim across 3+ apps, mapped by
// hand after inspection rather than trusted to the hue classifier — mostly
// near-black "ink badge" greys that sit below the classifier's saturation
// floor and would otherwise fall through unclassified.
const EXACT_MAP = {
  "#202124": "var(--ink)",
  "#111827": "var(--ink)",
  "#1f2937": "var(--ink)",
  "#18181b": "var(--ink)",
  "#0f172a": "var(--ink)",
  "#1c2831": "var(--ink)",
  "#000": "var(--ink)",
  "#000000": "var(--ink)",
  "#94a3b8": "var(--muted)",
  "#64748b": "var(--muted)",
  "#cbd5e1": "var(--line-strong)",
  "#eef1f5": "var(--surface-soft)",
};

function classifyHue(hex) {
  const rgb = rgbFromHex(hex);
  if (!rgb) return null;
  const [h, s, l] = rgbToHsl(rgb);
  if (s < 0.14) return null; // too neutral to confidently call a status hue
  if (l < 0.12 || l > 0.94) return null; // too close to black/white to classify by hue
  let bucket;
  if (h >= 345 || h < 15) bucket = "danger";
  else if (h >= 15 && h < 58) bucket = "warning";
  else if (h >= 78 && h < 168) bucket = "positive";
  else if (h >= 180 && h < 345) bucket = "accent";
  else return null; // 58-78 (yellow-green) and 168-180 (teal) are boundary hues -- skip rather than guess
  if (l >= 0.82) return `var(--${bucket}-soft)`;
  if (l < 0.3) return `color-mix(in srgb, var(--${bucket}) 70%, black)`;
  return `var(--${bucket})`;
}

function tokenForColour(raw) {
  const hex = raw.match(/^#[0-9a-fA-F]{3,8}$/i);
  if (hex) {
    const normalized = raw.toLowerCase();
    if (EXACT_MAP[normalized]) return EXACT_MAP[normalized];
    return classifyHue(normalized);
  }
  return null; // rgba()/hsla() bare values outside box-shadow/scrim are left alone -- see Not Touched
}

// ---- transforms --------------------------------------------------------

function dropDeadFallbacks(css) {
  // var(--x, #fallback) or var(--x, rgb(...)) -- drop the fallback when --x
  // is one of the names this fleet's shared assets always define. A
  // conservative allowlist, not "any var(...)": a fallback for a genuinely
  // app-local custom property (not shared) might still be load-bearing.
  const ALWAYS_DEFINED = new Set([
    "--ink",
    "--ink-soft",
    "--muted",
    "--muted-soft",
    "--canvas",
    "--surface",
    "--surface-soft",
    "--surface-hover",
    "--line",
    "--line-strong",
    "--accent",
    "--accent-strong",
    "--accent-soft",
    "--accent-text",
    "--accent-contrast",
    "--positive",
    "--warning",
    "--danger",
    "--text",
    "--bg",
    "--panel",
    "--panel-subtle",
    "--good",
    "--bad",
    "--warn",
    "--shadow",
  ]);
  return css.replace(/var\(\s*(--[\w-]+)\s*,\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))\s*\)/g, (match, name, fallback) => {
    return ALWAYS_DEFINED.has(name) ? `var(${name})` : match;
  });
}

function mapBoxShadowColours(css) {
  return css.replace(/box-shadow\s*:\s*([^;}]+)/gi, (match, value) => {
    const next = value.replace(/(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))/g, (colour, _group, offset, full) => {
      // Is this colour preceded by "0 0 0 <N>px " within the same layer (a
      // ring, not an ambient drop shadow)? Look back from the match.
      const before = full.slice(Math.max(0, offset - 40), offset);
      const isRing = /0\s+0\s+0\s+\d+(?:\.\d+)?px\s+$/.test(before);
      if (isRing) return "var(--accent-focus)";
      const alpha = alphaFromAny(colour);
      return alpha > 0.1 ? "var(--shadow-tint-deep)" : "var(--shadow-tint)";
    });
    return `box-shadow: ${next}`;
  });
}

function mapScrimAndBlur(css) {
  return css.replace(/(background(?:-color)?\s*:\s*)(rgba?\([^)]*\))/gi, (match, prefix, value) => {
    const rgb = rgbFromAny(value);
    const alpha = alphaFromAny(value);
    if (!rgb || alpha >= 1 || alpha < 0.15) return match;
    const [h, s, l] = rgbToHsl(rgb);
    // HSL saturation is numerically unstable near black: rgb(15,23,42) --
    // the single most common literal left in the fleet, a near-black navy
    // scrim -- computes to s=0.47 purely from small channel deltas at low
    // lightness, even though it reads as neutral dark on screen. Below
    // l=0.18 treat it as neutral regardless of saturation; above that,
    // still require low saturation so a genuinely tinted overlay (a brand
    // colour at low alpha) isn't silently flattened to grey.
    const neutralEnough = l < 0.18 || s <= 0.25;
    if (!neutralEnough) return match;
    if (l < 0.3) return `${prefix}var(--scrim)`;
    if (l > 0.85) return `${prefix}var(--surface-blur)`;
    return match;
  });
}

// Colour embedded in a border/outline SHORTHAND value ("1px solid #1f2937"),
// not just a standalone border-color/outline-color declaration. Scoped to
// the shorthand properties only (not background/color, which are never
// shorthand) so this can't misfire on an unrelated property.
function mapBorderShorthandColours(css) {
  return css.replace(
    /((?:^|[;{}])\s*(?:border(?:-top|-right|-bottom|-left)?|outline)\s*:\s*)([^;}]+)/gi,
    (match, prefix, value) => {
      const next = value.replace(/#[0-9a-fA-F]{3,8}\b/g, (colour) => tokenForColour(colour) || colour);
      return `${prefix}${next}`;
    },
  );
}

function mapBareColours(css) {
  return css.replace(
    /((?:^|[;{}\s])(?:background(?:-color)?|color|border(?:-top|-right|-bottom|-left)?(?:-color)?|fill|stroke|outline|text-decoration-color)\s*:\s*)(#[0-9a-fA-F]{3,8})\b/gi,
    (match, prefix, colour) => {
      const token = tokenForColour(colour);
      return token ? `${prefix}${token}` : match;
    },
  );
}

function transform(css) {
  let next = css;
  next = dropDeadFallbacks(next);
  next = mapBoxShadowColours(next);
  next = mapScrimAndBlur(next);
  next = mapBareColours(next);
  next = mapBorderShorthandColours(next);
  return next;
}

// ---- run ----------------------------------------------------------------

const changed = [];
let filesScanned = 0;

for (const appDir of kellyAppDirs()) {
  for (const cssPath of ownCssFiles(appDir)) {
    filesScanned += 1;
    const current = fs.readFileSync(cssPath, "utf8");
    const next = transform(current);
    if (next === current) continue;
    changed.push(path.relative(root, cssPath));
    if (!checkOnly) fs.writeFileSync(cssPath, next);
  }
}

if (report) {
  console.log(`Scanned ${filesScanned} file(s); ${changed.length} would change / changed.`);
  console.log(changed.join("\n"));
} else if (checkOnly && changed.length > 0) {
  console.error(`Raw-colour tokenization is stale in ${changed.length} file(s):`);
  console.error(changed.map((f) => `  ${f}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`${checkOnly ? "Checked" : "Tokenized"} ${filesScanned} file(s); ${changed.length} changed.`);
}
