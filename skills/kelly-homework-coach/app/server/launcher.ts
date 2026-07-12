import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import { DATA_DIR } from "../../lib/paths.ts";

const HOST = "127.0.0.1";
const MIN_PORT = 3000;
const MAX_PORT = 4000;
const SERVER_STATE_PATH = `${DATA_DIR}/server.json`;

interface ServerState {
  app?: string;
  pid?: number;
  port?: number;
  url?: string;
  started_at?: string;
}

async function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, HOST);
  });
}

async function health(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://${HOST}:${port}/api/health`, { signal: AbortSignal.timeout(400) });
    if (!response.ok) return false;
    const data = (await response.json()) as Record<string, unknown>;
    return data.app === "kelly-homework-coach";
  } catch {
    return false;
  }
}

async function readServerState(): Promise<ServerState | null> {
  try {
    return JSON.parse(await fs.readFile(SERVER_STATE_PATH, "utf8")) as ServerState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    return null;
  }
}

async function writeServerState(state: ServerState): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SERVER_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

async function removeServerState(pid?: number): Promise<void> {
  const current = await readServerState();
  if (pid && current?.pid && current.pid !== pid) return;
  await fs.rm(SERVER_STATE_PATH, { force: true });
}

function pidAlive(pid?: number): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForHealth(port: number, timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await health(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

async function choosePort(): Promise<{ port: number; reused: boolean }> {
  const existing = await readServerState();
  if (existing?.port) {
    if (await health(existing.port)) return { port: existing.port, reused: true };
    if (pidAlive(existing.pid)) {
      if (await waitForHealth(existing.port)) return { port: existing.port, reused: true };
      console.log(
        `Kelly Homework Coach is already starting at ${existing.url || `http://${HOST}:${existing.port}`} (pid ${existing.pid}); not launching another copy.`,
      );
      process.exit(0);
    }
    await removeServerState();
  }

  const requested = Number(process.env.KELLY_HOMEWORK_COACH_UI_PORT || 0);
  const candidates = requested ? [requested] : Array.from({ length: MAX_PORT - MIN_PORT + 1 }, (_, i) => MIN_PORT + i);
  for (const port of candidates) {
    if (await health(port)) return { port, reused: true };
    if (await isPortFree(port)) return { port, reused: false };
  }
  throw new Error(`No free port found between ${MIN_PORT} and ${MAX_PORT}`);
}

const { port, reused } = await choosePort();
const url = `http://${HOST}:${port}`;

if (reused) {
  console.log(`Kelly Homework Coach already running at ${url}`);
  process.exit(0);
}

const child = spawn(process.execPath, ["app/server/index.ts"], {
  cwd: new URL("../..", import.meta.url).pathname,
  env: { ...process.env, PORT: String(port), HOMEWORK_COACH_HOST: HOST },
  stdio: "inherit",
});

await writeServerState({
  app: "kelly-homework-coach",
  pid: child.pid,
  port,
  url,
  started_at: new Date().toISOString(),
});

console.log(`Kelly Homework Coach starting at ${url}`);
child.on("exit", async (code) => {
  await removeServerState(child.pid);
  process.exit(code ?? 0);
});
