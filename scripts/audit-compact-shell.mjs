import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const skillsRoot = join(repoRoot, "skills");
const creatorAssetPath = join(
  skillsRoot,
  "kelly-app-skill-creator",
  "assets",
  "compact-shell",
  "kelly-compact-shell.css",
);

const collectFiles = async (root) => {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(path)));
    else files.push(path);
  }
  return files;
};

export async function auditCompactShell() {
  const creatorAsset = await readFile(creatorAssetPath, "utf8");
  const failures = [];
  const apps = [];

  for (const entry of await readdir(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const appRoot = join(skillsRoot, entry.name, "app");
    try {
      await readFile(join(appRoot, "package.json"));
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    apps.push(entry.name);

    const indexPath = join(appRoot, "app", "index.html");
    const copyPath = join(appRoot, "app", "vendor", "kelly-compact-shell.css");
    const [html, copy] = await Promise.all([readFile(indexPath, "utf8"), readFile(copyPath, "utf8")]);
    const link = '<link rel="stylesheet" href="./vendor/kelly-compact-shell.css" />';
    const linkCount = html.split(link).length - 1;
    if (linkCount !== 1) failures.push(`${entry.name}: expected one compact-shell stylesheet link, found ${linkCount}`);
    const lastStylesheet = [...html.matchAll(/<link\s+[^>]*rel=["']stylesheet["'][^>]*>/g)].at(-1)?.[0] || "";
    if (!lastStylesheet.includes("vendor/kelly-compact-shell.css")) {
      failures.push(`${entry.name}: compact-shell stylesheet must load last`);
    }
    if (copy !== creatorAsset) failures.push(`${entry.name}: compact-shell asset drifted from creator source`);

    const browserFiles = (await collectFiles(join(appRoot, "app"))).filter((path) => /\.(?:html|js)$/.test(path));
    const browserSource = (await Promise.all(browserFiles.map((path) => readFile(path, "utf8")))).join("\n");
    if (!browserSource.includes("mobile-topbar")) failures.push(`${entry.name}: no standard mobile topbar marker`);
    if (/mobile-next-step/.test(browserSource))
      failures.push(`${entry.name}: duplicate mobile next-step band is forbidden`);
  }

  apps.sort();
  if (apps.length !== 67) failures.push(`expected 67 canonical apps, found ${apps.length}`);
  if (failures.length) throw new Error(`Compact shell audit failed:\n- ${failures.join("\n- ")}`);
  return { appCount: apps.length, apps, asset: creatorAssetPath };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await auditCompactShell();
  console.log(`Compact shell audit OK: ${result.appCount} canonical apps`);
}
