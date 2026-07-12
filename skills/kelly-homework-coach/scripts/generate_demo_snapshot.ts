#!/usr/bin/env node
import fs from "node:fs/promises";
import { demoStatePayload } from "../app/server/demo.ts";
import { writeJson } from "../lib/common.ts";
import { DATA_DIR, SNAPSHOT_PATH } from "../lib/paths.ts";

const langArg = process.argv.find((arg) => arg.startsWith("--lang="));
const lang = langArg ? langArg.split("=")[1] : "zh-HK";
const state = demoStatePayload({ demo: "student", lang });

await fs.mkdir(DATA_DIR, { recursive: true });
await writeJson(SNAPSHOT_PATH, state.snapshot);
console.log(`Wrote demo snapshot: ${SNAPSHOT_PATH}`);
