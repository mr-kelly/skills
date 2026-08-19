import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const skillsRoot = path.join(root, "skills");
const findings = [];
const MIN_PROXY_AWARE_GATEWAY_VERSION = "0.17.2";

const versionAtLeast = (actual, minimum) => {
  const parse = (value) => value.split(".").map((part) => Number.parseInt(part, 10));
  const left = parse(actual);
  const right = parse(minimum);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] ?? 0) > (right[index] ?? 0)) return true;
    if ((left[index] ?? 0) < (right[index] ?? 0)) return false;
  }
  return true;
};

const readOptional = async (file) =>
  readFile(file, "utf8").catch((error) => {
    if (error?.code === "ENOENT") return "";
    throw error;
  });

const entries = await readdir(skillsRoot, { withFileTypes: true });
for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const skillRoot = path.join(skillsRoot, entry.name);

  for (const relativeRoot of ["", "app"]) {
    const packageRoot = path.join(skillRoot, relativeRoot);
    const packageText = await readOptional(path.join(packageRoot, "package.json"));
    if (!packageText) continue;
    const packageJson = JSON.parse(packageText);
    const sdkVersion = packageJson.dependencies?.["busabase-sdk"];
    if (!sdkVersion) continue;

    const location = relativeRoot ? `${entry.name}/${relativeRoot}` : entry.name;
    const workspace = await readOptional(path.join(packageRoot, "pnpm-workspace.yaml"));
    if (!workspace.includes(`busabase-sdk@${sdkVersion}`)) {
      findings.push(`${location}: minimumReleaseAgeExclude does not allow busabase-sdk@${sdkVersion}`);
    }

    const pnpmLock = await readOptional(path.join(packageRoot, "pnpm-lock.yaml"));
    if (!pnpmLock.includes(`specifier: ${sdkVersion}`) || !pnpmLock.includes(`busabase-sdk@${sdkVersion}:`)) {
      findings.push(`${location}: pnpm-lock.yaml does not resolve busabase-sdk@${sdkVersion}`);
    }

    const npmLock = await readOptional(path.join(packageRoot, "package-lock.json"));
    if (npmLock) {
      const lockedVersion = JSON.parse(npmLock).packages?.["node_modules/busabase-sdk"]?.version;
      if (lockedVersion !== sdkVersion) {
        findings.push(`${location}: package-lock.json resolves busabase-sdk@${lockedVersion ?? "missing"}`);
      }
    }
  }

  const server = await readOptional(path.join(skillRoot, "app", "server.js"));
  if (server.includes("createBusabaseAirAppLocalGateway")) {
    const appPackage = JSON.parse(await readOptional(path.join(skillRoot, "app", "package.json")));
    const appSdkVersion = appPackage.dependencies?.["busabase-sdk"] || "0.0.0";
    if (!server.includes('from "busabase-sdk/airapp-node"')) {
      findings.push(`${entry.name}/app: AirApp gateway must import busabase-sdk/airapp-node directly`);
    }
    if (!versionAtLeast(appSdkVersion, MIN_PROXY_AWARE_GATEWAY_VERSION)) {
      findings.push(`${entry.name}/app: AirApp gateway requires busabase-sdk >= ${MIN_PROXY_AWARE_GATEWAY_VERSION}`);
    }
  }
}

if (findings.length) {
  console.error(`SDK policy audit failed (${findings.length} finding(s)):`);
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log("SDK policy audit passed");
}
