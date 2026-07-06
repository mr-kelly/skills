#!/usr/bin/env node
import { demoStatePayload } from "../app/server/demo.ts";
import { createProvider } from "../lib/data-provider/index.ts";

const now = new Date().toISOString();

const snapshot = demoStatePayload({ demo: "overview" }).snapshot as Record<string, unknown>;
snapshot.generated_at = now;
snapshot.source = "kelly-crm-demo";

const provider = await createProvider();
const result = await provider.writeSnapshot(snapshot);

console.log(`Wrote ${result.path || "snapshot"}`);
