#!/usr/bin/env node
import { demoSnapshot } from "../app/server/demo.ts";
import { writeSnapshot } from "../lib/common.ts";
import { SNAPSHOT_PATH } from "../lib/paths.ts";
import { APP_TITLE } from "../lib/types.ts";

await writeSnapshot(demoSnapshot());
console.log(`Wrote ${APP_TITLE} demo snapshot to ${SNAPSHOT_PATH}`);
