import type { Config } from "../types.ts";

export interface BusabaseClientOptions {
  envPrefix: string;
  config?: Config;
}

export interface BusabaseClientMeta {
  baseUrl: string;
  baseId: string;
  driveId: string;
  secretsNamespace: string;
  apiKey: string;
}

function cleanUrl(value: unknown) {
  return String(value || "").replace(/\/$/, "");
}

function configValue(config: Config | undefined, key: string) {
  const busa = config?.busabase || {};
  return busa[key];
}

export function busabaseMeta({ envPrefix, config = {} }: BusabaseClientOptions): BusabaseClientMeta {
  const env = (name: string) => process.env[`${envPrefix}_${name}`] || "";
  const apiKeyEnv = String(configValue(config, "api_key_env") || `${envPrefix}_BUSABASE_API_KEY`);
  return {
    baseUrl: cleanUrl(env("BUSABASE_URL") || configValue(config, "base_url") || "http://127.0.0.1:15419"),
    baseId: String(env("BUSABASE_BASE_ID") || configValue(config, "base_id") || "kelly-email"),
    driveId: String(env("BUSABASE_DRIVE_ID") || configValue(config, "drive_id") || "kelly-email-files"),
    secretsNamespace: String(
      env("BUSABASE_SECRETS_NAMESPACE") || configValue(config, "secrets_namespace") || "kelly-email",
    ),
    apiKey: process.env[apiKeyEnv] || env("BUSABASE_API_KEY") || "",
  };
}

export function createBusabaseClient(options: BusabaseClientOptions) {
  const meta = busabaseMeta(options);

  function requireConfig() {
    if (!meta.baseUrl || !meta.baseId) {
      throw new Error("Busabase provider needs base_url and base_id.");
    }
  }

  async function api(method: string, pathname: string, body?: unknown): Promise<any> {
    requireConfig();
    const res = await fetch(`${meta.baseUrl}${pathname}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(meta.apiKey ? { authorization: `Bearer ${meta.apiKey}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`busabase ${method} ${pathname} -> ${res.status} ${detail}`.trim());
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  function recordPath(recordId: string) {
    return `/api/v1/bases/${encodeURIComponent(meta.baseId)}/records/${encodeURIComponent(recordId)}`;
  }

  function recordFields(record: unknown): Record<string, unknown> {
    const rec = (record || {}) as Record<string, unknown>;
    const head = (rec.headCommit || {}) as Record<string, unknown>;
    return (head.fields as Record<string, unknown>) || (rec.fields as Record<string, unknown>) || {};
  }

  async function getRecordFields(recordId: string): Promise<Record<string, unknown>> {
    return recordFields(await api("GET", recordPath(recordId)));
  }

  async function commitRecord(recordId: string, fields: Record<string, unknown>, message: string) {
    return api("POST", `${recordPath(recordId)}/commits`, {
      payload: { fields, message, author: "kelly-email" },
    });
  }

  async function putDriveFile(pathname: string, data: unknown, metaFields: Record<string, unknown> = {}) {
    // Busabase Drive APIs are still evolving. Until the public SDK surface is
    // stable, store a durable file pointer record in the Base. The field shape is
    // Drive-compatible and can be migrated to native Drive objects later.
    const recordId = `file-${pathname.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "")}`;
    await commitRecord(
      recordId,
      {
        kind: "drive_file",
        drive_id: meta.driveId,
        path: pathname,
        data,
        meta: metaFields,
        updated_at: new Date().toISOString(),
      },
      `Drive file ${pathname}`,
    );
    return { record_id: recordId, drive_id: meta.driveId, path: pathname };
  }

  async function getDriveFile(pathname: string) {
    const recordId = `file-${pathname.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "")}`;
    return getRecordFields(recordId);
  }

  return {
    meta,
    api,
    getRecordFields,
    commitRecord,
    putDriveFile,
    getDriveFile,
    async verifyConnection() {
      await api("GET", `/api/v1/bases/${encodeURIComponent(meta.baseId)}`);
      return {
        ok: true,
        base_url: meta.baseUrl,
        base_id: meta.baseId,
        drive_id: meta.driveId,
        secrets_namespace: meta.secretsNamespace,
        api_key: meta.apiKey ? "configured" : "none",
      };
    },
  };
}
