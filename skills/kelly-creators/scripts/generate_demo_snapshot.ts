#!/usr/bin/env node
// Seed the active data provider with the demo creator snapshot so the real
// (non-demo) UI has something to review out of the box.
import { demoStatePayload } from "../app/server/demo.ts";
import { createProvider } from "../lib/data-provider/index.ts";

const now = new Date().toISOString();
const snapshot = demoStatePayload({ demo: "overview" }).snapshot as Record<string, unknown>;
snapshot.generated_at = now;
snapshot.source = "kelly-creators-demo";

const provider = await createProvider();
const result = await provider.writeSnapshot(snapshot);

console.log(
  `Wrote ${result.creator_count} creator(s) via "${provider.kind}" provider${result.path ? ` to ${result.path}` : ""}`,
);
