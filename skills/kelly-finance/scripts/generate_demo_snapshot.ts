#!/usr/bin/env node
import { demoSnapshot } from "../app/server/demo.ts";
import { localFileProvider } from "../lib/data-provider/local-file-provider.ts";

await localFileProvider.ensureReady();
await localFileProvider.writeSnapshot(demoSnapshot("en"));
await localFileProvider.completeOnboarding({
  completed: true,
  completed_at: new Date().toISOString(),
  config_version: "demo",
});
console.log("Wrote Kelly Finance demo snapshot to app/.data/model_snapshot.json");
