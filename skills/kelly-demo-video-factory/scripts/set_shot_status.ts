#!/usr/bin/env node
// Mark a shot's recording status after a human/AI actually records it, and
// optionally attach the asset record produced by `busabase assets upload`.
//
// Usage:
//   node scripts/set_shot_status.ts <shot-record-id> recorded
//   node scripts/set_shot_status.ts <shot-record-id> needs_reshoot
//
// This always proposes a ChangeRequest (records never auto-merge here) and
// merges it immediately, because marking a shot recorded is the human's own
// on-the-spot decision made while operating this script — not agent-authored
// content that needs a separate review step.

import {
  approveAndMerge,
  findBase,
  getRecord,
  loadBusabaseConfig,
  proposeRecordUpdate,
} from "../lib/data-provider/busabase-client.ts";

async function main() {
  const [recordId, status] = process.argv.slice(2);
  if (!recordId || !["pending", "recorded", "needs_reshoot"].includes(status)) {
    console.error("Usage: set_shot_status.ts <shot-record-id> <pending|recorded|needs_reshoot>");
    process.exit(1);
  }

  const cfg = loadBusabaseConfig();
  const shotsBase = await findBase(cfg, "video-shots");
  if (!shotsBase) throw new Error("Schema missing — run `npm run ensure-schema` first.");

  const record = await getRecord(cfg, recordId);
  const fields = { ...record.headCommit.fields, "recording-status": status };

  const cr = await proposeRecordUpdate(cfg, recordId, fields, `Mark shot ${status} — ${fields.title}`);
  await approveAndMerge(cfg, cr.id, "Recording status update");
  console.log(`${fields.title} -> ${status}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
