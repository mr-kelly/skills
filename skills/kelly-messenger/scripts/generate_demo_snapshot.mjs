#!/usr/bin/env node
// Writes a deterministic sample snapshot + outbox into app/.data so the UI,
// validator, and send_outbox dry-run can be exercised without real accounts.
// This is a plain script write; demo mode (?demo=<scene>) never touches .data.
import { OUTBOX_PATH, SNAPSHOT_PATH } from "../app/server/paths.mjs";
import { writeJson } from "../app/server/store.mjs";
import { demoStatePayload } from "../app/server/demo.mjs";

const payload = demoStatePayload({ demo: "inbox" });
const snapshot = { ...payload.snapshot, source: "kelly-messenger-sample" };
const outbox = payload.outbox;

await writeJson(SNAPSHOT_PATH, snapshot);
await writeJson(OUTBOX_PATH, outbox);

console.log(`Wrote ${SNAPSHOT_PATH}`);
console.log(`Wrote ${OUTBOX_PATH}`);
