import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const bundlePath = fileURLToPath(new URL("../app/vendor/busabase-sdk.js", import.meta.url));
const source = await readFile(bundlePath, "utf8");
const normalized = source
  .split("\n")
  .map((line) => line.trimEnd())
  .join("\n");

await writeFile(bundlePath, normalized, "utf8");
