import { createBusabaseClient as createSdkClient, getRecordByField } from "busabase-sdk";
import { appConfig } from "../../app/js/config.js";
import { isAirAppRequest, runtimeHeaders, runtimeOrigin } from "../runtime-context.ts";

type BaseKey = "reviews" | "contacts" | "settings";
type Fields = Record<string, unknown>;

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

function asRecords(page: any) {
  if (Array.isArray(page)) return page;
  return Array.isArray(page?.records) ? page.records : [];
}

function recordFields(record: any) {
  return fromBusabaseFields(record?.headCommit?.fields || record?.fields || {});
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

  async function locateFolder() {
    if (appConfig.folder.nodeId) {
      try {
        const detail = await sdk.nodes.get({ nodeId: appConfig.folder.nodeId, type: "folder" });
        if (!owns(detail.node, "app-root")) throw new Error("SETUP_CONFLICT: Kelly Email Folder ownership mismatch");
        return detail;
      } catch (error: any) {
        if (error?.code !== "NOT_FOUND" && error?.status !== 404) throw error;
      }
    }
    const roots = await sdk.nodes.list({ parentId: null, depth: 2 });
    const candidates = (roots || [])
      .flatMap((node: any) => [node, ...(node.children || [])])
      .filter((node: any) => node.type === "folder" && node.slug === appConfig.folder.slug);
    if (candidates.length > 1) throw new Error("SETUP_CONFLICT: duplicate Kelly Email folders");
    if (!candidates.length) return null;
    if (!owns(candidates[0], "app-root")) throw new Error("SETUP_CONFLICT: Kelly Email Folder is owned by another app");
    appConfig.folder.nodeId = candidates[0].id;
    return sdk.nodes.get({ nodeId: candidates[0].id, type: "folder" });
  }

  async function inspectResources() {
    const folder = await locateFolder();
    if (!folder) return { folder: null, bases: [], drive: null, missing: [...appConfig.bases] };
    const children = (folder as any).children || [];
    const resolvedBases = [];
    const missing = [];
    for (const declaration of appConfig.bases) {
      let node = declaration.nodeId ? children.find((item: any) => item.id === declaration.nodeId) : null;
      node ||= children.find((item: any) => item.slug === declaration.slug);
      if (!node) {
        missing.push(declaration);
        continue;
      }
      if (node.type !== "base" || !node.baseId || !owns(node, declaration.key)) {
        throw new Error(`SETUP_CONFLICT: ${declaration.slug} does not match its declaration`);
      }
      declaration.nodeId = node.id;
      declaration.baseId = node.baseId;
      resolvedBases.push(declaration);
    }
    let drive = appConfig.drive.nodeId ? children.find((item: any) => item.id === appConfig.drive.nodeId) : null;
    drive ||= children.find((item: any) => item.type === "drive" && item.slug === appConfig.drive.slug);
    if (drive && !owns(drive, "files")) throw new Error("SETUP_CONFLICT: Kelly Email Drive ownership mismatch");
    if (drive) appConfig.drive.nodeId = drive.id;
    return { folder, bases: resolvedBases, drive, missing };
  }

  async function provisionResources() {
    let current = await inspectResources();
    if (!current.folder || current.missing.length) {
      const operations: any[] = [];
      if (!current.folder) {
        operations.push({
          kind: "create",
          ref: "app-root",
          nodeType: "folder",
          slug: appConfig.folder.slug,
          name: appConfig.folder.name,
          description: appConfig.folder.description,
          metadata: ownership("app-root"),
        });
      }
      for (const declaration of current.missing) {
        operations.push({
          kind: "create",
          ...(current.folder ? { parentNodeId: current.folder.node.id } : { parentNodeRef: "app-root" }),
          nodeType: "base",
          slug: declaration.slug,
          name: declaration.name,
          description: declaration.description,
          metadata: ownership(declaration.key),
          fields: declaration.fields,
        });
      }
      const request = await sdk.nodes.createChangeRequest({
        message: "Initialize Kelly Email workspace",
        submittedBy: appConfig.appId,
        autoMerge: true,
        operations,
      });
      if (request?.status && request.status !== "merged") {
        throw new Error(`SETUP_PENDING: ${request.id}`);
      }
      current = await inspectResources();
    }
    if (!current.drive) {
      const created = await sdk.fileTrees.create({
        type: "drive",
        parentNodeId: current.folder.node.id,
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
        await sdk.nodes.updateMetadata({ nodeId: createdAny.node.id, metadata: ownership("files") });
      }
      current = await inspectResources();
    }
    if (!current.folder || current.missing.length || !current.drive) {
      throw new Error("SCHEMA_INCOMPLETE: Kelly Email resources were not materialized");
    }
    return current;
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

  async function listRecords(key: BaseKey) {
    const declaration = base(key);
    return asRecords(await sdk.records.list({ baseId: declaration.baseId, limit: declaration.readLimit }));
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
    listRecordFields: async () => (await listRecords("reviews")).map(recordFields),
    listContactFields: async () => (await listRecords("contacts")).map(recordFields),
    listSettingsFields: async () => (await listRecords("settings")).map(recordFields),
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
