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

function localImageReferences(html) {
  const references = [];
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  for (const image of markup.matchAll(/<img\b[^>]*>/gi)) {
    for (const attribute of image[0].matchAll(/\b(?:src|data-shot-en|data-shot-zh)="([^"]+)"/gi)) {
      const value = attribute[1];
      if (!value.startsWith("data:") && !/^https?:\/\//i.test(value)) references.push(value);
    }
  }
  return references;
}

const files = await walk(site);
const htmlFiles = files.filter((file) => file.endsWith(".html"));
const failures = [];
const checked = new Set();

for (const htmlFile of htmlFiles) {
  const html = await fs.readFile(htmlFile, "utf8");
  if (/https?:\/\/(?:media|raw)\.githubusercontent\.com/i.test(html)) {
    failures.push(`${path.relative(site, htmlFile)}: external GitHub image URL remains`);
  }
  for (const reference of localImageReferences(html)) {
    const pathname = decodeURIComponent(reference.split(/[?#]/, 1)[0]);
    const target = path.resolve(path.dirname(htmlFile), pathname);
    const relative = path.relative(site, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      failures.push(`${path.relative(site, htmlFile)}: image escapes staged site: ${reference}`);
      continue;
    }
    if (checked.has(target)) continue;
    checked.add(target);
    let content;
    try {
      content = await fs.readFile(target);
    } catch {
      failures.push(`${path.relative(site, htmlFile)}: missing image: ${reference}`);
      continue;
    }
    if (content.subarray(0, 80).toString("utf8").startsWith("version https://git-lfs.github.com/spec/v1")) {
      failures.push(`${relative}: Git LFS pointer was staged instead of image content`);
    }
  }
}

if (failures.length) {
  console.error(`Pages asset check failed (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`Pages asset check OK: ${htmlFiles.length} HTML files, ${checked.size} local images.`);
