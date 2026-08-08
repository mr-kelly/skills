#!/usr/bin/env node
// Rewrites the plugin `tags` in .claude-plugin/marketplace.json from the taxonomy in each
// SKILL.md, so the marketplace listing is never a third hand-maintained list.
// Run after adding a skill or changing a category:  node scripts/sync-marketplace.mjs
// `node scripts/build-site.mjs` fails when this file is stale.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveMarketplaceTags, listSkillDirs, readSkillMeta } from "./lib/skill-taxonomy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MANIFEST = path.join(ROOT, ".claude-plugin", "marketplace.json");

export async function expectedTags() {
  const dirs = await listSkillDirs(ROOT);
  const metas = await Promise.all(dirs.map((d) => readSkillMeta(ROOT, d)));
  return deriveMarketplaceTags(metas);
}

async function main() {
  const raw = await fs.readFile(MANIFEST, "utf8");
  const manifest = JSON.parse(raw);
  const tags = await expectedTags();

  let changed = false;
  for (const plugin of manifest.plugins || []) {
    if (JSON.stringify(plugin.tags) !== JSON.stringify(tags)) {
      plugin.tags = tags;
      changed = true;
    }
  }
  if (!changed) {
    console.log("marketplace.json already in sync");
    return;
  }
  await fs.writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`marketplace.json tags updated (${tags.length} tags)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
