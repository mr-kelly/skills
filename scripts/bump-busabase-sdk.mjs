#!/usr/bin/env node
// Moves skills to another busabase-sdk version, everywhere that version is recorded.
//
//   node scripts/bump-busabase-sdk.mjs <version> --skills kelly-support,kelly-email
//   node scripts/bump-busabase-sdk.mjs <version> --all [--dry-run] [--jobs 4]
//
// Bumping package.json alone is not an upgrade. The browser never loads node_modules: it
// loads app/vendor/*.js, which `pnpm build:sdk` bundles from the installed SDK. A bump
// that skips the rebuild passes every Node-side test while the app keeps running the old
// SDK, so this rebuilds and `audit:sdk-policy` fails when the two disagree.
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS = path.join(ROOT, "skills");
const PIN = /^\d+\.\d+\.\d+$/;

const args = process.argv.slice(2);
const version = args.find((arg) => PIN.test(arg));
const flag = (name) => args.includes(name);
const option = (name) => args[args.indexOf(name) + 1];

if (!version || (!flag("--all") && !flag("--skills"))) {
  console.error("usage: bump-busabase-sdk.mjs <x.y.z> (--all | --skills a,b) [--dry-run] [--jobs N]");
  process.exit(2);
}

const dryRun = flag("--dry-run");
const jobs = Number(option("--jobs")) || 4;

const readOptional = (file) => fs.readFile(file, "utf8").catch(() => "");
const exists = (file) =>
  fs.access(file).then(
    () => true,
    () => false,
  );

// Text substitution, not parse-and-stringify: it leaves every other byte of the file
// alone, which keeps the diff to the lines that actually changed.
async function repin(file, pattern, replacement) {
  const text = await readOptional(file);
  if (!text || !pattern.test(text)) return false;
  const next = text.replace(pattern, replacement);
  if (next === text) return false;
  if (!dryRun) await fs.writeFile(file, next);
  return true;
}

async function sh(cwd, command, commandArgs) {
  if (dryRun) return;
  await run(command, commandArgs, { cwd, maxBuffer: 64 * 1024 * 1024 });
}

// A skill records the pin in two places, its root and its app, and each is its own pnpm
// project with its own lockfile and its own release-age allowlist. `audit:sdk-policy`
// checks both, so both have to move together.
async function repinProject(dir) {
  const done = [];
  const sdkPin = /("busabase-sdk":\s*")\d+\.\d+\.\d+(")/;
  // Gate on "does this project depend on the SDK", not on "did the pin change". Every
  // step below is idempotent, so a run that died halfway — package.json already moved,
  // lockfile not — finishes on the next one instead of being skipped as already done.
  if (!sdkPin.test(await readOptional(path.join(dir, "package.json")))) return done;

  await repin(path.join(dir, "package.json"), sdkPin, `$1${version}$2`);
  done.push("package.json");

  // Before any install: pnpm's release-age quarantine refuses a version this new unless
  // the workspace names it.
  await repin(path.join(dir, "pnpm-workspace.yaml"), /busabase-sdk@\d+\.\d+\.\d+/, `busabase-sdk@${version}`);
  if (await exists(path.join(dir, "pnpm-workspace.yaml"))) done.push("pnpm-workspace.yaml");

  if (await exists(path.join(dir, "pnpm-lock.yaml"))) {
    await sh(dir, "pnpm", ["install", "--no-frozen-lockfile"]);
    done.push("pnpm-lock.yaml");
  }
  if (await exists(path.join(dir, "package-lock.json"))) {
    await sh(dir, "npm", ["install", "--package-lock-only", "--no-audit", "--no-fund"]);
    done.push("package-lock.json");
  }
  return done;
}

async function bump(name) {
  const skill = path.join(SKILLS, name);
  const app = path.join(skill, "content", `${name}-app`);

  const done = (await repinProject(skill)).map((file) => `${file}`);
  const inApp = await repinProject(app);
  done.push(...inApp.map((file) => `app/${file}`));

  if (inApp.length) {
    const scripts = JSON.parse(await readOptional(path.join(app, "package.json"))).scripts ?? {};
    if (scripts["build:sdk"]) {
      await sh(app, "pnpm", ["build:sdk"]);
      done.push("app/vendor");
    }
  }
  return done;
}

const names = flag("--all")
  ? (await fs.readdir(SKILLS, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  : String(option("--skills")).split(",").filter(Boolean);

const failures = [];
const queue = [...names];
await Promise.all(
  Array.from({ length: Math.min(jobs, queue.length) }, async () => {
    while (queue.length) {
      const name = queue.shift();
      try {
        const done = await bump(name);
        if (done.length) console.log(`${dryRun ? "would bump" : "bumped"} ${name}: ${done.join(", ")}`);
      } catch (error) {
        failures.push(name);
        console.error(
          `FAILED ${name}: ${String(error.stderr || error.message)
            .trim()
            .split("\n")
            .slice(-3)
            .join(" | ")}`,
        );
      }
    }
  }),
);

if (failures.length) {
  console.error(`\n${failures.length} skill(s) failed: ${failures.join(", ")}`);
  process.exit(1);
}
