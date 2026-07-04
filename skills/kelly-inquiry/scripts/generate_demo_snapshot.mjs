#!/usr/bin/env node
import { demoStatePayload } from "../app/server/demo.mjs";
// Writes a deterministic sample snapshot + decisions into app/.data so the UI,
// validator, and send_approved dry-run can be exercised without real accounts.
// This is a plain script write; demo mode (?demo=<scene>) never touches .data.
import { DECISIONS_PATH, SNAPSHOT_PATH } from "../app/server/paths.mjs";
import { writeJson } from "../app/server/store.mjs";

const payload = demoStatePayload({ demo: "overview" });
const snapshot = { ...payload.snapshot, source: "kelly-inquiry-sample" };
const decisions = payload.decisions;

await writeJson(SNAPSHOT_PATH, snapshot);
await writeJson(DECISIONS_PATH, decisions);

console.log(`Wrote ${SNAPSHOT_PATH}`);
console.log(`Wrote ${DECISIONS_PATH}`);
