#!/usr/bin/env node
import { demoStatePayload } from "../app/server/demo.ts";
// Writes a deterministic sample snapshot + outbox through the data provider so
// the UI, validator, and send_outbox dry-run can be exercised without real
// accounts. This is a plain script write; demo mode (?demo=<scene>) never
// touches the store.
import { createProvider } from "../lib/data-provider/index.ts";

const provider = await createProvider();
await provider.ensureReady();

const payload = demoStatePayload({ demo: "inbox" });
const snapshot = { ...payload.snapshot, source: "kelly-messenger-sample" };
const outbox = payload.outbox;

await provider.writeSnapshot(snapshot);
await provider.writeOutbox(outbox);

console.log("Wrote sample message snapshot and outbox.");
