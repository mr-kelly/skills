#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import {
  defaultHost,
  defaultPort,
  logPath,
  pidPath,
  preferredPortMax,
  runtimeCacheDir,
  serverDir,
} from "../../lib/paths.mjs";

const host = process.env.KELLY_CONTENT_UI_HOST || defaultHost;
const explicitPort = process.env.KELLY_CONTENT_UI_PORT || "";

function stateUrlFor(port) {
  return `http://${host}:${port}/api/state`;
}

function isReady(port) {
  return new Promise((resolve) => {
    const req = http.get(stateUrlFor(port), { timeout: 500 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          const state = JSON.parse(body);
          resolve(res.statusCode >= 200 && res.statusCode < 300 && state.app === "kelly-content");
        } catch {
          resolve(false);
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(Number.parseInt(port, 10), host);
  });
}

async function findPort() {
  if (explicitPort) return explicitPort;
  for (let candidate = defaultPort; candidate <= preferredPortMax; candidate += 1) {
    const port = String(candidate);
    if (await isReady(port)) return port;
    if (await canListen(port)) return port;
  }
  return String(defaultPort);
}

async function main() {
  await fsp.mkdir(runtimeCacheDir, { recursive: true });
  const port = await findPort();
  if (await isReady(port)) {
    console.log(`Kelly Content UI already running: http://${host}:${port}`);
    return;
  }

  const log = fs.openSync(logPath, "a");
  const child = spawn(process.execPath, ["index.mjs"], {
    cwd: serverDir,
    detached: true,
    stdio: ["ignore", log, log],
    env: { ...process.env, KELLY_CONTENT_UI_HOST: host, KELLY_CONTENT_UI_PORT: port },
  });
  child.unref();
  await fsp.writeFile(pidPath, `${child.pid}\n`);

  for (let i = 0; i < 40; i += 1) {
    if (await isReady(port)) {
      console.log(`Kelly Content UI started: http://${host}:${port}`);
      console.log(`PID: ${child.pid}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
  console.error(`Kelly Content UI did not become ready. See ${logPath}`);
  process.exitCode = 1;
}

await main();
