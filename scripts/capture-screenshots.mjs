#!/usr/bin/env node
// Refresh App-in-Skill screenshots from deterministic demo URLs, then optionally
// run the shared frame wrapper. The script only overwrites existing PNG files in
// each skill's assets/screenshots directory.
//
// Usage:
//   node scripts/capture-screenshots.mjs --dry-run
//   node scripts/capture-screenshots.mjs --force
//   node scripts/capture-screenshots.mjs --skill kelly-money --force
//   node scripts/capture-screenshots.mjs --no-frame --skill kelly-email
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_DIR = path.join(ROOT, "skills");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const HOST = "127.0.0.1";
const DEFAULT_PORT = 43917;
const DESKTOP_VIEWPORT = { width: 1600, height: 1000 };
const MOBILE_VIEWPORT = { width: 430, height: 932 };

const SCENE_ALIASES = {
  "blocked-security": "blocked",
  "inbox-approval": "review",
  "mobile-detail": "detail",
  "needs-review": "review",
  "needs-test": "needs_test",
  tested: "tested",
};

const SKILL_SCENES = {
  "kelly-clm": { contracts: "contracts", obligations: "obligations", renewals: "renewals" },
  "kelly-content": { overview: "todos" },
  "kelly-devops": { services: "services", expiries: "expiries", actions: "actions" },
  "kelly-email": { overview: "mixed", "inbox-approval": "review", "needs-review": "needs-review" },
  "kelly-finance": { overview: "1", checks: "1" },
  "kelly-legal-casebase-ingest": { workbench: "detail" },
  "kelly-legal-contracts": { issues: "detail" },
  "kelly-legal-firm-radar": { workbench: "detail" },
  "kelly-legal-matter-strategy": { workbench: "detail" },
  "kelly-legal-precedent-desk": { workbench: "detail" },
  "kelly-mv": { overview: "overview" },
  "kelly-pr-review": { ready: "ready", "needs-test": "needs_test" },
  "kelly-scale-pptx": { slides: "slides" },
  "kelly-standup": { overview: "today", blockers: "blockers" },
};

const ROUTE_OVERRIDES = {
  "kelly-clm": {
    contracts: "#/contracts",
    obligations: "#/obligations",
    renewals: "#/renewals",
    approvals: "#/approvals",
  },
  "kelly-content": {
    overview: "#/todos",
    topics: "#/topics",
    main: "#/main",
    distribution: "#/distribution",
  },
  "kelly-email": {
    overview: "#/all",
    "inbox-approval": "#/needs_review",
    "needs-review": "#/needs_review",
    "blocked-security": "#/blocked",
  },
  "kelly-finance": {
    overview: "#/overview",
    checks: "#/checks",
  },
  "kelly-invest-webull": {
    detail: "#/positions/AAPL",
  },
  "kelly-legal-casebase-ingest": {
    "needs-review": "#/review",
    workbench: "#/items",
    "mobile-detail": "#/items/ingest-lease-arrears",
  },
  "kelly-legal-contracts": {
    "needs-review": "#/review",
    issues: "#/drafts/d-msa-liability-us",
  },
  "kelly-legal-firm-radar": {
    "needs-review": "#/review",
    workbench: "#/items",
  },
  "kelly-legal-matter-strategy": {
    "needs-review": "#/review",
    workbench: "#/items",
  },
  "kelly-legal-precedent-desk": {
    "needs-review": "#/review",
    workbench: "#/items",
  },
  "kelly-lesson": { "needs-review": "#/review" },
  "kelly-listing": {
    "needs-review": "#/review",
    drafts: "#/drafts",
  },
  "kelly-mv": {
    overview: "#/concept",
    song: "#/song",
    cast: "#/cast/char-demo-dreamer",
    storyboard: "#/storyboard/shot-demo-01",
  },
  "kelly-money": {
    detail: "#/accounts/stripe-main",
  },
  "kelly-picks": {
    detail: "#/candidates/cand-lunchbox",
  },
  "kelly-pr-review": {
    overview: "#/needs_review",
    "needs-review": "#/needs_review",
    ready: "#/to_approve",
    "blocked-security": "#/blocked",
    "needs-test": "#/needs_test",
    tested: "#/tested",
  },
  "kelly-scale-pptx": {
    overview: "#/overview",
    review: "#/review",
    slides: "#/slides/slide-name-question",
    exports: "#/exports",
  },
  "kelly-social": {
    detail: "#/accounts/x-kelly",
  },
};

function parseArgs(argv) {
  const args = {
    dryRun: false,
    force: false,
    frame: true,
    keepGoing: true,
    skills: [],
    port: DEFAULT_PORT,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--no-frame") args.frame = false;
    else if (arg === "--fail-fast") args.keepGoing = false;
    else if (arg === "--skill") args.skills.push(argv[++i]);
    else if (arg.startsWith("--skill=")) args.skills.push(arg.slice("--skill=".length));
    else if (arg === "--port") args.port = Number.parseInt(argv[++i], 10);
    else if (arg.startsWith("--port=")) args.port = Number.parseInt(arg.slice("--port=".length), 10);
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/capture-screenshots.mjs [--force] [--dry-run] [--no-frame]
  node scripts/capture-screenshots.mjs --skill kelly-money --force

Options:
  --force      Capture even when screenshots already exist.
  --dry-run    Print capture plan without starting apps or writing files.
  --no-frame   Skip the frame-screenshots step after capture.
  --skill      Limit to one skill folder under skills/. May be repeated.
  --port       Local port to reuse while capturing. Defaults to ${DEFAULT_PORT}.
`);
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

function baseName(file) {
  return file.replace(/\.(png|svg)$/i, "").replace(/-zh-CN$/i, "");
}

function langFor(file) {
  return /-zh-CN\.png$/i.test(file) ? "zh" : "en";
}

function sceneFor(skill, base) {
  return SKILL_SCENES[skill]?.[base] || SCENE_ALIASES[base] || base;
}

function routeFor(skill, base) {
  return ROUTE_OVERRIDES[skill]?.[base] || `#/${sceneFor(skill, base)}`;
}

function isMobileShot(base) {
  return base.startsWith("mobile-");
}

function makeUrl(port, skill, file) {
  const base = baseName(file);
  const params = new URLSearchParams({ demo: sceneFor(skill, base), lang: langFor(file) });
  return `http://${HOST}:${port}/?${params}${routeFor(skill, base)}`;
}

async function findSkillDirs(selected) {
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  const skills = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const filtered = selected.length ? skills.filter((skill) => selected.includes(skill)) : skills;
  return filtered;
}

async function shotsForSkill(skill) {
  const dir = path.join(SKILLS_DIR, skill, "assets", "screenshots");
  const appServer = path.join(SKILLS_DIR, skill, "app", "server", "index.ts");
  if (!(await exists(dir)) || !(await exists(appServer))) return [];
  const files = (await readdir(dir))
    .filter((file) => file.toLowerCase().endsWith(".png"))
    .filter((file) => !/\.original\./i.test(file))
    .sort();
  return files.map((file) => ({
    skill,
    file,
    base: baseName(file),
    output: path.join(dir, file),
    server: appServer,
    url: "",
  }));
}

async function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, HOST);
  });
}

async function waitForState(port, skill, timeoutMs = 12_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ok = await new Promise((resolve) => {
      const req = http.get(`http://${HOST}:${port}/api/state?demo=overview&lang=en`, { timeout: 800 }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            const data = JSON.parse(body);
            resolve(data.app === skill || data.app === appNameFallback(skill));
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
    if (ok) return true;
    await delay(250);
  }
  return false;
}

function appNameFallback(skill) {
  const map = {
    "kelly-clm": "kelly-clm",
    "kelly-content": "kelly-content",
    "kelly-scale-pptx": "kelly-scale-pptx",
  };
  return map[skill] || skill;
}

function startServer(skill, port) {
  const serverDir = path.join(SKILLS_DIR, skill, "app", "server");
  const child = spawn(process.execPath, ["index.ts"], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      HOST,
      KELLY_UI_HOST: HOST,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  return { child, output: () => output.trim() };
}

async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(1500).then(() => {
      if (!child.killed) child.kill("SIGKILL");
    }),
  ]);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async open() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`CDP connection timed out: ${this.wsUrl}`)), 8000);
      this.ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      });
      this.ws.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error(`CDP connection failed: ${this.wsUrl}`));
      });
    });
    this.ws.addEventListener("message", (event) => this.handleMessage(event.data));
    this.ws.addEventListener("close", () => {
      for (const { reject } of this.pending.values()) reject(new Error("CDP connection closed"));
      this.pending.clear();
    });
  }

  handleMessage(data) {
    const text = typeof data === "string" ? data : Buffer.from(data).toString("utf8");
    const message = JSON.parse(text);
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject, timer } = this.pending.get(message.id);
      clearTimeout(timer);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message || "CDP error"} (${message.error.code || ""})`));
      else resolve(message.result || {});
      return;
    }
    if (message.method && this.listeners.has(message.method)) {
      for (const listener of this.listeners.get(message.method)) listener(message.params || {});
    }
  }

  send(method, params = {}, timeoutMs = 10_000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  waitForEvent(method, timeoutMs = 10_000) {
    return new Promise((resolve, reject) => {
      const handler = (params) => {
        clearTimeout(timer);
        this.off(method, handler);
        resolve(params);
      };
      const timer = setTimeout(() => {
        this.off(method, handler);
        reject(new Error(`${method} event timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.on(method, handler);
    });
  }

  on(method, handler) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method).add(handler);
  }

  off(method, handler) {
    this.listeners.get(method)?.delete(handler);
  }

  close() {
    this.ws?.close();
  }
}

async function startChrome() {
  const profile = await mkdtemp(path.join(os.tmpdir(), "kelly-skills-capture-"));
  const child = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-sync",
      "--remote-debugging-port=0",
      "--remote-allow-origins=*",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  try {
    const { port, browserPath } = await readDevToolsActivePort(profile, () => output.trim());
    const browser = new CdpClient(`ws://${HOST}:${port}${browserPath}`);
    await browser.open();
    return { child, profile, port, browser };
  } catch (error) {
    child.kill("SIGKILL");
    await rm(profile, { recursive: true, force: true });
    throw error;
  }
}

async function readDevToolsActivePort(profile, output) {
  const file = path.join(profile, "DevToolsActivePort");
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    try {
      const [port, browserPath] = (await readFile(file, "utf8")).trim().split("\n");
      if (port && browserPath) return { port: Number.parseInt(port, 10), browserPath };
    } catch {}
    await delay(100);
  }
  throw new Error(`Chrome did not expose DevToolsActivePort. ${output()}`);
}

async function stopChrome(chrome) {
  if (!chrome) return;
  try {
    await chrome.browser.send("Browser.close", {}, 3000);
  } catch {
    chrome.child.kill("SIGTERM");
  }
  await Promise.race([
    new Promise((resolve) => chrome.child.once("exit", resolve)),
    delay(2500).then(() => chrome.child.kill("SIGKILL")),
  ]);
  chrome.browser.close();
  await rm(chrome.profile, { recursive: true, force: true });
}

async function captureWithChrome(chrome, { url, output, viewport }) {
  const { targetId } = await chrome.browser.send("Target.createTarget", {
    url: "about:blank",
  });
  let page = null;
  try {
    const targets = await httpJson(chrome.port, "/json/list");
    const target = targets.find((item) => item.id === targetId);
    if (!target?.webSocketDebuggerUrl) throw new Error(`Could not find CDP target ${targetId}`);
    page = new CdpClient(target.webSocketDebuggerUrl);
    await page.open();
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.width < 720,
    });
    await page.send("Emulation.setVisibleSize", { width: viewport.width, height: viewport.height }).catch(() => {});
    const loadEvent = page.waitForEvent("Page.loadEventFired", 12_000).catch(() => null);
    await page.send("Page.navigate", { url }, 12_000);
    await loadEvent;
    await waitForRendered(page);
    const { data } = await page.send(
      "Page.captureScreenshot",
      { format: "png", fromSurface: true, captureBeyondViewport: false },
      15_000,
    );
    await writeFile(output, Buffer.from(data, "base64"));
  } finally {
    page?.close();
    await chrome.browser.send("Target.closeTarget", { targetId }).catch(() => {});
  }
}

async function waitForRendered(page) {
  const started = Date.now();
  let lastState = null;
  while (Date.now() - started < 10_000) {
    const result = await page
      .send("Runtime.evaluate", {
        expression: `(() => {
          const text = (document.body && document.body.innerText || "").trim();
          const content = document.querySelector("#content, #app, main, .app, .shell, .layout, .dashboard, table, [data-route], [data-view]");
          const loadingOnly = /^(loading|loading.|加载中|载入中)$/i.test(text);
          return {
            ready: document.readyState,
            textLength: text.length,
            hasContent: Boolean(content),
            loadingOnly,
            title: document.title
          };
        })()`,
        returnByValue: true,
      })
      .catch(() => null);
    lastState = result?.result?.value || lastState;
    if (
      lastState?.ready !== "loading" &&
      lastState?.hasContent &&
      lastState?.textLength > 60 &&
      !lastState.loadingOnly
    ) {
      await page.send(
        "Runtime.evaluate",
        {
          expression:
            "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 250))))",
          awaitPromise: true,
        },
        2000,
      );
      return;
    }
    await delay(250);
  }
  throw new Error(`Page did not render enough content: ${JSON.stringify(lastState)}`);
}

async function httpJson(port, pathName) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://${HOST}:${port}${pathName}`, { timeout: 3000 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`HTTP ${pathName} timed out`));
    });
    req.on("error", reject);
  });
}

async function run(cmd, args, { cwd = ROOT, timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${path.basename(cmd)} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      out += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      out += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(`${path.basename(cmd)} exited ${code}: ${out.trim()}`));
    });
  });
}

async function captureSkill(skill, shots, args) {
  const port = args.port;
  for (const shot of shots) shot.url = makeUrl(port, skill, shot.file);

  console.log(`\n${skill} (${shots.length} shots)`);
  for (const shot of shots) {
    const rel = path.relative(ROOT, shot.output);
    console.log(`  ${args.dryRun ? "would capture" : "capture"} ${rel} <- ${shot.url}`);
  }
  if (args.dryRun) return { captured: shots.length, failed: 0 };

  if (!(await portFree(port))) throw new Error(`Port ${port} is already in use`);
  const server = startServer(skill, port);
  let chrome = null;
  try {
    if (!(await waitForState(port, skill))) {
      throw new Error(`Server did not become ready for ${skill}. ${server.output()}`);
    }
    chrome = await startChrome();
    let captured = 0;
    for (const shot of shots) {
      const viewport = isMobileShot(shot.base) ? MOBILE_VIEWPORT : DESKTOP_VIEWPORT;
      await captureWithChrome(chrome, { url: shot.url, output: shot.output, viewport });
      captured += 1;
      console.log(`  wrote ${path.relative(ROOT, shot.output)}`);
      await delay(150);
    }
    return { captured, failed: 0 };
  } finally {
    await stopChrome(chrome);
    await stopServer(server.child);
  }
}

async function frameScreenshots(args) {
  if (!args.frame || args.dryRun) return;
  const frameArgs = ["scripts/frame-screenshots.mjs", "--force"];
  for (const skill of args.skills) frameArgs.push("--skill", skill);
  console.log("\nFraming screenshots...");
  const output = await run(process.execPath, frameArgs, { timeoutMs: 240_000 });
  console.log(output);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!(await exists(CHROME))) throw new Error(`Chrome not found at ${CHROME}`);

  const skills = await findSkillDirs(args.skills);
  const plan = [];
  for (const skill of skills) {
    const shots = await shotsForSkill(skill);
    if (shots.length) plan.push({ skill, shots });
  }

  if (!plan.length) {
    console.log("No screenshot targets found.");
    return;
  }

  let captured = 0;
  let failed = 0;
  const failures = [];
  for (const item of plan) {
    try {
      const result = await captureSkill(item.skill, item.shots, args);
      captured += result.captured;
      failed += result.failed;
    } catch (error) {
      failed += item.shots.length;
      failures.push(`${item.skill}: ${error instanceof Error ? error.message : error}`);
      console.error(`  failed ${item.skill}: ${error instanceof Error ? error.message : error}`);
      if (!args.keepGoing) break;
    }
  }

  await frameScreenshots(args);

  console.log(`\nCaptured: ${captured}; failed: ${failed}; skills: ${plan.length}`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const failure of failures) console.log(`- ${failure}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
