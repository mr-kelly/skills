#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import { spawn } from "node:child_process";
import { cacheDir, defaultHost, defaultPort, logPath, pidPath, preferredPortMax, serverDir } from "../../lib/paths.mjs";

const host = process.env.KELLY_CONTENT_UI_HOST || defaultHost;
const explicitPort = process.env.KELLY_CONTENT_UI_PORT || "";

function stateUrlFor(port) {
  return `http://${host}:${port}/api/state`;
}

async function isReady(port) {
  return new Promise((resolve) => {
    const req = http.get(stateUrlFor(port), { timeout: 500 }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 300);
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

function pidIsRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function stalePid() {
  try {
    const pid = Number.parseInt((await fsp.readFile(pidPath, "utf8")).trim(), 10);
    return Number.isFinite(pid) && pidIsRunning(pid) ? pid : null;
  } catch {
    return null;
  }
}

async function findPort() {
  if (explicitPort) return explicitPort;
  for (let candidate = defaultPort; candidate <= preferredPortMax; candidate += 1) {
    if (await isReady(String(candidate))) return String(candidate);
  }
  return String(defaultPort);
}

async function main() {
  await fsp.mkdir(cacheDir, { recursive: true });
  const port = await findPort();
  if (await isReady(port)) {
    console.log(`Kelly Content UI already running: http://${host}:${port}/`);
    return;
  }

  const pid = await stalePid();
  if (pid) console.log(`Kelly Content UI process exists but is not ready. PID: ${pid}`);

  const log = fs.openSync(logPath, "a");
  const child = spawn(process.execPath, ["index.mjs"], {
    cwd: serverDir,
    detached: true,
    stdio: ["ignore", log, log],
    env: { ...process.env, KELLY_CONTENT_UI_HOST: host, KELLY_CONTENT_UI_PORT: port }
  });
  child.unref();
  await fsp.writeFile(pidPath, `${child.pid}\n`);

  for (let i = 0; i < 40; i += 1) {
    if (await isReady(port)) {
      console.log(`Kelly Content UI started: http://${host}:${port}/`);
      console.log(`PID: ${child.pid}`);
      return;
    }
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
  console.error(`Kelly Content UI did not become ready. See ${logPath}`);
  process.exitCode = 1;
}

await main();
