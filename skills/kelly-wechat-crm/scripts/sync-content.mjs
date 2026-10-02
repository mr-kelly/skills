#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appConfig } from "../content/kelly-wechat-crm-app/app/js/config.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const stale = [];
const nodePrompts = JSON.parse(await readFile(path.join(root, "references", "node-prompts.json"), "utf8"));

const emit = async (relativePath, contents) => {
  const target = path.join(root, relativePath);
  if (check) {
    const current = await readFile(target, "utf8").catch(() => null);
    if (current !== contents) stale.push(relativePath);
    return;
  }
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
};

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const ndjson = (records) => records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : "");

for (const [position, base] of appConfig.bases.entries()) {
  await emit(
    `content/${base.key}/base.json`,
    json({
      name: base.name,
      description: base.description,
      position,
      agentPrompts: nodePrompts[base.key],
      fields: base.fields.map((field, fieldPosition) => ({
        slug: field.slug,
        name: field.name,
        type: field.type,
        required: Boolean(field.required),
        position: fieldPosition,
        options: {
          ...(field.options || {}),
          ...(appConfig.templateRelations?.[`${base.key}.${field.slug}`]
            ? { targetBaseSlug: appConfig.templateRelations[`${base.key}.${field.slug}`] }
            : {}),
        },
      })),
      views: [],
    }),
  );
  await emit(`content/${base.key}/records.ndjson`, ndjson(base.sampleRecords || []));
}

await emit(
  "content/_folder.json",
  json({ name: appConfig.folder.name, description: appConfig.folder.description, agentPrompts: nodePrompts.folder }),
);

if (check && stale.length) {
  console.error(`content/ is out of date with config.js:\n${stale.map((file) => `  ${file}`).join("\n")}`);
  process.exit(1);
}
console.log(check ? "content/ is up to date." : "content/ regenerated from config.js.");
