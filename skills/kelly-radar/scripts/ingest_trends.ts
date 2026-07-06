#!/usr/bin/env node
// Write-path for trend mover payloads, with optional read-only import of a kelly-seo snapshot.
// Usage: node scripts/ingest_trends.ts <payload.json> [kelly-seo-snapshot.json]
// Payload: { "movers": [ { keyword, source, volume_proxy, delta_pct, momentum[] } ], "opportunities": [ ... ] }
import fs from "node:fs/promises";
import { createProvider } from "../lib/data-provider/index.ts";

function fail(message: string): never {
  console.error(`ingest_trends failed: ${message}`);
  process.exit(1);
}

async function readJsonFile<T = any>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

const payloadPath = process.argv[2];
const seoSnapshotPath = process.argv[3] || "";
if (!payloadPath) fail("usage: node scripts/ingest_trends.ts <payload.json> [kelly-seo-snapshot.json]");

const payload = await readJsonFile<any>(payloadPath);
if (!payload || !Array.isArray(payload.movers)) fail(`${payloadPath} must contain a movers[] array`);

// Optional, read-only cross-read of a kelly-seo snapshot: import rising queries as search movers.
let seoImported: any[] = [];
if (seoSnapshotPath) {
  const seo = await readJsonFile<any>(seoSnapshotPath);
  if (!seo) {
    console.warn(`Note: kelly-seo snapshot not readable at ${seoSnapshotPath}; skipping import.`);
  } else {
    const candidates: any[] =
      [seo.rising_queries, seo.queries, seo.search_queries, seo.keywords, seo.snapshot?.rising_queries].find(
        (value) => Array.isArray(value) && value.length,
      ) || [];
    seoImported = candidates
      .map((entry: any) => ({
        keyword: entry.keyword || entry.query || entry.term || "",
        source: "search",
        volume_proxy: Number(entry.volume_proxy ?? entry.impressions ?? entry.volume ?? entry.clicks ?? 0),
        delta_pct: Number(entry.delta_pct ?? entry.change_pct ?? entry.delta ?? 0),
        momentum: Array.isArray(entry.momentum) ? entry.momentum : [],
      }))
      .filter((entry: any) => entry.keyword);
    if (!seoImported.length) console.warn(`Note: no rising queries found in ${seoSnapshotPath}; nothing imported.`);
  }
}

const provider = await createProvider();
try {
  const result = await provider.ingestTrends(payload, seoImported);
  console.log(
    `OK: ${result.added} movers added, ${result.updated} updated, ${result.opportunities_added} opportunities added → ${result.snapshot_path} (provider: ${provider.name})`,
  );
} catch (error) {
  fail((error as Error).message);
}
