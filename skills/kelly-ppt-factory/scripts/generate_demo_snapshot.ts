#!/usr/bin/env node
import { demoStatePayload } from "../app/server/demo.ts";
import { createProvider } from "../lib/data-provider/index.ts";

const provider = await createProvider();
await provider.writeSnapshot(demoStatePayload({ demo: "overview", lang: "en" }).snapshot);
console.log("Wrote app/.data/ppt_factory_snapshot.json");
