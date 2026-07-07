#!/usr/bin/env node
// Wrap skill screenshots in a polished device shell for README and gallery use.
//
// Desktop/tablet-ish images get a macOS-style window: title bar, traffic lights,
// rounded corners, border, and soft shadow. Tall phone screenshots get a phone
// bezel. The script is idempotent: framed outputs carry a tiny metadata marker
// and are skipped unless --force is passed.
//
// Usage:
//   node scripts/frame-screenshots.mjs --dry-run
//   node scripts/frame-screenshots.mjs
//   node scripts/frame-screenshots.mjs --skill kelly-legal-casebase-ingest --force
//   node scripts/frame-screenshots.mjs --path skills/foo/assets/screenshots/overview.png
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARKER = "kelly-skills-framed-v1";
const DEFAULT_WIDTH = 1440;
const MAX_OUTPUT_WIDTH = 1800;
const DEFAULT_ACCENT = "#334155";

const DESKTOP_TOKENS = {
  page: "#f8fafc",
  barFill: "#ffffff",
  barEdge: "#e2e8f0",
  border: "#d8dee8",
  titleInk: "#334155",
  shadow: "#0f172a",
  dots: ["#ff5f57", "#febc2e", "#28c840"],
};

const PHONE_TOKENS = {
  bezel: "#111827",
  ring: "#334155",
};

function parseArgs(argv) {
  const args = {
    dryRun: false,
    force: false,
    skills: [],
    paths: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--skill") args.skills.push(argv[++i]);
    else if (arg.startsWith("--skill=")) args.skills.push(arg.slice("--skill=".length));
    else if (arg === "--path") args.paths.push(argv[++i]);
    else if (arg.startsWith("--path=")) args.paths.push(arg.slice("--path=".length));
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/frame-screenshots.mjs [--dry-run] [--force]
  node scripts/frame-screenshots.mjs --skill kelly-legal-casebase-ingest
  node scripts/frame-screenshots.mjs --path skills/foo/assets/screenshots/overview.png

Options:
  --dry-run   Show which files would be framed without writing.
  --force     Re-frame screenshots even when they already have the metadata marker.
  --skill     Limit to one skill folder under skills/. May be repeated.
  --path      Limit to one screenshot path. May be repeated.
`);
}

async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

async function screenshotPaths(args) {
  if (args.paths.length) {
    return args.paths.map((p) => path.resolve(ROOT, p)).filter((p) => p.toLowerCase().endsWith(".png"));
  }

  const skillDirs = args.skills.length
    ? args.skills.map((name) => path.join(ROOT, "skills", name, "assets", "screenshots"))
    : [path.join(ROOT, "skills")];
  const files = [];
  for (const dir of skillDirs) files.push(...(await walk(dir)));
  return files
    .filter((file) => /\/assets\/screenshots\/[^/]+\.png$/i.test(file))
    .filter((file) => !/\.original\./i.test(file))
    .sort();
}

async function alreadyFramed(file) {
  const metadata = await sharp(file).metadata();
  return (
    metadata.exif?.toString("utf8").includes(MARKER) ||
    metadata.comments?.some((comment) => `${comment.keyword ?? ""}${comment.text ?? ""}`.includes(MARKER))
  );
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function skillNameFor(file) {
  const rel = path.relative(ROOT, file);
  const parts = rel.split(path.sep);
  return parts[0] === "skills" ? parts[1] : "";
}

function normalizeHexColor(value) {
  const match = String(value ?? "")
    .trim()
    .match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!match) return "";
  const hex = match[1];
  if (hex.length === 3) {
    return `#${hex
      .split("")
      .map((char) => `${char}${char}`)
      .join("")}`.toLowerCase();
  }
  return `#${hex.slice(0, 6)}`.toLowerCase();
}

async function skillAccentFor(file) {
  const skill = skillNameFor(file);
  if (!skill) return DEFAULT_ACCENT;

  const cssPath = path.join(ROOT, "skills", skill, "app", "styles.css");
  const css = await readFile(cssPath, "utf8").catch(() => "");
  const accent = css.match(/--accent:\s*(#[0-9a-f]{3,8})\s*;/i)?.[1];
  return normalizeHexColor(accent) || DEFAULT_ACCENT;
}

function titleFor(file) {
  const skill = skillNameFor(file).replace(/^kelly-/, "");
  const base = path.basename(file, ".png").replace(/-zh-CN$/, "");
  const title = `${skill} — ${base}`.replace(/-/g, " ");
  return title.replace(/\b\w/g, (m) => m.toUpperCase());
}

async function normalizeInput(file) {
  const input = sharp(file).rotate();
  const meta = await input.metadata();
  if (!meta.width || !meta.height) throw new Error(`Cannot read dimensions for ${file}`);
  const targetWidth = Math.min(meta.width, DEFAULT_WIDTH);
  const buffer = await input.resize({ width: targetWidth, withoutEnlargement: true }).png().toBuffer();
  const resized = await sharp(buffer).metadata();
  return {
    buffer,
    width: resized.width || targetWidth,
    height: resized.height || Math.round((meta.height / meta.width) * targetWidth),
  };
}

function desktopFrameSvg({ imageBase64, width, height, title, accent }) {
  const outWidth = Math.min(MAX_OUTPUT_WIDTH, Math.round(width * 1.06));
  const margin = Math.max(22, Math.round(outWidth * 0.025));
  const frameWidth = outWidth - margin * 2;
  const scale = frameWidth / width;
  const frameHeight = Math.round(height * scale);
  const bar = Math.max(36, Math.round(frameWidth * 0.035));
  const radius = Math.max(14, Math.round(frameWidth * 0.013));
  const dotR = Math.max(5, Math.round(bar * 0.15));
  const dotX0 = margin + Math.round(bar * 0.62);
  const dotY = margin + Math.round(bar / 2);
  const dotGap = Math.round(dotR * 3.4);
  const winH = bar + frameHeight;
  const outHeight = winH + margin * 2;
  const shotY = margin + bar;

  const dotEls = DESKTOP_TOKENS.dots
    .map((color, i) => `<circle cx="${dotX0 + i * dotGap}" cy="${dotY}" r="${dotR}" fill="${color}"/>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${outWidth}" height="${outHeight}" viewBox="0 0 ${outWidth} ${outHeight}">
  <rect width="${outWidth}" height="${outHeight}" fill="${DESKTOP_TOKENS.page}"/>
  <defs>
    <clipPath id="win"><rect x="${margin}" y="${margin}" width="${frameWidth}" height="${winH}" rx="${radius}" ry="${radius}"/></clipPath>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="${Math.round(frameWidth * 0.012)}"/>
      <feOffset dy="${Math.round(frameWidth * 0.008)}" result="off"/>
      <feFlood flood-color="${DESKTOP_TOKENS.shadow}" flood-opacity="0.16"/>
      <feComposite in2="off" operator="in"/>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <g filter="url(#shadow)">
    <rect x="${margin}" y="${margin}" width="${frameWidth}" height="${winH}" rx="${radius}" ry="${radius}" fill="${DESKTOP_TOKENS.barFill}"/>
  </g>
  <g clip-path="url(#win)">
    <rect x="${margin}" y="${margin}" width="${frameWidth}" height="${bar}" fill="${DESKTOP_TOKENS.barFill}"/>
    <rect x="${margin}" y="${margin + bar - 1}" width="${frameWidth}" height="1" fill="${DESKTOP_TOKENS.barEdge}" opacity="0.72"/>
    ${dotEls}
    <text x="${margin + frameWidth / 2}" y="${margin + bar / 2}" text-anchor="middle" dominant-baseline="central" font-family="-apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif" font-size="${Math.round(bar * 0.38)}" font-weight="600" fill="${DESKTOP_TOKENS.titleInk}">${xmlEscape(title)}</text>
    <image x="${margin}" y="${shotY}" width="${frameWidth}" height="${frameHeight}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${imageBase64}"/>
  </g>
  <rect x="${margin + 0.5}" y="${margin + 0.5}" width="${frameWidth - 1}" height="${winH - 1}" rx="${radius}" ry="${radius}" fill="none" stroke="${DESKTOP_TOKENS.border}" stroke-width="1.5"/>
</svg>`;
}

function phoneFrameSvg({ imageBase64, width, height, accent }) {
  const outWidth = Math.min(1080, Math.max(640, width + 96));
  const pad = Math.round(outWidth * 0.04);
  const screenWidth = outWidth - pad * 2;
  const screenHeight = Math.round(screenWidth * (height / width));
  const outHeight = screenHeight + pad * 2;
  const rOuter = Math.round(outWidth * 0.12);
  const rScreen = Math.round(screenWidth * 0.075);
  const islandWidth = Math.round(screenWidth * 0.28);
  const islandHeight = Math.max(18, Math.round(pad * 0.62));
  const islandX = pad + (screenWidth - islandWidth) / 2;
  const islandY = pad + Math.round(pad * 0.45);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${outWidth}" height="${outHeight}" viewBox="0 0 ${outWidth} ${outHeight}">
  <defs>
    <clipPath id="screen"><rect x="${pad}" y="${pad}" width="${screenWidth}" height="${screenHeight}" rx="${rScreen}" ry="${rScreen}"/></clipPath>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="${Math.round(outWidth * 0.018)}"/>
      <feOffset dy="${Math.round(outWidth * 0.012)}" result="off"/>
      <feFlood flood-color="${DESKTOP_TOKENS.shadow}" flood-opacity="0.2"/>
      <feComposite in2="off" operator="in"/>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="${outWidth}" height="${outHeight}" fill="${DESKTOP_TOKENS.page}"/>
  <rect x="1" y="1" width="${outWidth - 2}" height="${outHeight - 2}" rx="${rOuter}" ry="${rOuter}" fill="${PHONE_TOKENS.bezel}" stroke="${PHONE_TOKENS.ring}" stroke-width="2" filter="url(#shadow)"/>
  <rect x="3" y="3" width="${outWidth - 6}" height="${outHeight - 6}" rx="${rOuter - 2}" ry="${rOuter - 2}" fill="none" stroke="${xmlEscape(accent)}" stroke-width="3" opacity="0.42"/>
  <image x="${pad}" y="${pad}" width="${screenWidth}" height="${screenHeight}" clip-path="url(#screen)" preserveAspectRatio="xMidYMid slice" href="data:image/png;base64,${imageBase64}"/>
  <rect x="${islandX}" y="${islandY}" width="${islandWidth}" height="${islandHeight}" rx="${islandHeight / 2}" ry="${islandHeight / 2}" fill="#000"/>
</svg>`;
}

async function frameOne(file, args) {
  const rel = path.relative(ROOT, file);
  if (!args.force && (await alreadyFramed(file))) {
    return { rel, status: "skip", reason: "already framed" };
  }

  const input = await normalizeInput(file);
  const accent = await skillAccentFor(file);
  const isPhone = input.height / input.width > 1.35;
  const svg = isPhone
    ? phoneFrameSvg({ imageBase64: input.buffer.toString("base64"), ...input, accent })
    : desktopFrameSvg({ imageBase64: input.buffer.toString("base64"), ...input, title: titleFor(file), accent });

  if (!args.dryRun) {
    const framed = await sharp(Buffer.from(svg), { density: 96 })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .withMetadata({ exif: { IFD0: { ImageDescription: MARKER } } })
      .toBuffer();
    await writeFile(file, framed);
  }

  return {
    rel,
    status: args.dryRun ? "would frame" : "framed",
    kind: isPhone ? "phone" : "mac",
    size: `${input.width}x${input.height}`,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = await screenshotPaths(args);
  if (!files.length) {
    console.log("No screenshot files found.");
    return;
  }

  let framed = 0;
  let skipped = 0;
  for (const file of files) {
    const result = await frameOne(file, args);
    if (result.status === "skip") skipped += 1;
    else framed += 1;
    const extra = result.kind ? ` ${result.kind} ${result.size}` : ` ${result.reason}`;
    console.log(`${result.status.padEnd(12)} ${result.rel}${extra}`);
  }
  console.log(`\n${args.dryRun ? "Would frame" : "Framed"}: ${framed}; skipped: ${skipped}; total: ${files.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
