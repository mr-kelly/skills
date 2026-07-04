#!/usr/bin/env node
// Single write path for intake payload JSON files. The agent parses WeChat
// group exports, phone-call logs, front-desk forms, and mailbox items into
// the payload shape documented in references/tickets-schema.md; this script
// validates, dedupes (channel+external_id, falling back to a content hash),
// masks contacts defensively, merges into the snapshot, and appends sync_log.
// Usage: node scripts/ingest_intake.mjs <payload.json> [more-payloads.json...]

import crypto from "node:crypto";
import fs from "node:fs/promises";
import { LOCK_PATH, SNAPSHOT_PATH } from "../app/server/paths.mjs";
import {
  computeMetrics,
  emptySnapshot,
  ensureDirs,
  maskContact,
  readConfig,
  readJson,
  readLock,
  readSnapshot,
  writeJson,
} from "../app/server/store.mjs";

const CHANNELS = new Set(["wechat", "phone", "form", "email", "walk_in"]);
const URGENCIES = new Set(["urgent", "high", "normal", "low"]);

const payloadFiles = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

function fail(message) {
  console.error(`kelly-tickets ingest: ${message}`);
  process.exit(1);
}

if (!payloadFiles.length) fail("usage: node scripts/ingest_intake.mjs <payload.json> [...]");

await ensureDirs();

const existingLock = await readLock();
if (existingLock) {
  fail(
    `agent.lock exists (owner: ${existingLock.owner}, started ${existingLock.started_at}). Wait for the other run to finish.`,
  );
}

function sha1(value) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function dedupeKey(item) {
  const hash = item.content_hash || sha1(`${item.channel}|${item.unit || ""}|${item.text}`);
  return `${item.channel}:${item.external_id || hash}`;
}

await writeJson(LOCK_PATH, {
  owner: "kelly-tickets",
  message: "Ingesting intake payloads",
  started_at: new Date().toISOString(),
});

try {
  const snapshot = await readSnapshot();
  const base = snapshot.schema_version ? snapshot : emptySnapshot();
  const configResult = await readConfig();
  if (!base.property?.name && configResult.config.property?.name) {
    base.property = {
      name: configResult.config.property.name,
      buildings: configResult.config.property.buildings || 0,
    };
  }
  const seen = new Set((base.intake || []).map((item) => dedupeKey(item)));
  const now = new Date().toISOString();
  let added = 0;
  let skipped = 0;

  for (const file of payloadFiles) {
    const payload = await readJson(file, null);
    if (!payload || !Array.isArray(payload.items)) fail(`${file} must contain an { items: [] } payload`);
    let fileAdded = 0;
    let fileSkipped = 0;
    payload.items.forEach((item, index) => {
      const path = `${file} items[${index}]`;
      if (!CHANNELS.has(item.channel)) fail(`${path}: invalid channel ${item.channel}`);
      if (typeof item.text !== "string" || !item.text.trim()) fail(`${path}: text is required`);
      if (typeof item.received_at !== "string" || Number.isNaN(Date.parse(item.received_at))) {
        fail(`${path}: received_at must be an ISO timestamp`);
      }
      const contentHash = sha1(`${item.channel}|${item.unit || ""}|${item.text.trim()}`);
      const key = `${item.channel}:${item.external_id || contentHash}`;
      if (seen.has(key)) {
        fileSkipped += 1;
        return;
      }
      seen.add(key);
      base.intake.push({
        id: `in-${contentHash.slice(0, 10)}`,
        channel: item.channel,
        external_id: String(item.external_id || ""),
        content_hash: contentHash,
        reporter: String(item.reporter || ""),
        contact_masked: maskContact(item.contact || item.contact_masked || ""),
        unit: String(item.unit || ""),
        location: String(item.location || ""),
        text: item.text.trim(),
        received_at: new Date(item.received_at).toISOString(),
        urgency_guess: URGENCIES.has(item.urgency_guess) ? item.urgency_guess : "normal",
        category_guess: String(item.category_guess || "other"),
        triage_state: "new",
        ticket_id: "",
        attachments_note: String(item.attachments_note || ""),
        decision: null,
      });
      fileAdded += 1;
    });
    added += fileAdded;
    skipped += fileSkipped;
    base.sync_log.push({
      at: now,
      source: String(payload.source || "ingest"),
      action: "ingest",
      detail: `Ingested ${fileAdded} new intake items from ${file}; skipped ${fileSkipped} duplicates.`,
      count: fileAdded,
    });
  }

  base.generated_at = now;
  base.source = "kelly-tickets";
  base.metrics = computeMetrics(base);
  base.warnings = (base.warnings || []).filter((warning) => warning.id !== "no-snapshot");
  await writeJson(SNAPSHOT_PATH, base);
  console.log(`Ingested ${added} new intake items (${skipped} duplicates skipped) into ${SNAPSHOT_PATH}`);
} finally {
  await fs.rm(LOCK_PATH, { force: true });
}
