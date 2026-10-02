import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

// ── busabase-sdk/airapp-check: the versioned AirApp runtime contract ────────
// Added on top of this file's own checks, not in place of them: the rules
// above/below this block are specific to this app; the ones here are the
// shared contract every AirApp is held to, versioned with the SDK so a fix
// like busabase-sdk@0.30.1's runtime-detection rule reaches every app that
// bumps its pin instead of staying stuck in whatever copy this file had.
{
  const { checkAirApp } = await import("busabase-sdk/airapp-check");
  const { readFile: gateReadFile, readdir: gateReaddir } = await import("node:fs/promises");
  const path = (await import("node:path")).default;
  const readFile = gateReadFile;
  const readdir = gateReaddir;
  const readIfExists = (p) => readFile(p, "utf8").catch(() => undefined);
  const walk = async (dir) => {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...(await walk(full)));
      else out.push(full);
    }
    return out;
  };
  const appFiles = (await walk(path.join(root, "app"))).filter((f) => !f.split(path.sep).includes("vendor"));
  const LOGIC_BASENAMES = new Set(["app.js", "config.js", "busabase-client.js", "runtime.js"]);
  const isLogic = (f) =>
    LOGIC_BASENAMES.has(path.basename(f)) || f.endsWith(path.join("providers", "busabase-provider.js"));
  const isDownload = (f) => /\.(?:js|html)$/.test(f);
  const joinFiles = async (files) => (await Promise.all(files.map((f) => readFile(f, "utf8")))).join("\n");
  const serverCandidates = [path.join(root, "server.js"), ...(await walk(path.join(root, "server")).catch(() => []))];
  const serverParts = (await Promise.all(serverCandidates.map((f) => readIfExists(f)))).filter(
    (text) => text !== undefined,
  );
  const findings = await checkAirApp({
    packageJson: await readIfExists(path.join(root, "package.json")),
    server: serverParts.length ? serverParts.join("\n") : undefined,
    serverLanguage: "node",
    browserLogic: await joinFiles(appFiles.filter(isLogic)),
    browserDownloads: await joinFiles(appFiles.filter(isDownload)),
    config:
      (await readIfExists(path.join(root, "app", "js", "config.js"))) ??
      (await readIfExists(path.join(root, "app", "config.js"))),
    shippedSlug: path.basename(root),
  });
  const errors = findings.filter((f) => f.severity === "error");
  if (errors.length) {
    throw new Error(
      `busabase-sdk/airapp-check found ${errors.length} contract violation(s):\n${errors.map((f) => `  [${f.rule}] ${f.message}`).join("\n")}`,
    );
  }
}
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const configText = await readFile(path.join(root, "app", "js", "config.js"), "utf8");
const index = await readFile(path.join(root, "app", "index.html"), "utf8");

if (packageJson.scripts.start !== "node server.js") throw new Error("AirApp start must be node server.js");
if (!configText.includes('deployment: "cloud"')) throw new Error("Kelly Homework Coach must be Cloud-only");
if (/KELLY_HOMEWORK_COACH_DATA_PROVIDER|local-file-provider|config\.local\.json/.test(configText)) {
  throw new Error("Retired provider/runtime contract remains in app config");
}
if (/\b(?:href|src)="\/(?!api\/v1)/.test(index)) throw new Error("AirApp assets must use relative URLs");

// ── Editorial theme contract ───────────────────────────────────────────────
// `styles/editorial.css` is the one file allowed to know a colour, a font
// size, a radius, or a duration. Every violation of that is silent: the app
// still renders, still passes every other check, and only breaks when someone
// switches family or opens it in dark mode — a screenshot nobody takes until
// after handoff. See kelly-app-skill-creator/references/editorial-visual-system.md.
//
// `base-ui.css` and the vendored AirApp gate stylesheet are excluded on
// purpose: both are copied third-party/shared assets that legitimately carry
// raw values, and editorial.css is a profile OVER base-ui, not a replacement.
{
  // A copy, not a cross-repo import: this app ships as a Busabase template
  // and must stay runnable outside this workspace. `tests/editorial-theme.test.mjs`
  // asserts the copy is byte-identical to the asset, the same way
  // `tests/base-ui-rollout.test.mjs` does for base-ui.css.
  const { editorialAssertions } = await import("./check-editorial.mjs");
  const themeSource = await readFile(path.join(root, "app", "styles", "editorial.css"), "utf8");
  const otherCss = await readFile(path.join(root, "app", "styles.css"), "utf8");
  const failures = editorialAssertions(themeSource, otherCss, index).filter((assertion) => !assertion.ok);
  if (failures.length) {
    throw new Error(
      `Editorial theme contract violated (${failures.length}):\n${failures.map((f) => `  ${f.message}`).join("\n")}`,
    );
  }
}

const forbidden = ["local-file-provider.ts", "launcher.ts", "start.sh", "setup-gate.js"];
const walk = async (directory) => {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".data") continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await walk(target)));
    else paths.push(target);
  }
  return paths;
};
const files = await walk(root);
for (const name of forbidden) {
  if (files.some((file) => path.basename(file) === name)) throw new Error(`Retired local file remains: ${name}`);
}

console.log(`Kelly Homework Coach AirApp checks OK (${files.length} files)`);
