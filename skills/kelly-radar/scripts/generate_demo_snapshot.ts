#!/usr/bin/env node
// Writes the deterministic demo snapshot to app/.data/radar_snapshot.json for local
// testing and validation. Never touches live data sources.
import { createProvider } from "../lib/data-provider/index.ts";

const provider = await createProvider();
const { snapshot_path } = await provider.writeDemoSnapshot();
console.log(`Wrote ${snapshot_path}`);
