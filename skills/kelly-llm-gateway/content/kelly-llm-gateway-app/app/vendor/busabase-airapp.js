// @ts-nocheck

// node_modules/.pnpm/busabase-sdk@0.16.1/node_modules/busabase-sdk/dist/airapp.js
var AirAppSetupError = class extends Error {
  code;
  /** The human-readable half, without the `CODE: ` prefix. */
  detail;
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "AirAppSetupError";
    this.code = code;
    this.detail = detail;
  }
};
var setupError = (code, detail) => new AirAppSetupError(code, detail);
var isNotFound = (error) => typeof error === "object" && error !== null && ("code" in error && error.code === "NOT_FOUND" || "status" in error && error.status === 404);
var isForbidden = (error) => typeof error === "object" && error !== null && ("code" in error && error.code === "FORBIDDEN" || "status" in error && error.status === 403);
var ownsResource = (node, appId, resourceKey, schemaVersion) => node?.metadata?.appId === appId && node?.metadata?.resourceKey === resourceKey && node?.metadata?.schemaVersion === schemaVersion;
var hasResourceIdentity = (node, appId, resourceKey) => node?.metadata?.appId === appId && node?.metadata?.resourceKey === resourceKey;
var ownsAppRoot = (node, appId, schemaVersion) => hasResourceIdentity(node, appId, "app-root") && node?.metadata?.schemaVersion === schemaVersion;
var hasEmptyMetadata = (node) => Object.keys(node?.metadata ?? {}).length === 0;
var matchesDeclaration = (node, declaration, type) => node?.type === type && node?.slug === declaration.slug && node?.name === declaration.name && node?.description === (declaration.description ?? "");
var matchesLegacyAirApp = (node, config) => hasEmptyMetadata(node) && node?.type === "airapp" && node?.slug === config.airApp?.slug && node?.name === config.airApp?.name;
var resourceMetadata = (config, resourceKey) => ({
  appId: config.appId,
  resourceKey,
  schemaVersion: config.schemaVersion
});
function resolveProvisionedFolder(folder, config) {
  if (!folder) {
    return { folder: null, bases: [], missing: [...config.bases], repairs: [] };
  }
  if (folder.node?.type !== "folder" || folder.node?.slug !== config.folder.slug) {
    throw setupError(
      "SETUP_CONFLICT",
      `A different Folder already uses the slug ${config.folder.slug}; nothing was changed`
    );
  }
  const rootOwned = hasResourceIdentity(folder.node, config.appId, "app-root");
  const legacyRoot = hasEmptyMetadata(folder.node) && matchesDeclaration(folder.node, config.folder, "folder");
  if (!rootOwned && !legacyRoot) {
    throw setupError(
      "SETUP_CONFLICT",
      `The Folder ${config.folder.slug} does not belong to this app; nothing was changed`
    );
  }
  const bases = [];
  const missing = [];
  const repairs = [];
  if (!ownsAppRoot(folder.node, config.appId, config.schemaVersion)) {
    repairs.push({
      nodeId: folder.node.id,
      resourceKey: "app-root",
      metadata: resourceMetadata(config, "app-root")
    });
  }
  for (const base of config.bases) {
    const matches = (folder.children ?? []).filter((node2) => node2.slug === base.slug);
    if (!matches.length) {
      if (legacyRoot) {
        throw setupError(
          "SETUP_CONFLICT",
          `The existing unstamped Folder is missing the resource ${base.slug}, so it cannot be claimed safely`
        );
      }
      missing.push(base);
      continue;
    }
    const node = matches[0];
    if (matches.length !== 1 || node.type !== "base" || !node.baseId) {
      throw setupError(
        "SETUP_CONFLICT",
        `The resource ${base.slug} does not match this app's declaration; nothing was changed`
      );
    }
    const owned = hasResourceIdentity(node, config.appId, base.key);
    const legacy = hasEmptyMetadata(node) && matchesDeclaration(node, base, "base");
    if (!owned && !legacy) {
      throw setupError(
        "SETUP_CONFLICT",
        `The resource ${base.slug} does not match this app's declaration; nothing was changed`
      );
    }
    if (!ownsResource(node, config.appId, base.key, config.schemaVersion)) {
      repairs.push({
        nodeId: node.id,
        baseId: node.baseId,
        resourceKey: base.key,
        metadata: resourceMetadata(config, base.key)
      });
    }
    bases.push({ ...base, nodeId: node.id, baseId: node.baseId });
  }
  const airAppNode = config.airApp ? (folder.children ?? []).find(
    (node) => hasResourceIdentity(
      node,
      config.appId,
      config.airApp.resourceKey
    ) || matchesLegacyAirApp(node, config)
  ) : void 0;
  if (config.airApp && airAppNode && !ownsResource(airAppNode, config.appId, config.airApp.resourceKey, config.schemaVersion)) {
    repairs.push({
      nodeId: airAppNode.id,
      resourceKey: config.airApp.resourceKey,
      metadata: resourceMetadata(config, config.airApp.resourceKey)
    });
  }
  if (legacyRoot) {
    const declaredSlugs = new Set(config.bases.map((base) => base.slug));
    const ambiguousExtra = (folder.children ?? []).find(
      (node) => !declaredSlugs.has(node.slug) && node.id !== airAppNode?.id && node?.metadata?.appId !== config.appId
    );
    if (ambiguousExtra) {
      throw setupError(
        "SETUP_CONFLICT",
        `The existing unstamped Folder holds an unattributable resource ${ambiguousExtra.slug}; nothing was changed`
      );
    }
  }
  return {
    folder: { ...config.folder, nodeId: folder.node.id },
    bases,
    missing,
    repairs
  };
}
function buildProvisionOperations(config, folder, missingBases) {
  const operations = [];
  if (!folder) {
    operations.push({
      kind: "create",
      ref: "app-root",
      nodeType: "folder",
      slug: config.folder.slug,
      name: config.folder.name,
      description: config.folder.description ?? "",
      metadata: resourceMetadata(config, "app-root")
    });
  }
  for (const base of missingBases) {
    operations.push({
      kind: "create",
      ...folder ? { parentNodeId: folder.nodeId } : { parentNodeRef: "app-root" },
      nodeType: "base",
      slug: base.slug,
      name: base.name,
      description: base.description ?? "",
      metadata: resourceMetadata(config, base.key),
      // The declaration's `type` is a plain `string` (see AirAppFieldDeclaration);
      // the server validates the real field-type enum on the wire.
      fields: base.fields
    });
  }
  return operations;
}
var findTopLevelFolder = async (client, config) => {
  const roots = await client.nodes.list({ parentId: null, depth: 2 });
  const candidates = (roots ?? []).flatMap((node) => [node, ...node.children ?? []]).filter((node) => node.type === "folder" && node.slug === config.folder.slug);
  if (candidates.length > 1) {
    throw setupError(
      "SETUP_CONFLICT",
      `Found more than one Folder with the slug ${config.folder.slug}; nothing was changed`
    );
  }
  return candidates[0] ?? null;
};
var readFolder = async (client, config) => {
  let nodeId = config.folder.nodeId;
  if (!nodeId) nodeId = (await findTopLevelFolder(client, config))?.id;
  if (!nodeId) return null;
  try {
    return await client.nodes.get({ nodeId, type: "folder" });
  } catch (error) {
    if (isNotFound(error) && config.folder.nodeId) {
      const discovered = await findTopLevelFolder(client, config);
      return discovered ? await client.nodes.get({
        nodeId: discovered.id,
        type: "folder"
      }) : null;
    }
    if (isNotFound(error)) return null;
    throw error;
  }
};
async function inspectProvisionedResources(client, config) {
  return resolveProvisionedFolder(await readFolder(client, config), config);
}
var provisionStates = /* @__PURE__ */ new WeakMap();
var stateFor = (client, appId) => {
  let byApp = provisionStates.get(client);
  if (!byApp) {
    byApp = /* @__PURE__ */ new Map();
    provisionStates.set(client, byApp);
  }
  let state = byApp.get(appId);
  if (!state) {
    state = { inFlight: null, metadataUpdatesSupported: void 0 };
    byApp.set(appId, state);
  }
  return state;
};
var sameFieldName = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
var fieldMatches = (actual, expected) => actual?.slug === expected.slug && actual?.type === expected.type && actual?.required === expected.required && sameFieldName(actual?.name, expected.name);
var additiveFieldsFor = (actual, expected) => {
  const fields = actual?.fields ?? [];
  if (fields.length > expected.fields.length || !fields.every((field, index) => fieldMatches(field, expected.fields[index]))) {
    throw setupError(
      "SETUP_CONFLICT",
      `The structure of ${expected.slug} does not match this app's declaration, so it cannot be upgraded safely`
    );
  }
  return expected.fields.slice(fields.length);
};
var validateRepairBase = (actual, expected, nodeId) => {
  if (!expected) {
    throw setupError("SETUP_CONFLICT", "Cannot repair a resource this app does not declare");
  }
  const fields = actual?.fields ?? [];
  const exactFields = fields.length === expected.fields.length && fields.every((field, index) => fieldMatches(field, expected.fields[index]));
  if (actual?.nodeId !== nodeId || actual?.slug !== expected.slug || actual?.name !== expected.name || actual?.description !== (expected.description ?? "") || !exactFields) {
    throw setupError(
      "SETUP_CONFLICT",
      `The structure of ${expected.slug} does not match this app's declaration, so it cannot be claimed safely`
    );
  }
};
async function repairResourceOwnership(client, config, current) {
  if (!current.repairs.length) return current;
  const state = stateFor(client, config.appId);
  const baseRepairs = current.repairs.filter((repair) => repair.baseId);
  const baseByKey = new Map(config.bases.map((base) => [base.key, base]));
  const details = await Promise.all(
    baseRepairs.map((repair) => client.bases.get({ baseId: repair.baseId }))
  );
  const migrations = details.map((detail, index) => {
    const repair = baseRepairs[index];
    const expected = baseByKey.get(repair.resourceKey);
    if (!expected) {
      throw setupError("SETUP_CONFLICT", "Cannot repair a resource this app does not declare");
    }
    if (detail?.nodeId !== repair.nodeId || detail?.slug !== expected.slug || detail?.name !== expected.name || detail?.description !== (expected.description ?? "")) {
      throw setupError(
        "SETUP_CONFLICT",
        `The structure of ${expected.slug} does not match this app's declaration, so it cannot be upgraded safely`
      );
    }
    return { repair, expected, fields: additiveFieldsFor(detail, expected) };
  });
  const pendingFieldRequests = [];
  for (const migration of migrations) {
    for (const field of migration.fields) {
      const changeRequest = await client.bases.fieldChangeRequest({
        operation: "create",
        baseId: migration.repair.baseId,
        slug: field.slug,
        name: field.name,
        // The declaration's `type` is a plain `string` (see AirAppFieldDeclaration);
        // the server validates the real field-type enum on the wire.
        type: field.type,
        required: field.required,
        message: `Upgrade ${config.appName}: add ${field.slug}`,
        submittedBy: config.appId
      });
      const merged = changeRequest?.status === "merged" || changeRequest?.materialized === true;
      if (!merged) pendingFieldRequests.push(changeRequest?.id ?? field.slug);
    }
  }
  if (pendingFieldRequests.length) {
    throw setupError(
      "SETUP_PENDING",
      `Submitted ${pendingFieldRequests.length} field upgrade request(s) awaiting Space admin approval: ${pendingFieldRequests.join(", ")}`
    );
  }
  const verified = migrations.some((migration) => migration.fields.length) ? await Promise.all(
    baseRepairs.map((repair) => client.bases.get({ baseId: repair.baseId }))
  ) : details;
  verified.forEach((detail, index) => {
    const repair = baseRepairs[index];
    validateRepairBase(detail, baseByKey.get(repair.resourceKey), repair.nodeId);
  });
  if (state.metadataUpdatesSupported === false) {
    return { ...current, repairs: [], compatibilityMode: "verified-legacy-fingerprint" };
  }
  try {
    for (const repair of current.repairs) {
      await client.nodes.updateMetadata({ nodeId: repair.nodeId, metadata: repair.metadata });
      state.metadataUpdatesSupported = true;
    }
  } catch (error) {
    if (isNotFound(error)) {
      state.metadataUpdatesSupported = false;
      return { ...current, repairs: [], compatibilityMode: "verified-legacy-fingerprint" };
    }
    if (isForbidden(error)) {
      throw setupError(
        "SETUP_PERMISSION",
        "This account may not repair resource ownership metadata for this app"
      );
    }
    throw error;
  }
  const repaired = await inspectProvisionedResources(client, config);
  if (repaired.repairs.length) {
    throw setupError("SCHEMA_INCOMPLETE", "Ownership was repaired but read back incomplete");
  }
  return repaired;
}
var waitForMaterializedResources = async (client, config, attempts = 20) => {
  let current;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    current = await inspectProvisionedResources(client, config);
    current = await repairResourceOwnership(client, config, current);
    if (current.folder && current.missing.length === 0) return current;
    if (attempt < attempts - 1) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 100));
    }
  }
  throw setupError(
    "SCHEMA_INCOMPLETE",
    "Initialization merged but the resources read back incomplete"
  );
};
async function provisionOnce(client, config) {
  let current = await inspectProvisionedResources(client, config);
  current = await repairResourceOwnership(client, config, current);
  if (current.folder && current.missing.length === 0) return current;
  const operations = buildProvisionOperations(config, current.folder, current.missing);
  let changeRequest;
  try {
    changeRequest = await client.nodes.createChangeRequest({
      message: `Initialize ${config.appName} workspace`,
      submittedBy: config.appId,
      autoMerge: true,
      operations
    });
  } catch (error) {
    if (isForbidden(error)) {
      throw setupError(
        "SETUP_PERMISSION",
        "This account may not create this app's resources in this Space"
      );
    }
    const concurrent = await inspectProvisionedResources(client, config).catch(() => null);
    if (concurrent?.folder && concurrent.missing.length === 0) return concurrent;
    throw error;
  }
  if (changeRequest?.status !== "merged") {
    throw setupError(
      "SETUP_PENDING",
      `Initialization request ${changeRequest?.id ?? ""} was submitted and awaits Space admin approval`.trim()
    );
  }
  return waitForMaterializedResources(client, config);
}
function provisionDeclaredResources(client, config) {
  const state = stateFor(client, config.appId);
  if (!state.inFlight) {
    state.inFlight = provisionOnce(client, config).finally(() => {
      state.inFlight = null;
    });
  }
  return state.inFlight;
}
export {
  AirAppSetupError,
  buildProvisionOperations,
  inspectProvisionedResources,
  isNotFound,
  provisionDeclaredResources,
  resolveProvisionedFolder
};
