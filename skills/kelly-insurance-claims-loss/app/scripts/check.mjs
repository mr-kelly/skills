import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const appRoot = join(__dirname, "..");

const pkg = JSON.parse(await readFile(join(appRoot, "package.json"), "utf8"));
assert.equal(pkg.dependencies["busabase-sdk"], "0.11.0");
console.log("Check passed for kelly-insurance-claims-loss");
