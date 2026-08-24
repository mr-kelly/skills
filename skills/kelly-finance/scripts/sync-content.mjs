#!/usr/bin/env node
/**
 * Regenerate `content/` from the app's own declaration, or check it is current.
 *
 * The app declaration is canonical. Package Base and node sidecars are derived
 * from it so template installs and self-provisioning cannot drift.
 *
 *   node scripts/sync-content.mjs
 *   node scripts/sync-content.mjs --check
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");

const { appConfig } = await import(path.join(root, "content/kelly-finance-app/app/js/config.js"));

const stale = [];

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

let position = 0;
for (const base of appConfig.bases) {
  await emit(
    `content/${base.key}/base.json`,
    json({
      name: base.name,
      description: base.description ?? "",
      position: position++,
      fields: (base.fields ?? []).map((field, index) => ({
        slug: field.slug,
        name: field.name,
        type: field.type,
        required: Boolean(field.required),
        position: index,
        options: {
          ...(field.options ?? {}),
          ...(appConfig.templateRelations?.[`${base.key}.${field.slug}`]
            ? { targetBaseSlug: appConfig.templateRelations[`${base.key}.${field.slug}`] }
            : {}),
        },
      })),
      views: [],
    }),
  );
}

if (appConfig.drive) {
  await emit(
    `content/${appConfig.airApp.slug.replace(/-app$/, "")}-files/_node.json`,
    json({
      type: "drive",
      name: appConfig.drive.name,
      description: appConfig.drive.description ?? "",
      position: position++,
    }),
  );
}

await emit(
  "content/_folder.json",
  json({ name: appConfig.folder.name, description: appConfig.folder.description ?? "" }),
);

if (check && stale.length > 0) {
  console.error(
    `content/ is out of date with config.js:\n${stale.map((item) => `  ${item}`).join("\n")}\n\nRun: node scripts/sync-content.mjs`,
  );
  process.exit(1);
}
console.log(check ? "content/ is up to date." : "content/ regenerated from config.js.");
