#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import { spawn } from "node:child_process";
import { DEFAULT_HOST, DEFAULT_PORT, LOG_PATH, PID_PATH, CACHE_DIR, SERVER_DIR } from "./paths.mjs";

const host = process.env.KELLY_EMAIL_UI_HOST || DEFAULT_HOST;
const port = process.env.KELLY_EMAIL_UI_PORT || String(DEFAULT_PORT);
const stateUrl = `http://${host}:${port}/api/state`;

function isReady() {
  return new Promise((resolve) => {
    const req = http.get(stateUrl, { timeout: 500 }, (res) => {
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
    const pid = Number.parseInt((await fsp.readFile(PID_PATH, "utf8")).trim(), 10);
    return Number.isFinite(pid) && pidIsRunning(pid) ? pid : null;
  } catch {
    return null;
  }
}

async function main() {
  await fsp.mkdir(CACHE_DIR, { recursive: true });
  if (await isReady()) {
    console.log(`Kelly Email UI already running: http://${host}:${port}`);
    return;
  }
  const pid = await stalePid();
  if (pid) console.log(`Kelly Email UI process exists but is not ready. PID: ${pid}`);

  const log = fs.openSync(LOG_PATH, "a");
  const child = spawn(process.execPath, ["index.mjs"], {
    cwd: SERVER_DIR,
    detached: true,
    stdio: ["ignore", log, log],
    env: { ...process.env, KELLY_EMAIL_UI_HOST: host, KELLY_EMAIL_UI_PORT: port },
  });
  child.unref();
  await fsp.writeFile(PID_PATH, `${child.pid}\n`);

  for (let i = 0; i < 40; i += 1) {
    if (await isReady()) {
      console.log(`Kelly Email UI started: http://${host}:${port}`);
      console.log(`PID: ${child.pid}`);
      return;
    }
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
  console.error(`Kelly Email UI did not become ready. See ${LOG_PATH}`);
  process.exitCode = 1;
}

await main();
