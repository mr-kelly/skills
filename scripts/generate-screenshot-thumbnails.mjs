#!/usr/bin/env node
// Generate lightweight WebP thumbnails for the GitHub Pages skill gallery.
//
// Usage:
//   node scripts/generate-screenshot-thumbnails.mjs
//   node scripts/generate-screenshot-thumbnails.mjs --skill kelly-email

import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const THUMB_WIDTH = 720;
const THUMB_QUALITY = 78;

function parseArgs(argv) {
  const args = {
    skills: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--skill") args.skills.push(argv[++i]);
    else if (arg.startsWith("--skill=")) args.skills.push(arg.slice("--skill=".length));
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
  node scripts/generate-screenshot-thumbnails.mjs
  node scripts/generate-screenshot-thumbnails.mjs --skill kelly-email

Options:
  --skill   Limit to one skill folder under skills/. May be repeated.
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
  const skillDirs = args.skills.length
    ? args.skills.map((name) => path.join(ROOT, "skills", name, "assets", "screenshots"))
    : [path.join(ROOT, "skills")];
  const files = [];
  for (const dir of skillDirs) files.push(...(await walk(dir)));
  return files
    .filter((file) => /\/assets\/screenshots\/[^/]+\.webp$/i.test(file))
    .filter((file) => !/\/thumbs\//i.test(file))
    .sort();
}

function thumbPath(file) {
  return path.join(path.dirname(file), "thumbs", path.basename(file).replace(/\.(png|webp)$/i, ".webp"));
}

async function generateOne(file) {
  const output = thumbPath(file);
  await mkdir(path.dirname(output), { recursive: true });
  await sharp(file)
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: THUMB_QUALITY, effort: 4 })
    .toBuffer()
    .then((buffer) => writeFile(output, buffer));
  return path.relative(ROOT, output);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = await screenshotPaths(args);
  if (!files.length) {
    console.log("No WebP screenshot files found.");
    return;
  }

  for (const file of files) {
    console.log(`thumb ${await generateOne(file)}`);
  }
  console.log(`Generated ${files.length} screenshot thumbnails.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
