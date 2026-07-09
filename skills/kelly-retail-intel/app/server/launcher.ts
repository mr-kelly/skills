#!/usr/bin/env node
import { spawn } from "node:child_process";
import net from "node:net";
import { DEFAULT_HOST, DEFAULT_PORT } from "./paths.ts";

function canListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, DEFAULT_HOST);
  });
}

async function findPort() {
  for (let port = DEFAULT_PORT; port <= 4000; port += 1) {
    if (await canListen(port)) return port;
  }
  throw new Error("No free local port between 3000 and 4000.");
}

const port = await findPort();
const child = spawn(process.execPath, [new URL("./index.ts", import.meta.url).pathname], {
  stdio: "inherit",
  env: { ...process.env, PORT: String(port) },
});
child.on("exit", (code) => process.exit(code ?? 0));
