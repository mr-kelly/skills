import { createBusabaseClient as createSdkClient, getRecordByField } from "busabase-sdk";
import { inspectProvisionedResources, provisionDeclaredResources } from "busabase-sdk/airapp";
import { appConfig } from "../../app/js/config.js";
import { isAirAppRequest, runtimeHeaders, runtimeOrigin } from "../runtime-context.ts";

type BaseKey = "reviews" | "contacts" | "settings";
type Fields = Record<string, unknown>;
type RecordFilter = {
  fieldSlug: string;
  fieldType?: string;
  operator: "contains" | "equals" | "is_empty" | "is_false" | "is_true" | "not_empty";
  value?: unknown;
};

// Folder + Bases are the shape every App-in-Skill declares, so their
// discovery/ownership/repair logic lives in busabase-sdk/airapp now. Kelly
// Email also provisions a Drive alongside
// its Bases, which the shared declaration has no concept of -- so the Drive
// stays hand-rolled here, layered on top of the SDK's Folder resolution.
const resourceConfig = {
  appId: appConfig.appId,
  appName: appConfig.appName,
  schemaVersion: appConfig.schemaVersion,
  folder: appConfig.folder,
  bases: appConfig.bases,
};

const ownership = (resourceKey: string) => ({
  appId: appConfig.appId,
  resourceKey,
  schemaVersion: appConfig.schemaVersion,
});

const owns = (node: any, resourceKey: string) =>
  node?.metadata?.appId === appConfig.appId && node?.metadata?.resourceKey === resourceKey;

const toBusabaseFields = (fields: Fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

const fromBusabaseFields = (fields: Fields = {}) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("-", "_"), value]));

function recordFields(record: any) {
  return fromBusabaseFields(record?.headCommit?.payload || record?.headCommit?.fields || record?.fields || {});
}

function crId(result: any) {
  return result?.materialized === false || result?.status === "in_review" ? String(result.id || "") : "";
}

export function createBusabaseClient() {
  const sdk = createSdkClient({
    baseUrl: runtimeOrigin(),
    ...(appConfig.spaceId ? { spaceId: appConfig.spaceId } : {}),
    headers: runtimeHeaders,
  });

  const base = (key: BaseKey) => {
    const resource = appConfig.bases.find((candidate) => candidate.key === key);
    if (!resource?.baseId) throw new Error(`SETUP_REQUIRED: ${resource?.name || key}`);
    return resource;
  };

  // busabase-sdk/airapp resolves Folder+Bases without mutating its config, so
  // this app's own appConfig.folder/bases (read directly by base() above, and
  // reused as the config's own cache of the discovered Folder id) are synced
  // back explicitly -- the same contract the hand-rolled version kept.
  function syncResolvedConfig(resources: {
    folder: { nodeId: string } | null;
    bases: { key: string; nodeId: string; baseId: string }[];
  }) {
    if (resources.folder?.nodeId) appConfig.folder.nodeId = resources.folder.nodeId;
    for (const resolved of resources.bases) {
      const declaration = appConfig.bases.find((candidate) => candidate.key === resolved.key);
      if (declaration) {
        declaration.nodeId = resolved.nodeId;
        declaration.baseId = resolved.baseId;
      }
    }
  }

  async function locateDrive(folderNodeId: string) {
    const detail = await sdk.nodes.get({ nodeId: folderNodeId, type: "folder" });
    const children = (detail as any).children || [];
    let drive = appConfig.drive.nodeId ? children.find((item: any) => item.id === appConfig.drive.nodeId) : null;
    drive ||= children.find((item: any) => item.type === "drive" && item.slug === appConfig.drive.slug);
    if (drive && !owns(drive, appConfig.drive.resourceKey)) {
      throw new Error("SETUP_CONFLICT: Kelly Email Drive ownership mismatch");
    }
    if (drive) appConfig.drive.nodeId = drive.id;
    return drive;
  }

  async function inspectResources() {
    const resources = await inspectProvisionedResources(sdk, resourceConfig);
    syncResolvedConfig(resources);
    const drive = resources.folder ? await locateDrive(resources.folder.nodeId) : null;
    return { folder: resources.folder, bases: resources.bases, drive, missing: resources.missing };
  }

  async function provisionResources() {
    const resources = await provisionDeclaredResources(sdk, resourceConfig);
    syncResolvedConfig(resources);
    let drive = await locateDrive(resources.folder!.nodeId);
    if (!drive) {
      const created = await sdk.fileTrees.create({
        type: "drive",
        parentNodeId: resources.folder!.nodeId,
        slug: appConfig.drive.slug,
        name: appConfig.drive.name,
        description: appConfig.drive.description,
        visibility: "workspace",
        version: "1.0.0",
        files: [],
        autoMerge: true,
        mergeMode: "replace",
      });
      const createdAny = created as any;
      if (createdAny?.status && createdAny.status !== "merged") throw new Error(`SETUP_PENDING: ${createdAny.id}`);
      if (createdAny?.node?.id) {
        await sdk.nodes.updateMetadata({
          nodeId: createdAny.node.id,
          metadata: ownership(appConfig.drive.resourceKey),
        });
      }
      drive = await locateDrive(resources.folder!.nodeId);
    }
    if (!resources.folder || resources.missing.length || !drive) {
      throw new Error("SCHEMA_INCOMPLETE: Kelly Email resources were not materialized");
    }
    return { folder: resources.folder, bases: resources.bases, drive, missing: resources.missing };
  }

  async function verifyConnection() {
    const current = await inspectResources();
    const byKey = new Map(current.bases.map((item: any) => [item.key, item]));
    await Promise.all(current.bases.map((item: any) => sdk.bases.get({ baseId: item.baseId })));
    return {
      folder_exists: Boolean(current.folder),
      base_exists: byKey.has("reviews"),
      contacts_base_exists: byKey.has("contacts"),
      settings_base_exists: byKey.has("settings"),
      drive_exists: Boolean(current.drive),
    };
  }

  async function getRecord(key: BaseKey, recordId: string) {
    return getRecordByField(sdk, { baseId: base(key).baseId, fieldSlug: "record-id", valueText: recordId });
  }

  async function readPage(
    key: BaseKey,
    options: {
      cursor?: string;
      filters?: RecordFilter[];
      limit?: number;
      sort?: { fieldSlug: string; fieldType?: string; direction: "asc" | "desc" };
    } = {},
  ) {
    const declaration = base(key);
    const result = await sdk.records.list({
      baseId: declaration.baseId,
      limit: options.limit || declaration.readLimit,
      ...(options.cursor ? { cursor: options.cursor } : {}),
      ...(options.filters ? { filters: options.filters } : {}),
      ...(options.sort ? { sort: options.sort } : {}),
    });
    const records = Array.isArray(result) ? result : result.records || [];
    return {
      rows: records.map(recordFields),
      nextCursor: Array.isArray(result) ? null : result.nextCursor || null,
    };
  }

  async function countRecords(key: BaseKey, filters?: RecordFilter[]) {
    const declaration = base(key);
    try {
      const result = await sdk.records.count({
        baseId: declaration.baseId,
        ...(filters ? { filters } : {}),
      });
      return result.total;
    } catch {
      return null;
    }
  }

  async function upsert(key: BaseKey, recordId: string, fields: Fields, message: string) {
    const declaration = base(key);
    const existing = await getRecord(key, recordId).catch(() => null);
    const normalized = toBusabaseFields({
      ...fields,
      record_id: recordId,
      ...(key === "reviews" ? { subject: fields.subject || fields.name || recordId } : {}),
      ...(key === "contacts" ? { email: fields.email || `${recordId}@invalid.local` } : {}),
      ...(key === "settings" ? { name: fields.name || recordId } : {}),
    });
    const autoMerge = !isAirAppRequest();
    if (!existing) {
      const result = await sdk.bases.createChangeRequest({
        baseId: declaration.baseId,
        fields: normalized,
        message,
        submittedBy: appConfig.appId,
        idempotencyKey: `${appConfig.appId}:${recordId}:${String(fields.updated_at || "create")}`,
        autoMerge,
      });
      return { result, change_request_id: crId(result) };
    }
    const result = await sdk.records.changeRequest({
      recordId: existing.id,
      operation: "update",
      fields: normalized,
      message,
      author: appConfig.appId,
      baseCommitId: existing.headCommitId,
      autoMerge,
    });
    return { result, change_request_id: crId(result) };
  }

  async function readDriveFile(pathname: string) {
    if (!appConfig.drive.nodeId) throw new Error("SETUP_REQUIRED: Email Files");
    return sdk.fileTrees.readFile({ nodeId: appConfig.drive.nodeId, type: "drive", filePath: pathname });
  }

  async function writeDriveFile(pathname: string, content: string, mimeType = "text/plain") {
    if (!appConfig.drive.nodeId) throw new Error("SETUP_REQUIRED: Email Files");
    const existing = await readDriveFile(pathname).catch(() => null);
    const result = await sdk.fileTrees.createChangeRequest({
      nodeId: appConfig.drive.nodeId,
      type: "drive",
      message: `Kelly Email file ${pathname}`,
      submittedBy: appConfig.appId,
      operations: [
        {
          kind: existing ? "update" : "create",
          path: pathname,
          content,
          mimeType,
          ...(existing?.contentHash ? { baseContentHash: existing.contentHash } : {}),
        },
      ],
    });
    return { result, change_request_id: crId(result) || String(result?.id || "") };
  }

  return {
    sdk,
    meta: {
      baseUrl: runtimeOrigin(),
      spaceId: appConfig.spaceId || process.env.BUSABASE_SPACE_ID || "",
      folderSlug: appConfig.folder.slug,
      driveSlug: appConfig.drive.slug,
      secretsNamespace: appConfig.vaultNamespace,
      get baseId() {
        return appConfig.bases.find((item) => item.key === "reviews")?.baseId || "";
      },
      get contactsBaseId() {
        return appConfig.bases.find((item) => item.key === "contacts")?.baseId || "";
      },
      get settingsBaseId() {
        return appConfig.bases.find((item) => item.key === "settings")?.baseId || "";
      },
      get driveId() {
        return appConfig.drive.nodeId;
      },
    },
    provisionResources,
    inspectResources,
    verifyConnection,
    getRecordFields: async (recordId: string) => recordFields(await getRecord("reviews", recordId)),
    readRecordPage: (options?: Parameters<typeof readPage>[1]) => readPage("reviews", options),
    countRecordFields: (filters?: RecordFilter[]) => countRecords("reviews", filters),
    listRecordFields: async () => (await readPage("reviews")).rows,
    listContactFields: async () => (await readPage("contacts")).rows,
    listSettingsFields: async () => (await readPage("settings")).rows,
    getSettingsFields: async (recordId: string) => recordFields(await getRecord("settings", recordId)),
    upsertRecord: (recordId: string, fields: Fields, message: string) => upsert("reviews", recordId, fields, message),
    upsertContactRecord: (recordId: string, fields: Fields, message: string) =>
      upsert("contacts", recordId, fields, message),
    upsertSettingsRecord: (recordId: string, fields: Fields, message: string) =>
      upsert("settings", recordId, fields, message),
    readDriveFile,
    writeDriveFile,
    getSecret: async (name: string) => String(process.env[name] || ""),
  };
}
