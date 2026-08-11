import assert from "node:assert/strict";
import test from "node:test";

import { appConfig } from "../app/js/config.js";
import {
  buildProvisionOperations,
  provisionDeclaredResources,
  resolveProvisionedFolder,
} from "../app/js/resource-provisioning.js";

test("builds one Folder and every declared Base in a single declared structure change", () => {
  const operations = buildProvisionOperations(appConfig, null, appConfig.bases);
  assert.equal(operations.length, appConfig.bases.length + 1);
  assert.equal(operations[0].nodeType, "folder");
  assert.equal(operations[0].ref, "app-root");
  const firstBase = operations[1];
  assert.ok("parentNodeRef" in firstBase && "fields" in firstBase);
  assert.equal(firstBase.parentNodeRef, "app-root");
  assert.equal(firstBase.fields[0].required, true);
  assert.equal(firstBase.metadata.appId, "kelly-jobhunt");
  assert.ok(
    operations
      .slice(1)
      .every(
        (operation) => "fields" in operation && operation.fields.every((field) => /^[a-z0-9-]+$/.test(field.slug)),
      ),
  );
});

test("accepts only marked resources under the declared Folder", () => {
  const folder = {
    node: {
      id: "nod_root",
      type: "folder",
      slug: appConfig.folder.slug,
      metadata: { appId: appConfig.appId, resourceKey: "app-root", schemaVersion: appConfig.schemaVersion },
    },
    children: appConfig.bases.map((base) => ({
      id: `nod_${base.key}`,
      baseId: `bse_${base.key}`,
      type: "base",
      slug: base.slug,
      metadata: { appId: appConfig.appId, resourceKey: base.key, schemaVersion: appConfig.schemaVersion },
    })),
  };
  const resolved = resolveProvisionedFolder(folder, appConfig);
  assert.equal(resolved.missing.length, 0);
  assert.equal(resolved.bases.length, appConfig.bases.length);
  assert.equal(resolved.repairs.length, 0);
  assert.equal(resolved.bases[0].baseId, "bse_profile");
});

test("refuses to reuse an unowned same-slug Folder", () => {
  assert.throws(
    () =>
      resolveProvisionedFolder(
        {
          node: { id: "nod_other", type: "folder", slug: appConfig.folder.slug, metadata: {} },
          children: [],
        },
        appConfig,
      ),
    /SETUP_CONFLICT/,
  );
});

test("submits the declared structure once and reads materialized ids back", async () => {
  const materialized = {
    node: {
      id: "nod_root",
      type: "folder",
      slug: appConfig.folder.slug,
      metadata: { appId: appConfig.appId, resourceKey: "app-root", schemaVersion: appConfig.schemaVersion },
    },
    children: appConfig.bases.map((base) => ({
      id: `nod_${base.key}`,
      baseId: `bse_${base.key}`,
      type: "base",
      slug: base.slug,
      metadata: { appId: appConfig.appId, resourceKey: base.key, schemaVersion: appConfig.schemaVersion },
    })),
  };
  let reads = 0;
  const depths = [];
  const submissions = [];
  const client = {
    nodes: {
      list: async (options) => {
        depths.push(options.depth);
        reads += 1;
        return [
          {
            id: "nod_root_system",
            type: "folder",
            slug: "root",
            children: reads === 1 ? [] : [materialized.node],
          },
        ];
      },
      createChangeRequest: async (payload) => {
        submissions.push(payload);
        return { id: "crq_setup", status: "merged" };
      },
    },
    folders: {
      get: async () => materialized,
    },
  };

  const result = await provisionDeclaredResources(client, appConfig);
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].operations.length, appConfig.bases.length + 1);
  assert.equal(submissions[0].autoMerge, true);
  assert.equal(result.bases.length, appConfig.bases.length);
  assert.equal(result.bases[0].baseId, "bse_profile");
  assert.deepEqual(depths, [2, 2]);
});

const legacyFolder = () => ({
  node: {
    id: "nod_legacy_root",
    type: "folder",
    slug: appConfig.folder.slug,
    name: appConfig.folder.name,
    description: appConfig.folder.description,
    metadata: {},
  },
  children: appConfig.bases.map((base) => ({
    id: `nod_${base.key}`,
    baseId: `bse_${base.key}`,
    type: "base",
    slug: base.slug,
    name: base.name,
    description: base.description,
    metadata: {},
  })),
});

const baseDetail = (base, fieldOverride = {}) => ({
  id: `bse_${base.key}`,
  nodeId: `nod_${base.key}`,
  slug: base.slug,
  name: base.name,
  description: base.description,
  fields: base.fields.map((field, index) => (index === 0 ? { ...field, ...fieldOverride } : { ...field })),
});

test("lazily repairs an exact legacy resource set without creating another structure CR", async () => {
  const materialized = legacyFolder();
  const metadataUpdates = [];
  let structureSubmissions = 0;
  const client = {
    nodes: {
      list: async () => [{ id: "nod_system_root", type: "folder", slug: "root", children: [materialized.node] }],
      createChangeRequest: async () => {
        structureSubmissions += 1;
        return { id: "unexpected", status: "merged" };
      },
      updateMetadata: async ({ nodeId, metadata }) => {
        metadataUpdates.push({ nodeId, metadata });
        const node =
          nodeId === materialized.node.id
            ? materialized.node
            : materialized.children.find((child) => child.id === nodeId);
        node.metadata = { ...node.metadata, ...metadata };
        return node;
      },
    },
    folders: { get: async () => materialized },
    bases: {
      get: async ({ baseId }) => {
        const base = appConfig.bases.find((item) => `bse_${item.key}` === baseId);
        return baseDetail(base);
      },
    },
  };

  const result = await provisionDeclaredResources(client, appConfig);
  assert.equal(structureSubmissions, 0);
  assert.equal(metadataUpdates.length, appConfig.bases.length + 1);
  assert.deepEqual(
    metadataUpdates.map((update) => update.metadata.resourceKey),
    ["app-root", ...appConfig.bases.map((base) => base.key)],
  );
  assert.equal(result.repairs.length, 0);
  assert.equal(result.bases.length, appConfig.bases.length);
});

test("does not repair ownership when a legacy Base field fingerprint differs", async () => {
  const materialized = legacyFolder();
  let metadataUpdates = 0;
  const client = {
    nodes: {
      list: async () => [{ id: "nod_system_root", type: "folder", slug: "root", children: [materialized.node] }],
      updateMetadata: async () => {
        metadataUpdates += 1;
      },
    },
    folders: { get: async () => materialized },
    bases: {
      get: async ({ baseId }) => {
        const base = appConfig.bases.find((item) => `bse_${item.key}` === baseId);
        return baseDetail(base, base.key === "profile" ? { type: "number" } : {});
      },
    },
  };

  await assert.rejects(() => provisionDeclaredResources(client, appConfig), /SETUP_CONFLICT/);
  assert.equal(metadataUpdates, 0);
});

test("uses a verified legacy fingerprint when the old Busabase API has no metadata endpoint", async () => {
  const materialized = legacyFolder();
  let metadataAttempts = 0;
  const client = {
    nodes: {
      list: async () => [{ id: "nod_system_root", type: "folder", slug: "root", children: [materialized.node] }],
      updateMetadata: async () => {
        metadataAttempts += 1;
        throw Object.assign(new Error("Not found"), { status: 404 });
      },
    },
    folders: { get: async () => materialized },
    bases: {
      get: async ({ baseId }) => {
        const base = appConfig.bases.find((item) => `bse_${item.key}` === baseId);
        return baseDetail(base);
      },
    },
  };

  const result = await provisionDeclaredResources(client, appConfig);
  assert.equal(metadataAttempts, 1);
  assert.equal(result.repairs.length, 0);
  assert.equal(result.compatibilityMode, "verified-legacy-fingerprint");
  assert.equal(result.bases.length, appConfig.bases.length);
});
