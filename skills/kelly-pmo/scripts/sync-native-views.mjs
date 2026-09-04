#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { createBusabaseClient } from "busabase-sdk";
import { appConfig } from "../content/kelly-pmo-app/app/js/config.js";

const canonical = (value) => JSON.stringify(value ?? {});
const containsDeclaredConfig = (current, declared) =>
  Object.entries(declared ?? {}).every(([key, value]) => canonical(current?.[key]) === canonical(value));

export async function planNativeViews(client) {
  const changes = [];
  const tree = await client.nodes.list({ depth: 2 });
  const flatten = (nodes) => nodes.flatMap((node) => [node, ...flatten(node.children || [])]);
  const basesBySlug = new Map(
    flatten(tree)
      .filter((node) => node.type === "base")
      .map((node) => [node.slug, node]),
  );
  for (const declaredBase of appConfig.bases) {
    const materializedBase = basesBySlug.get(declaredBase.slug);
    if (!materializedBase?.baseId) throw new Error(`Base not ready: ${declaredBase.slug}`);
    const currentViews = await client.bases.listViews({ baseId: materializedBase.baseId, status: "active" });
    const bySlug = new Map(currentViews.map((item) => [item.slug, item]));
    for (const declaredView of declaredBase.views ?? []) {
      const current = bySlug.get(declaredView.slug);
      if (!current) {
        changes.push({ action: "create", base: declaredBase, view: declaredView, baseId: materializedBase.baseId });
      } else if (
        current.name !== declaredView.name ||
        current.description !== declaredView.description ||
        current.type !== declaredView.type ||
        !containsDeclaredConfig(current.config, declaredView.config)
      ) {
        changes.push({ action: "update", base: declaredBase, view: declaredView, viewId: current.id });
      }
    }
  }
  return changes;
}

export async function syncNativeViews(client, { apply = false, check = false, log = console } = {}) {
  const changes = await planNativeViews(client);
  if (!changes.length) {
    log.log("Kelly PMO native views are up to date.");
    return { changes: 0, applied: 0 };
  }
  for (const change of changes) {
    log.log(`${change.action.padEnd(6)} ${change.base.key}/${change.view.slug} (${change.view.type})`);
  }
  if (check) throw new Error(`${changes.length} native view change(s) are required.`);
  if (!apply) {
    log.log(`Dry run only. Re-run with --apply to materialize ${changes.length} native view change(s).`);
    return { changes: changes.length, applied: 0 };
  }
  for (const change of changes) {
    const common = {
      name: change.view.name,
      description: change.view.description,
      type: change.view.type,
      config: change.view.config,
      message: `Sync Kelly PMO ${change.view.name}`,
      submittedBy: appConfig.appId,
      autoMerge: true,
    };
    const result =
      change.action === "create"
        ? await client.views.changeRequest({
            operation: "create",
            baseId: change.baseId,
            slug: change.view.slug,
            ...common,
          })
        : await client.views.changeRequest({ operation: "update", viewId: change.viewId, ...common });
    if (!result.materialized) {
      throw new Error(`View ${change.base.key}/${change.view.slug} remained pending as ChangeRequest ${result.id}.`);
    }
  }
  log.log(`Materialized ${changes.length} Kelly PMO native view change(s).`);
  return { changes: changes.length, applied: changes.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const required = (name) => {
    const value = process.env[name];
    if (!value) throw new Error(`Missing ${name}; native view sync needs an explicit trusted Busabase connection.`);
    return value;
  };
  const client = createBusabaseClient({
    baseUrl: required("BUSABASE_BASE_URL"),
    apiKey: process.env.BUSABASE_API_KEY || undefined,
    spaceId: process.env.BUSABASE_SPACE_ID || undefined,
  });
  await syncNativeViews(client, {
    apply: process.argv.includes("--apply"),
    check: process.argv.includes("--check"),
  });
}
