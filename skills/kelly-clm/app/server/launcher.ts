#!/usr/bin/env node
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const host = process.env.KELLY_CLM_UI_HOST || "127.0.0.1";
const explicitPort = process.env.KELLY_CLM_UI_PORT || "";
const serverDir = dirname(fileURLToPath(import.meta.url));

function isReady(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://${host}:${port}/api/state?demo=1`, { timeout: 500 }, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body).app === "kelly-clm");
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
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(Number.parseInt(port, 10), host);
  });
}

async function findPort() {
  if (explicitPort) return explicitPort;
  for (let port = 3000; port <= 4000; port += 1) {
    if (await isReady(port)) return String(port);
    if (await canListen(String(port))) return String(port);
  }
  return "3000";
}

const port = await findPort();
if (await isReady(port)) {
  console.log(`Kelly CLM UI already running: http://${host}:${port}`);
  process.exit(0);
}

const child = spawn(process.execPath, ["index.ts"], {
  cwd: serverDir,
  detached: true,
  stdio: "ignore",
  env: { ...process.env, KELLY_CLM_UI_HOST: host, KELLY_CLM_UI_PORT: port },
});
child.unref();

for (let i = 0; i < 40; i += 1) {
  if (await isReady(port)) {
    console.log(`Kelly CLM UI started: http://${host}:${port}`);
    console.log(`PID: ${child.pid}`);
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

try {
  process.kill(-child.pid, "SIGTERM");
} catch {}
console.error(`Kelly CLM UI did not become ready from ${join(serverDir, "index.ts")}`);
process.exit(1);
