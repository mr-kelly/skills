#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { demoStatePayload } from "../app/server/demo.ts";
import { SNAPSHOT_PATH } from "../app/server/paths.ts";

const state = demoStatePayload({ demo: "overview", lang: process.argv.includes("--zh") ? "zh" : "en" });
await fs.mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
await fs.writeFile(SNAPSHOT_PATH, `${JSON.stringify(state.snapshot, null, 2)}\n`);
console.log(SNAPSHOT_PATH);
