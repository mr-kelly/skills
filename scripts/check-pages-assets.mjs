#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const site = path.resolve(process.argv[2] || "");
if (!process.argv[2]) {
  console.error("Usage: node scripts/check-pages-assets.mjs <staged-site-directory>");
  process.exit(2);
}

async function walk(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(target)));
    else files.push(target);
  }
  return files;
}

function isLocal(value) {
  return !value.startsWith("data:") && !/^https?:\/\//i.test(value);
}

// Images and recordings are referenced differently, so they are collected
// separately: an <img> carries src / data-shot-*, while a recording lives on a
// data-video-* attribute of whatever opens the player and would be invisible to
// an <img> scan. Script bodies are stripped first — the player builds its
// markup from strings, and those are not references.
function localReferences(html) {
  const images = [];
  const videos = [];
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  for (const image of markup.matchAll(/<img\b[^>]*>/gi)) {
    for (const attribute of image[0].matchAll(/\b(?:src|data-shot-en|data-shot-zh)="([^"]+)"/gi)) {
      if (isLocal(attribute[1])) images.push(attribute[1]);
    }
  }
  for (const attribute of markup.matchAll(/\bdata-video-(?:en|zh)="([^"]+)"/gi)) {
    if (isLocal(attribute[1])) videos.push(attribute[1]);
  }
  return { images, videos };
}

const isLfsPointer = (content) =>
  content.subarray(0, 80).toString("utf8").startsWith("version https://git-lfs.github.com/spec/v1");

// An MP4 opens with a box header — 4 bytes of size, then its type; the first box
// is `ftyp`. Checking for it catches what "is not an LFS pointer" cannot: an HTML
// error page or a truncated download saved under the .mp4 name.
const isMp4 = (content) => content.subarray(4, 8).toString("latin1") === "ftyp";

const files = await walk(site);
const htmlFiles = files.filter((file) => file.endsWith(".html"));
const failures = [];
const checkedImages = new Set();
const checkedVideos = new Set();

async function checkReference(htmlFile, reference, kind, checked) {
  const pathname = decodeURIComponent(reference.split(/[?#]/, 1)[0]);
  const target = path.resolve(path.dirname(htmlFile), pathname);
  const relative = path.relative(site, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    failures.push(`${path.relative(site, htmlFile)}: ${kind} escapes staged site: ${reference}`);
    return;
  }
  if (checked.has(target)) return;
  checked.add(target);
  let content;
  try {
    content = await fs.readFile(target);
  } catch {
    failures.push(`${path.relative(site, htmlFile)}: missing ${kind}: ${reference}`);
    return;
  }
  if (isLfsPointer(content)) {
    failures.push(`${relative}: Git LFS pointer was staged instead of ${kind} content`);
  } else if (kind === "video" && !isMp4(content)) {
    failures.push(`${relative}: is not an MP4 (no ftyp box) — referenced from ${path.relative(site, htmlFile)}`);
  }
}

for (const htmlFile of htmlFiles) {
  const html = await fs.readFile(htmlFile, "utf8");
  if (/https?:\/\/(?:media|raw)\.githubusercontent\.com/i.test(html)) {
    failures.push(`${path.relative(site, htmlFile)}: external GitHub image URL remains`);
  }
  const { images, videos } = localReferences(html);
  for (const reference of images) await checkReference(htmlFile, reference, "image", checkedImages);
  for (const reference of videos) await checkReference(htmlFile, reference, "video", checkedVideos);
}

if (failures.length) {
  console.error(`Pages asset check failed (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `Pages asset check OK: ${htmlFiles.length} HTML files, ${checkedImages.size} local images, ${checkedVideos.size} local videos.`,
);
