import assert from "node:assert/strict";
import test from "node:test";

import { appConfig } from "../app/js/config.js";
import {
  buildProvisionOperations,
  inspectProvisionedResources,
  provisionDeclaredResources,
  resolveProvisionedFolder,
} from "../app/vendor/busabase-airapp.js";

const unmaterializedConfig = {
  ...appConfig,
  folder: { ...appConfig.folder, nodeId: "" },
  bases: appConfig.bases.map((base) => ({ ...base, nodeId: "", baseId: "" })),
};

test("builds one Folder and every declared Base in a single declared structure change", () => {
  const operations = buildProvisionOperations(appConfig, null, appConfig.bases);
  assert.equal(operations.length, appConfig.bases.length + 1);
  assert.equal(operations[0].nodeType, "folder");
  assert.equal(operations[0].ref, "app-root");
  const firstBase = operations[1];
  assert.ok("parentNodeRef" in firstBase && "fields" in firstBase);
  assert.equal(firstBase.parentNodeRef, "app-root");
  assert.equal(firstBase.fields.find((field) => field.slug === "role-keywords")?.required, true);
  assert.equal(firstBase.fields.find((field) => field.slug === "qualify-threshold")?.required, true);
  assert.equal(firstBase.metadata.appId, "kelly-instructor-sourcing");
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
  assert.equal(resolved.bases[0].baseId, "bse_criteria");
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

test("repairs the declared AirApp inside an exact legacy Folder", () => {
  const materialized = legacyFolder();
  const folder = {
    ...materialized,
    children: [
      ...materialized.children,
      {
        id: "nod_airapp",
        type: "airapp",
        slug: appConfig.airApp.slug,
        name: appConfig.airApp.name,
        metadata: {},
      },
    ],
  };

  const resolved = resolveProvisionedFolder(folder, appConfig);

  assert.equal(resolved.missing.length, 0);
  assert.equal(resolved.bases.length, appConfig.bases.length);
  assert.deepEqual(resolved.repairs.at(-1), {
    nodeId: "nod_airapp",
    resourceKey: "kelly-instructor-sourcing-app",
    metadata: {
      appId: appConfig.appId,
      resourceKey: "kelly-instructor-sourcing-app",
      schemaVersion: appConfig.schemaVersion,
    },
  });
});

test("still rejects an unrelated AirApp inside a legacy Folder", () => {
  const materialized = legacyFolder();
  const folder = {
    ...materialized,
    children: [
      ...materialized.children,
      {
        id: "nod_other_airapp",
        type: "airapp",
        slug: "unrelated-airapp",
        name: "Unrelated AirApp",
        metadata: {},
      },
    ],
  };

  // Assert the code and the offending slug, not the prose: the rule now lives in
  // busabase-sdk/airapp, whose messages are English. What must not change is that
  // an AirApp we did not declare still blocks the legacy claim by name.
  assert.throws(
    () => resolveProvisionedFolder(folder, appConfig),
    (/** @type {any} */ error) => {
      assert.equal(error.code, "SETUP_CONFLICT");
      assert.match(error.message, /unrelated-airapp/);
      return true;
    },
  );
});

test("submits the declared structure once and reads materialized ids back", async () => {
  const materialized = {
    node: {
      id: "nod_root",
      type: "folder",
      slug: unmaterializedConfig.folder.slug,
      metadata: {
        appId: unmaterializedConfig.appId,
        resourceKey: "app-root",
        schemaVersion: unmaterializedConfig.schemaVersion,
      },
    },
    children: unmaterializedConfig.bases.map((base) => ({
      id: `nod_${base.key}`,
      baseId: `bse_${base.key}`,
      type: "base",
      slug: base.slug,
      metadata: {
        appId: unmaterializedConfig.appId,
        resourceKey: base.key,
        schemaVersion: unmaterializedConfig.schemaVersion,
      },
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
      get: async () => materialized,
    },
  };

  const result = await provisionDeclaredResources(client, unmaterializedConfig);
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].operations.length, appConfig.bases.length + 1);
  assert.equal(submissions[0].autoMerge, true);
  assert.equal(result.bases.length, appConfig.bases.length);
  assert.equal(result.bases[0].baseId, "bse_criteria");
  assert.deepEqual(depths, [2, 2]);
});

test("waits for merged resources to become visible", async () => {
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
  let submissions = 0;
  const client = {
    nodes: {
      list: async () => {
        reads += 1;
        return [
          {
            id: "nod_root_system",
            type: "folder",
            slug: "root",
            children: reads < 3 ? [] : [materialized.node],
          },
        ];
      },
      createChangeRequest: async () => {
        submissions += 1;
        return { id: "crq_setup", status: "merged" };
      },
      get: async () => materialized,
    },
  };

  const result = await provisionDeclaredResources(client, unmaterializedConfig);
  assert.equal(submissions, 1);
  assert.equal(reads, 3);
  assert.equal(result.bases.length, appConfig.bases.length);
});

test("falls back from a stale node id to the declared Folder in the selected Space", async () => {
  const materialized = {
    node: {
      id: "nod_selected_space",
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
  const client = {
    nodes: {
      list: async () => [{ id: "nod_root", type: "folder", slug: "root", children: [materialized.node] }],
      get: async ({ nodeId }) => {
        if (nodeId === appConfig.folder.nodeId) throw Object.assign(new Error("Not found"), { status: 404 });
        assert.equal(nodeId, materialized.node.id);
        return materialized;
      },
    },
  };

  const result = await inspectProvisionedResources(client, appConfig);
  assert.equal(result.folder.nodeId, materialized.node.id);
  assert.equal(result.missing.length, 0);
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
      get: async () => materialized,
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
      get: async () => materialized,
      updateMetadata: async () => {
        metadataUpdates += 1;
      },
    },
    bases: {
      get: async ({ baseId }) => {
        const base = appConfig.bases.find((item) => `bse_${item.key}` === baseId);
        return baseDetail(base, base.key === "criteria" ? { type: "number" } : {});
      },
    },
  };

  await assert.rejects(() => provisionDeclaredResources(client, appConfig), /SETUP_CONFLICT/);
  assert.equal(metadataUpdates, 0);
});

test("adds only declared suffix fields when upgrading an owned older schema", async () => {
  const oldVersion = appConfig.schemaVersion - 1;
  const materialized = {
    node: {
      id: "nod_root",
      type: "folder",
      slug: appConfig.folder.slug,
      name: appConfig.folder.name,
      description: appConfig.folder.description,
      metadata: { appId: appConfig.appId, resourceKey: "app-root", schemaVersion: oldVersion },
    },
    children: appConfig.bases.map((base) => ({
      id: `nod_${base.key}`,
      baseId: `bse_${base.key}`,
      type: "base",
      slug: base.slug,
      name: base.name,
      description: base.description,
      metadata: { appId: appConfig.appId, resourceKey: base.key, schemaVersion: oldVersion },
    })),
  };
  const addedFieldSlugs = [];
  const fieldCountsToRemove = new Map([
    ["criteria", 2],
    ["candidates", 2],
  ]);
  const details = new Map(
    appConfig.bases.map((base) => {
      const remove = fieldCountsToRemove.get(base.key) || 0;
      return [
        `bse_${base.key}`,
        {
          ...baseDetail(base),
          fields: base.fields.slice(0, base.fields.length - remove).map((field) => ({ ...field })),
        },
      ];
    }),
  );
  const client = {
    nodes: {
      list: async () => [{ id: "nod_system_root", type: "folder", slug: "root", children: [materialized.node] }],
      get: async () => materialized,
      updateMetadata: async ({ nodeId, metadata }) => {
        const node =
          nodeId === materialized.node.id
            ? materialized.node
            : materialized.children.find((item) => item.id === nodeId);
        node.metadata = { ...node.metadata, ...metadata };
      },
    },
    bases: {
      get: async ({ baseId }) => details.get(baseId),
      fieldChangeRequest: async ({ baseId, slug, name, type, required }) => {
        details.get(baseId).fields.push({ slug, name, type, required });
        addedFieldSlugs.push(slug);
        return { id: `crq_${slug}`, status: "merged" };
      },
    },
  };

  const result = await provisionDeclaredResources(client, appConfig);
  // Derive the expectation from the same config the fixture trimmed, so adding
  // a field to a Base cannot silently drift this assertion.
  const expectedAddedSlugs = appConfig.bases.flatMap((base) => {
    const remove = fieldCountsToRemove.get(base.key) || 0;
    return base.fields.slice(base.fields.length - remove).map((field) => field.slug);
  });
  assert.deepEqual(addedFieldSlugs, expectedAddedSlugs);
  assert.equal(addedFieldSlugs.length, 4);
  assert.equal(result.repairs.length, 0);
  assert.equal(result.bases.length, appConfig.bases.length);
});

test("uses a verified legacy fingerprint when the old Busabase API has no metadata endpoint", async () => {
  const materialized = legacyFolder();
  let metadataAttempts = 0;
  const client = {
    nodes: {
      list: async () => [{ id: "nod_system_root", type: "folder", slug: "root", children: [materialized.node] }],
      get: async () => materialized,
      updateMetadata: async () => {
        metadataAttempts += 1;
        throw Object.assign(new Error("Not found"), { status: 404 });
      },
    },
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
