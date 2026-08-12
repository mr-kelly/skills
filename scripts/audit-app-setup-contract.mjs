import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const skillsRoot = path.join(root, "skills");
const testsRoot = path.join(root, "tests", "app-skills");
const json = process.argv.includes("--json");
const strict = process.argv.includes("--strict");

const exists = async (file) =>
  readFile(file, "utf8").then(
    (value) => value,
    () => "",
  );

const entries = await readdir(skillsRoot, { withFileTypes: true });
const results = [];

for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const skill = entry.name;
  const appRoot = path.join(skillsRoot, skill, "app");
  const packageJson = await exists(path.join(appRoot, "package.json"));
  if (!packageJson) continue;
  const [server, blueprint, skillDoc, cloudTest] = await Promise.all([
    exists(path.join(appRoot, "server.js")),
    exists(path.join(appRoot, "airapp-blueprint.json")),
    exists(path.join(skillsRoot, skill, "SKILL.md")),
    exists(path.join(testsRoot, skill, "cloud_oauth_test.py")),
  ]);
  const browserFiles = await readdir(path.join(appRoot, "app"), { recursive: true }).catch(() => []);
  const browserSource = (
    await Promise.all(
      browserFiles
        .filter((file) => /\.(?:js|html)$/.test(String(file)))
        .map((file) => exists(path.join(appRoot, "app", String(file)))),
    )
  ).join("\n");
  const onboardingSource = `${blueprint}\n${skillDoc}\n${server}\n${browserSource}`;
  const findings = [];
  if (!server.includes("createBusabaseAirAppLocalGateway")) findings.push("copied-auth-gateway");
  if (server.includes('header("x-busabase-space")')) findings.push("inbound-space-header-trusted");
  if (!server.includes("/auth/space")) findings.push("missing-space-route");
  if (!browserSource.includes("/auth/space")) findings.push("missing-space-selector");
  if (/"BUSABASE_SPACE_ID"\s*:\s*config\[/.test(cloudTest)) {
    findings.push("cloud-test-preselects-space");
  }
  if (!/onboarding[_ -]?version/i.test(onboardingSource)) findings.push("missing-onboarding-version");
  results.push({ skill, findings });
}

const counts = results.reduce((summary, result) => {
  for (const finding of result.findings) summary[finding] = (summary[finding] || 0) + 1;
  return summary;
}, {});

if (json) {
  console.log(JSON.stringify({ apps: results.length, counts, results }, null, 2));
} else {
  console.log(`App setup contract audit: ${results.length} canonical app(s)`);
  for (const [finding, count] of Object.entries(counts).sort()) {
    console.log(`${String(count).padStart(3)}  ${finding}`);
  }
  for (const result of results.filter((item) => item.findings.length)) {
    console.log(`${result.skill}: ${result.findings.join(", ")}`);
  }
}

if (strict && results.some((result) => result.findings.length)) process.exitCode = 1;
