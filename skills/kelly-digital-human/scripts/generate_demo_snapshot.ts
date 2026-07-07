#!/usr/bin/env node
import { demoState } from "../app/server/demo.ts";
import { writeJson } from "../lib/common.ts";
import { snapshotPath } from "../lib/paths.ts";

await writeJson(snapshotPath, demoState(new URLSearchParams("demo=overview")).snapshot);
console.log(`Wrote ${snapshotPath}`);
