import { copyFile, mkdir } from "node:fs/promises";
import { build } from "esbuild-wasm";
await mkdir("app/vendor", { recursive: true });
for (const [entry, output] of [
  ["busabase-sdk", "busabase-sdk"],
  ["busabase-sdk/airapp-gate", "busabase-airapp-gate"],
  ["scripts/lucide-entry.js", "lucide"],
]) {
  await build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "browser",
    outfile: `app/vendor/${output}.js`,
    minify: true,
    banner: { js: "// @ts-nocheck" },
  });
}
await copyFile("node_modules/busabase-sdk/dist/airapp-gate.css", "app/vendor/busabase-airapp-gate.css");
