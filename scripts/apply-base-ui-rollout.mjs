import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const baseUiTemplate = fs.readFileSync(path.join(root, "scripts", "base-ui.css"), "utf8");
const checkOnly = process.argv.includes("--check");

/** @type {Array<[number, string]>} */
const fontTokens = [
  [11, "--text-xs"],
  [12.5, "--text-sm"],
  [13.5, "--text-base"],
  [15.5, "--text-md"],
  [18, "--text-lg"],
  [23, "--text-xl"],
  [30, "--text-2xl"],
  [Number.POSITIVE_INFINITY, "--text-3xl"],
];

function kellyAppDirs() {
  return execFileSync("git", ["ls-files", "skills"], {
    cwd: root,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter((filePath) => filePath.startsWith("skills/kelly-") && filePath.endsWith("/app/index.html"))
    .map((filePath) => path.dirname(path.join(root, filePath)))
    .sort();
}

function mapFontSizes(css) {
  return css.replace(/(font-size\s*:\s*)(\d+(?:\.\d+)?)px/gi, (_match, prefix, rawSize) => {
    const size = Number.parseFloat(rawSize);
    const token = fontTokens.find(([maximum]) => size <= maximum)?.[1];
    return `${prefix}var(${token})`;
  });
}

function mapRadiusValue(value) {
  const numbers = [...value.matchAll(/(\d+(?:\.\d+)?)px/g)].map((match) => Number(match[1]));
  // Zero preserves square/full-bleed edges; 999px/50% preserves pills and circles.
  // Large multi-radius declarations belong to the digital-human illustration,
  // where they describe anatomy rather than component chrome.
  if (numbers.some((number) => number >= 24)) return value;
  return value.replace(/(\d+(?:\.\d+)?)px/g, (_match, rawRadius) => {
    const radius = Number.parseFloat(rawRadius);
    if (radius === 0) return "0";
    if (radius <= 8) return "var(--radius-sm)";
    if (radius <= 12) return "var(--radius-md)";
    return "var(--radius-lg)";
  });
}

function mapRadii(css) {
  return css.replace(/(border-radius\s*:\s*)([^;}]+)/gi, (_match, prefix, value) => {
    return `${prefix}${mapRadiusValue(value)}`;
  });
}

const colorTokens = new Map([
  ["#ffffff", "var(--surface)"],
  ["#fff", "var(--surface)"],
  ["#f7f8fa", "var(--canvas)"],
  ["#f6f7f8", "var(--canvas)"],
  ["#f3f5f7", "var(--canvas)"],
  ["#f1f3f4", "var(--canvas)"],
  ["#f3f4f6", "var(--surface-soft)"],
  ["#f4f5f7", "var(--surface-soft)"],
  ["#eef1ee", "var(--surface-soft)"],
  ["#eef1f5", "var(--surface-soft)"],
  ["#fafbfc", "var(--surface-hover)"],
  ["#fafbfb", "var(--surface-hover)"],
  ["#fbfcfa", "var(--surface-hover)"],
  ["#f8fafc", "var(--surface-hover)"],
  ["#f1f4f8", "var(--accent-soft)"],
  ["#fff1f0", "color-mix(in srgb, var(--danger) 18%, var(--surface))"],
  ["#fff8db", "color-mix(in srgb, var(--warning) 18%, var(--surface))"],
  ["#ecfdf3", "color-mix(in srgb, var(--positive) 18%, var(--surface))"],
  ["#171a1f", "var(--ink)"],
  ["#14181f", "var(--ink)"],
  ["#475569", "var(--ink-soft)"],
  ["#454c57", "var(--ink-soft)"],
  ["#6b7280", "var(--muted)"],
  ["#667168", "var(--muted)"],
  ["#64748b", "var(--muted)"],
  ["#9aa3af", "var(--muted)"],
  ["#e5e7eb", "var(--line)"],
  ["#ebedf0", "var(--line)"],
  ["#d8dde6", "var(--line-strong)"],
  ["#dcdfe4", "var(--line-strong)"],
  ["#9a6700", "var(--warning)"],
  ["#b42318", "var(--danger)"],
  ["#047857", "var(--positive)"],
]);

/** @returns {[number, number, number] | null} */
function rgbFromHex(hex) {
  const raw = hex.slice(1);
  if (raw.length !== 3 && raw.length !== 6) return null;
  const normalized = raw.length === 3 ? [...raw].map((value) => `${value}${value}`).join("") : raw;
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

/** @param {[number, number, number]} rgb */
function statusToken([red, green, blue], soft) {
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const saturation = maximum === 0 ? 0 : (maximum - minimum) / maximum;
  if (saturation < 0.12) return soft ? "var(--surface-soft)" : null;
  if (red > green * 1.15 && red > blue * 1.15) return soft ? "var(--danger-soft)" : "var(--danger)";
  if (green > red * 1.08 && green > blue * 1.08) return soft ? "var(--green-soft)" : "var(--positive)";
  if (red > blue * 1.2 && green > blue * 1.15) return soft ? "var(--amber-soft)" : "var(--warning)";
  return soft ? "var(--blue-soft)" : "var(--accent)";
}

function inferredColorToken(rawColor, property) {
  const rgb = rgbFromHex(rawColor);
  if (!rgb) return null;
  const [red, green, blue] = rgb;
  const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
  if (property.startsWith("background") && luminance >= 0.78) return statusToken(rgb, true) || "var(--surface-soft)";
  if (property.includes("border") && luminance >= 0.62) {
    const status = statusToken(rgb, false);
    return status ? `color-mix(in srgb, ${status} 34%, var(--line))` : "var(--line)";
  }
  if (property === "color") {
    if (luminance >= 0.88) return "var(--accent-contrast)";
    const status = statusToken(rgb, false);
    if (status) return status;
    if (luminance <= 0.22) return "var(--ink)";
    if (luminance <= 0.48) return "var(--ink-soft)";
    return "var(--muted)";
  }
  return null;
}

function mapSurfaceColors(css) {
  let next = css.replace(/(color-scheme\s*:\s*)light(\s*;)/gi, "$1light dark$2");
  next = next.replace(
    /(background(?:-color)?\s*:\s*)rgba\(255\s*,\s*255\s*,\s*255\s*,\s*(0?\.\d+|1(?:\.0+)?)\)/gi,
    (_match, prefix, rawAlpha) => {
      const alpha = Number.parseFloat(rawAlpha);
      const surface =
        alpha >= 0.9
          ? "var(--surface-blur)"
          : `color-mix(in srgb, var(--surface) ${Math.round(alpha * 100)}%, transparent)`;
      return `${prefix}${surface}`;
    },
  );
  next = next.replace(
    /(background(?:-color)?\s*:\s*)rgb\(255\s+255\s+255\s*\/\s*(\d+(?:\.\d+)?)%\)/gi,
    (_match, prefix, rawPercent) => {
      const percent = Number.parseFloat(rawPercent);
      const surface =
        percent >= 90
          ? "var(--surface-blur)"
          : `color-mix(in srgb, var(--surface) ${Math.round(percent)}%, transparent)`;
      return `${prefix}${surface}`;
    },
  );
  next = next.replace(
    /((?:background(?:-color)?|color|border(?:-top|-right|-bottom|-left)?-color)\s*:\s*)(#[0-9a-f]{3,8})\b/gi,
    (match, prefix, rawColor) => {
      const normalized = rawColor.toLowerCase();
      const property = prefix.slice(0, prefix.indexOf(":")).trim().toLowerCase();
      if (property === "color" && (normalized === "#fff" || normalized === "#ffffff")) {
        return `${prefix}var(--accent-contrast)`;
      }
      const token = colorTokens.get(normalized) || inferredColorToken(normalized, property);
      return token ? `${prefix}${token}` : match;
    },
  );
  next = next.replace(/(background(?:-color)?\s*:\s*)white\b/gi, "$1var(--surface)");
  next = next.replace(
    /(border(?:-top|-right|-bottom|-left)?\s*:\s*[^;{}]*?)(#[0-9a-f]{3,8})\b/gi,
    (match, prefix, rawColor) => {
      const token = inferredColorToken(rawColor.toLowerCase(), "border");
      return token ? `${prefix}${token}` : match;
    },
  );
  next = next.replace(/(background(?:-image)?\s*:\s*)([^;}]+)/gi, (_match, prefix, value) => {
    const mapped = value
      .replace(/#[0-9a-f]{3,8}\b/gi, (rawColor) => {
        const normalized = rawColor.toLowerCase();
        const known = colorTokens.get(normalized);
        if (known) return known;
        const rgb = rgbFromHex(normalized);
        if (!rgb) return rawColor;
        const [red, green, blue] = rgb;
        const maximum = Math.max(red, green, blue);
        const minimum = Math.min(red, green, blue);
        const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
        return maximum - minimum < 20 && luminance >= 0.72 ? "var(--surface-soft)" : rawColor;
      })
      .replace(/\bwhite\b/gi, "var(--surface)");
    return `${prefix}${mapped}`;
  });
  return next;
}

function normalizeDemoVisuals(css) {
  const marker = "/* Base UI mobile demo placement */";
  if (css.includes(marker)) return css;
  return `${css.trimEnd()}\n\n${marker}\n@media (max-width: 720px) {\n  .demo-visuals-panel {\n    display: none;\n  }\n}\n`;
}

function normalizeHtml(html, baseUiHref) {
  const lines = html.split("\n");
  const withoutBase = lines.filter((line) => !/base-ui\.css/i.test(line));
  const accentLines = withoutBase.filter((line) => /accent-theme\.css/i.test(line));
  const withoutThemes = withoutBase.filter((line) => !/accent-theme\.css/i.test(line));
  const firstStylesheet = withoutThemes.findIndex(
    (line) => /<link\b/i.test(line) && /rel=["']stylesheet["']/i.test(line),
  );
  if (firstStylesheet < 0) throw new Error("index.html has no stylesheet link");

  const indent = withoutThemes[firstStylesheet].match(/^\s*/)?.[0] ?? "";
  withoutThemes.splice(firstStylesheet, 0, `${indent}<link rel="stylesheet" href="${baseUiHref}">`);

  if (accentLines.length > 0) {
    const lastStylesheet = withoutThemes.findLastIndex(
      (line) => /<link\b/i.test(line) && /rel=["']stylesheet["']/i.test(line),
    );
    withoutThemes.splice(lastStylesheet + 1, 0, accentLines[0]);
  }

  let next = withoutThemes.join("\n");
  const colorScheme = /<meta\s+name=["']color-scheme["'][^>]*>/i;
  if (colorScheme.test(next)) {
    next = next.replace(colorScheme, '<meta name="color-scheme" content="light dark">');
  } else {
    next = next.replace(
      /(<meta\s+name=["']viewport["'][^>]*>)/i,
      '$1\n    <meta name="color-scheme" content="light dark">',
    );
  }
  return next;
}

function normalizeLayerOrder(css, filePath) {
  if (!/@layer\s+[^;]+;/i.test(css)) {
    throw new Error(`${path.relative(root, filePath)} has no cascade layer order`);
  }
  return css.replace(/@layer\s+([^;]+);/i, (_match, order) => {
    const layers = order
      .split(",")
      .map((layer) => layer.trim())
      .filter((layer) => layer && layer !== "base-ui");
    return `@layer base-ui, ${layers.join(", ")};`;
  });
}

function appCssFiles(appDir) {
  const rootCss = fs
    .readdirSync(appDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".css") &&
        entry.name !== "base-ui.css" &&
        entry.name !== "accent-theme.css",
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
            entry.name !== "layers.css" &&
            entry.name !== "base-ui.css",
        )
        .map((entry) => path.join(stylesDir, entry.name))
    : [];
  const files = [...rootCss, ...layeredCss].sort();
  if (files.length === 0) throw new Error(`${path.relative(root, appDir)} has no app CSS`);
  return files;
}

const changed = [];
const appDirs = kellyAppDirs();

function updateFile(filePath, next) {
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
  if (current === next) return;
  changed.push(path.relative(root, filePath));
  if (!checkOnly) fs.writeFileSync(filePath, next);
}

for (const appDir of appDirs) {
  const layersPath = path.join(appDir, "styles", "layers.css");
  const isLayered = fs.existsSync(layersPath);
  const baseUiPath = isLayered ? path.join(appDir, "styles", "base-ui.css") : path.join(appDir, "base-ui.css");
  const staleBaseUiPath = isLayered ? path.join(appDir, "base-ui.css") : path.join(appDir, "styles", "base-ui.css");
  updateFile(baseUiPath, baseUiTemplate);
  if (fs.existsSync(staleBaseUiPath)) {
    changed.push(path.relative(root, staleBaseUiPath));
    if (!checkOnly) fs.unlinkSync(staleBaseUiPath);
  }

  const indexPath = path.join(appDir, "index.html");
  updateFile(
    indexPath,
    normalizeHtml(fs.readFileSync(indexPath, "utf8"), isLayered ? "./styles/base-ui.css" : "./base-ui.css"),
  );

  if (isLayered) {
    updateFile(layersPath, normalizeLayerOrder(fs.readFileSync(layersPath, "utf8"), layersPath));
  }

  for (const cssPath of appCssFiles(appDir)) {
    const css = fs.readFileSync(cssPath, "utf8");
    const mapped = mapSurfaceColors(mapRadii(mapFontSizes(css)));
    updateFile(cssPath, path.basename(cssPath) === "demo-visuals.css" ? normalizeDemoVisuals(mapped) : mapped);
  }
}

const digest = crypto.createHash("sha256").update(baseUiTemplate).digest("hex");
if (checkOnly && changed.length > 0) {
  console.error(`Base UI rollout is stale in ${changed.length} file(s):`);
  console.error(changed.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`${checkOnly ? "Checked" : "Updated"} Base UI rollout for ${appDirs.length} apps.`);
  console.log(`base-ui.css sha256: ${digest}`);
  if (changed.length > 0) console.log(changed.join("\n"));
}
