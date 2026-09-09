#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
export {
  ASSET_LIMIT_BYTES,
  inspectCapabilities,
} from "../content/kelly-drama-app/server/preflight.mjs";
import { inspectCapabilities } from "../content/kelly-drama-app/server/preflight.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(JSON.stringify(inspectCapabilities(), null, 2));
}
