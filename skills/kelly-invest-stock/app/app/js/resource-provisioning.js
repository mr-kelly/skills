const setupError = (code, message) => new Error(`${code}: ${message}`);

const ownsResource = (node, appId, resourceKey, schemaVersion) =>
  node?.metadata?.appId === appId &&
  node?.metadata?.resourceKey === resourceKey &&
  node?.metadata?.schemaVersion === schemaVersion;

const hasResourceIdentity = (node, appId, resourceKey) =>
  node?.metadata?.appId === appId && node?.metadata?.resourceKey === resourceKey;

const ownsAppRoot = (node, appId, schemaVersion) =>
  hasResourceIdentity(node, appId, "app-root") && node?.metadata?.schemaVersion === schemaVersion;

const hasEmptyMetadata = (node) => Object.keys(node?.metadata || {}).length === 0;

const matchesDeclaration = (node, declaration, type) =>
  node?.type === type &&
  node?.slug === declaration.slug &&
  node?.name === declaration.name &&
  node?.description === declaration.description;

const resourceMetadata = (config, resourceKey) => ({
  appId: config.appId,
  resourceKey,
  schemaVersion: config.schemaVersion,
});

export const isNotFound = (error) => error?.code === "NOT_FOUND" || error?.status === 404;

export function resolveProvisionedFolder(folder, config) {
  if (!folder) {
    return { folder: null, bases: [], missing: [...config.bases], repairs: [] };
  }
  if (folder.node?.type !== "folder" || folder.node?.slug !== config.folder.slug) {
    throw setupError("SETUP_CONFLICT", `同名 Folder ${config.folder.slug} 不属于此应用，未执行任何修改`);
  }

  const rootOwned = hasResourceIdentity(folder.node, config.appId, "app-root");
  const legacyRoot = hasEmptyMetadata(folder.node) && matchesDeclaration(folder.node, config.folder, "folder");
  if (!rootOwned && !legacyRoot) {
    throw setupError("SETUP_CONFLICT", `同名 Folder ${config.folder.slug} 不属于此应用，未执行任何修改`);
  }

  const bases = [];
  const missing = [];
  const repairs = [];
  if (!ownsAppRoot(folder.node, config.appId, config.schemaVersion)) {
    repairs.push({
      nodeId: folder.node.id,
      resourceKey: "app-root",
      metadata: resourceMetadata(config, "app-root"),
    });
  }

  for (const base of config.bases) {
    const matches = (folder.children || []).filter((node) => node.slug === base.slug);
    if (!matches.length) {
      if (legacyRoot) {
        throw setupError("SETUP_CONFLICT", `旧版 Folder 缺少资源 ${base.slug}，无法安全认领`);
      }
      missing.push(base);
      continue;
    }
    const node = matches[0];
    if (matches.length !== 1 || node.type !== "base" || !node.baseId) {
      throw setupError("SETUP_CONFLICT", `资源 ${base.slug} 与此应用的声明不一致，未执行任何修改`);
    }

    const owned = hasResourceIdentity(node, config.appId, base.key);
    const legacy = hasEmptyMetadata(node) && matchesDeclaration(node, base, "base");
    if (!owned && !legacy) {
      throw setupError("SETUP_CONFLICT", `资源 ${base.slug} 与此应用的声明不一致，未执行任何修改`);
    }
    if (!ownsResource(node, config.appId, base.key, config.schemaVersion)) {
      repairs.push({
        nodeId: node.id,
        baseId: node.baseId,
        resourceKey: base.key,
        metadata: resourceMetadata(config, base.key),
      });
    }
    bases.push({ ...base, nodeId: node.id, baseId: node.baseId });
  }

  if (legacyRoot) {
    const declaredSlugs = new Set(config.bases.map((base) => base.slug));
    const ambiguousExtra = (folder.children || []).find(
      (node) => !declaredSlugs.has(node.slug) && node?.metadata?.appId !== config.appId,
    );
    if (ambiguousExtra) {
      throw setupError("SETUP_CONFLICT", `旧版 Folder 包含无法确认归属的资源 ${ambiguousExtra.slug}，未执行任何修改`);
    }
  }

  return {
    folder: { ...config.folder, nodeId: folder.node.id },
    bases,
    missing,
    repairs,
  };
}

export function buildProvisionOperations(config, folder, missingBases) {
  const operations = [];
  if (!folder) {
    operations.push({
      kind: "create",
      ref: "app-root",
      nodeType: "folder",
      slug: config.folder.slug,
      name: config.folder.name,
      description: config.folder.description,
      metadata: resourceMetadata(config, "app-root"),
    });
  }
  for (const base of missingBases) {
    operations.push({
      kind: "create",
      ...(folder ? { parentNodeId: folder.nodeId } : { parentNodeRef: "app-root" }),
      nodeType: "base",
      slug: base.slug,
      name: base.name,
      description: base.description,
      metadata: resourceMetadata(config, base.key),
      fields: base.fields,
    });
  }
  return operations;
}

const findTopLevelFolder = async (client, config) => {
  const roots = await client.nodes.list({ parentId: null, depth: 2 });
  const candidates = (roots || [])
    .flatMap((node) => [node, ...(node.children || [])])
    .filter((node) => node.type === "folder" && node.slug === config.folder.slug);
  if (candidates.length > 1) {
    throw setupError("SETUP_CONFLICT", `发现多个 ${config.folder.slug} Folder，未执行任何修改`);
  }
  return candidates[0] || null;
};

const readFolder = async (client, config) => {
  let nodeId = config.folder.nodeId;
  if (!nodeId) nodeId = (await findTopLevelFolder(client, config))?.id;
  if (!nodeId) return null;
  try {
    return await client.nodes.get({ nodeId, type: "folder" });
  } catch (error) {
    if (isNotFound(error) && config.folder.nodeId) {
      const discovered = await findTopLevelFolder(client, config);
      return discovered ? client.nodes.get({ nodeId: discovered.id, type: "folder" }) : null;
    }
    if (isNotFound(error)) return null;
    throw error;
  }
};

export async function inspectProvisionedResources(client, config) {
  return resolveProvisionedFolder(await readFolder(client, config), config);
}

const sameFieldName = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

let nodeMetadataUpdatesSupported;

const validateRepairBase = (actual, expected, nodeId) => {
  const fields = actual?.fields || [];
  const exactFields =
    fields.length === expected.fields.length &&
    fields.every((field, index) => {
      const declared = expected.fields[index];
      return (
        field.slug === declared.slug &&
        field.type === declared.type &&
        field.required === declared.required &&
        sameFieldName(field.name, declared.name)
      );
    });
  if (
    actual?.nodeId !== nodeId ||
    actual?.slug !== expected.slug ||
    actual?.name !== expected.name ||
    actual?.description !== expected.description ||
    !exactFields
  ) {
    throw setupError("SETUP_CONFLICT", `资源 ${expected.slug} 的结构与声明不一致，无法安全认领`);
  }
};

async function repairResourceOwnership(client, config, current) {
  if (!current.repairs.length) return current;

  const baseRepairs = current.repairs.filter((repair) => repair.baseId);
  const baseByKey = new Map(config.bases.map((base) => [base.key, base]));
  const details = await Promise.all(baseRepairs.map((repair) => client.bases.get({ baseId: repair.baseId })));
  details.forEach((detail, index) => {
    const repair = baseRepairs[index];
    validateRepairBase(detail, baseByKey.get(repair.resourceKey), repair.nodeId);
  });

  if (nodeMetadataUpdatesSupported === false) {
    return { ...current, repairs: [], compatibilityMode: "verified-legacy-fingerprint" };
  }

  try {
    for (const repair of current.repairs) {
      await client.nodes.updateMetadata({ nodeId: repair.nodeId, metadata: repair.metadata });
      nodeMetadataUpdatesSupported = true;
    }
  } catch (error) {
    if (isNotFound(error)) {
      nodeMetadataUpdatesSupported = false;
      return { ...current, repairs: [], compatibilityMode: "verified-legacy-fingerprint" };
    }
    if (error?.code === "FORBIDDEN" || error?.status === 403) {
      throw setupError("SETUP_PERMISSION", "当前账号不能修复此应用的资源归属 metadata");
    }
    throw error;
  }

  const repaired = await inspectProvisionedResources(client, config);
  if (repaired.repairs.length) {
    throw setupError("SCHEMA_INCOMPLETE", "资源归属修复后回读仍不完整");
  }
  return repaired;
}

let provisionInFlight;

const waitForMaterializedResources = async (client, config, attempts = 20) => {
  let current;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    current = await inspectProvisionedResources(client, config);
    current = await repairResourceOwnership(client, config, current);
    if (current.folder && current.missing.length === 0) return current;
    if (attempt < attempts - 1) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 100));
    }
  }
  throw setupError("SCHEMA_INCOMPLETE", "初始化已合并，但资源回读不完整");
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
      operations,
    });
  } catch (error) {
    if (error?.code === "FORBIDDEN" || error?.status === 403) {
      throw setupError("SETUP_PERMISSION", "当前账号不能在此 Space 创建应用资源");
    }
    const concurrent = await inspectProvisionedResources(client, config).catch(() => null);
    if (concurrent?.folder && concurrent.missing.length === 0) return concurrent;
    throw error;
  }

  if (changeRequest?.status !== "merged") {
    throw setupError("SETUP_PENDING", `初始化请求 ${changeRequest?.id || ""} 已提交，等待 Space 管理员审批`);
  }

  return waitForMaterializedResources(client, config);
}

export function provisionDeclaredResources(client, config) {
  if (!provisionInFlight) {
    provisionInFlight = provisionOnce(client, config).finally(() => {
      provisionInFlight = null;
    });
  }
  return provisionInFlight;
}
