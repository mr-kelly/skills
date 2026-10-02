import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBusabaseClient } from "busabase-sdk";

/** @type {{ yes?: boolean, "base-url"?: string, "space-id"?: string, folder?: string }} */
const flags = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i];
  if (key === "--yes") flags.yes = true;
  else if (["--base-url", "--space-id", "--folder"].includes(key)) flags[key.slice(2)] = process.argv[++i];
  else throw new Error(`Unknown option ${key}`);
}
if (!flags["base-url"] || !flags.folder)
  throw new Error(
    "Usage: node scripts/setup-views.mjs --base-url <confirmed Busabase origin> --folder <installed folder node id> [--space-id <id>] [--yes]",
  );
const origin = new URL(flags["base-url"]);
if (origin.username || origin.password || origin.search || origin.hash)
  throw new Error("Use the confirmed origin, without credentials or query parameters.");
const client = createBusabaseClient({
  baseUrl: origin.origin,
  apiKey: process.env.BUSABASE_API_KEY,
  spaceId: flags["space-id"],
});
const detail = await client.nodes.get({ nodeId: flags.folder, type: "folder" });
if (detail.type !== "folder") throw new Error("The selected node is not a Folder.");
if (detail.node.metadata?.appId !== "kelly-wechat-content" || detail.node.metadata?.resourceKey !== "app-root")
  throw new Error("The selected folder is not this template's installed root.");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const declarations = JSON.parse(await readFile(path.join(root, "references", "native-views.json"), "utf8"));
const results = [];
for (const view of declarations) {
  const matches = detail.children.filter(
    (node) =>
      node.type === "base" &&
      node.metadata?.appId === "kelly-wechat-content" &&
      node.metadata?.resourceKey === view.resourceKey,
  );
  if (matches.length !== 1 || !matches[0].baseId)
    throw new Error(`Missing or ambiguous owned Base ${view.resourceKey}`);
  const baseId = matches[0].baseId;
  const existing = await client.bases.listViews({ baseId });
  const same = existing.filter((candidate) => candidate.slug === view.slug);
  if (same.length > 1) throw new Error(`Duplicate view slug ${view.slug}`);
  if (same.length) {
    const match = same[0];
    if (
      match.type !== view.type ||
      (view.type === "kanban" && match.config.stackByFieldSlug !== view.config.stackByFieldSlug) ||
      (view.type === "calendar" && match.config.dateFieldSlug !== view.config.dateFieldSlug)
    )
      throw new Error(`Existing view ${view.slug} differs; do not overwrite it.`);
    results.push({ name: view.name, slug: view.slug, action: "already-present", viewId: match.id });
    continue;
  }
  const input = {
    operation: /** @type {const} */ ("create"),
    baseId,
    slug: view.slug,
    name: view.name,
    description: view.description,
    type: view.type,
    config: view.config,
    message: `Create ${view.name} for this installed editorial workspace`,
  };
  if (!flags.yes) {
    results.push({ name: view.name, action: "would-create", input });
    continue;
  }
  const result = await client.views.changeRequest(input);
  const readback = await client.bases.listViews({ baseId });
  const installed = readback.find((candidate) => candidate.slug === view.slug);
  if (!installed)
    throw new Error(
      `View ${view.name} remains pending; inspect change request ${result.id}. Do not approve it from this script.`,
    );
  results.push({ name: view.name, action: "created", viewId: installed.id });
}
console.log(JSON.stringify({ dryRun: !flags.yes, folderNodeId: detail.node.id, views: results }, null, 2));
