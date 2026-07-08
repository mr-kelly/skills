#!/usr/bin/env node
// Capture deterministic App-in-Skill screenshots from existing screenshot paths.
//
// Usage:
//   node scripts/capture-app-screenshots.mjs --dry-run
//   node scripts/capture-app-screenshots.mjs --skill kelly-email --frame
//   node scripts/capture-app-screenshots.mjs --all --frame

import { spawn } from "node:child_process";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const HOST = "127.0.0.1";
const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const PHONE_VIEWPORT = { width: 390, height: 844 };
const BASE_PORT = 33100;

const ROUTE_OVERRIDES = {
  "kelly-email": {
    overview: "/all/demo-email-001",
    "inbox-approval": "/approved/demo-email-001",
    "needs-review": "/needs_review/demo-email-006",
    "blocked-security": "/blocked/demo-email-003",
  },
  "kelly-pr-review": {
    overview: "/overview",
    "needs-review": "/needs-review",
    ready: "/ready",
    "blocked-security": "/blocked",
    "needs-test": "/needs-test",
    tested: "/tested",
  },
  "kelly-content": {
    overview: "/overview",
    topics: "/topics",
    main: "/main",
    distribution: "/distribution",
  },
  "kelly-drama": {
    overview: "/overview",
    episodes: "/episodes",
    characters: "/characters",
    relationships: "/relationships",
  },
  "kelly-mv": {
    overview: "/concept",
    storyboard: "/storyboard",
    cast: "/cast",
    song: "/song",
  },
  "kelly-standup": {
    overview: "/today",
  },
};

const GENERIC_ROUTE_MAP = {
  overview: "/overview",
  checks: "/checks",
  "needs-review": "/review",
  review: "/review",
  workbench: "/drafts",
  drafts: "/drafts",
  issues: "/drafts",
  contracts: "/contracts",
  obligations: "/obligations",
  renewals: "/renewals",
  campaigns: "/campaigns",
  deliverability: "/deliverability",
  performance: "/performance",
  creators: "/creators",
  outreach: "/outreach",
  roi: "/roi",
  contacts: "/contacts",
  deals: "/deals",
  followups: "/followups",
  actions: "/actions",
  expiries: "/expiries",
  services: "/services",
  category: "/category",
  family: "/family",
  ledger: "/ledger",
  accounts: "/accounts",
  invoices: "/invoices",
  detail: "/detail",
  assets: "/assets",
  entities: "/entities",
  institutions: "/institutions",
  inbox: "/inbox",
  requests: "/requests",
  roadmap: "/roadmap",
  approvals: "/approvals",
  inquiries: "/inquiries",
  quotes: "/quotes",
  checklist: "/checklist",
  launchday: "/launchday",
  narrative: "/narrative",
  stories: "/stories",
  drift: "/drift",
  plans: "/plans",
  chat: "/chat",
  outbox: "/outbox",
  candidates: "/candidates",
  decisions: "/decisions",
  research: "/research",
  signals: "/signals",
  trends: "/trends",
  exports: "/exports",
  slides: "/slides",
  queries: "/queries",
  pages: "/pages",
  opportunities: "/opportunities",
  geo: "/geo",
  optimize: "/optimize",
  entity: "/entity",
  timeline: "/timeline",
  calendar: "/calendar",
  compose: "/compose",
  engagement: "/engagement",
  blockers: "/blockers",
  members: "/members",
  reminders: "/reminders",
  tickets: "/tickets",
  knowledge: "/knowledge",
  sla: "/sla",
  board: "/board",
  dispatch: "/dispatch",
  intake: "/intake",
  anomalies: "/anomalies",
  orders: "/orders",
  alerts: "/alerts",
  adjustments: "/adjustments",
  platforms: "/platforms",
  positions: "/positions",
};

function parseArgs(argv) {
  const args = {
    dryRun: false,
    all: false,
    frame: false,
    force: false,
    skills: [],
    paths: [],
    limit: 0,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--all") args.all = true;
    else if (arg === "--frame") args.frame = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--skill") args.skills.push(argv[++i]);
    else if (arg.startsWith("--skill=")) args.skills.push(arg.slice("--skill=".length));
    else if (arg === "--path") args.paths.push(argv[++i]);
    else if (arg.startsWith("--path=")) args.paths.push(arg.slice("--path=".length));
    else if (arg === "--limit") args.limit = Number.parseInt(argv[++i], 10) || 0;
    else if (arg.startsWith("--limit=")) args.limit = Number.parseInt(arg.slice("--limit=".length), 10) || 0;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.all && !args.skills.length && !args.paths.length) args.all = true;
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/capture-app-screenshots.mjs --all --frame
  node scripts/capture-app-screenshots.mjs --skill kelly-email --frame
  node scripts/capture-app-screenshots.mjs --path skills/foo/assets/screenshots/overview.png

Options:
  --all       Capture all tracked App-in-Skill screenshot PNG/SVG paths.
  --skill     Limit to one skill folder under skills/. May be repeated.
  --path      Limit to one screenshot path. May be repeated.
  --frame     Run scripts/frame-screenshots.mjs --force after capture.
  --dry-run   Print planned captures without launching apps or writing files.
  --limit     Capture only the first N planned paths.
`);
}

async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

function relPath(abs) {
  return path.relative(ROOT, abs).split(path.sep).join("/");
}

function skillNameFor(file) {
  const parts = relPath(file).split("/");
  return parts[0] === "skills" ? parts[1] : "";
}

function screenshotStem(file) {
  return path
    .basename(file)
    .replace(/\.(png|svg)$/i, "")
    .replace(/-zh-CN$/, "");
}

function languageFor(file) {
  return /-zh-CN\.(png|svg)$/i.test(file) ? "zh-CN" : "en";
}

function isMobile(file) {
  return screenshotStem(file).startsWith("mobile-");
}

async function screenshotFiles(args) {
  let files;
  if (args.paths.length) {
    files = args.paths.map((p) => path.resolve(ROOT, p));
  } else {
    const dirs = args.skills.length
      ? args.skills.map((skill) => path.join(ROOT, "skills", skill, "assets", "screenshots"))
      : [path.join(ROOT, "skills")];
    files = [];
    for (const dir of dirs) files.push(...(await walk(dir)));
  }

  const filtered = [];
  for (const file of files) {
    if (!/\/assets\/screenshots\/[^/]+\.(png|svg)$/i.test(relPath(file))) continue;
    if (/\.original\./i.test(file)) continue;
    try {
      if ((await stat(file)).isFile()) filtered.push(file);
    } catch {}
  }
  return filtered.sort();
}

function envPrefixFor(skill) {
  return skill.toUpperCase().replace(/-/g, "_");
}

function routeFor(file) {
  const skill = skillNameFor(file);
  const stem = screenshotStem(file);
  const cleanStem = stem.replace(/^mobile-/, "");
  return ROUTE_OVERRIDES[skill]?.[cleanStem] || GENERIC_ROUTE_MAP[cleanStem] || `/${cleanStem}`;
}

function urlFor(file, port) {
  const stem = screenshotStem(file).replace(/^mobile-/, "");
  const lang = languageFor(file);
  const route = routeFor(file);
  const params = new URLSearchParams({ demo: stem, lang });
  return `http://${HOST}:${port}/?${params.toString()}#${route}`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForExit(child, timeoutMs = 2500) {
  if (!child || child.exitCode !== null || child.signalCode) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function rmWithRetry(target, attempts = 8) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      await rm(target, { recursive: true, force: true });
      return;
    } catch (error) {
      if (i === attempts - 1) throw error;
      await wait(150 * (i + 1));
    }
  }
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, HOST);
  });
}

async function nextPort(start) {
  for (let port = start; port < start + 800; port += 1) {
    if (await canListen(port)) return port;
  }
  throw new Error(`Could not find an open port from ${start}`);
}

function waitForReady(port, skill, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`http://${HOST}:${port}/api/state?demo=overview`, { timeout: 700 }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            const data = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300 && data.app === skill) {
              resolve();
              return;
            }
          } catch {}
          if (Date.now() > deadline) reject(new Error(`${skill} did not become ready on ${port}`));
          else setTimeout(tick, 250);
        });
      });
      req.on("timeout", () => {
        req.destroy();
      });
      req.on("error", () => {
        if (Date.now() > deadline) reject(new Error(`${skill} did not become ready on ${port}`));
        else setTimeout(tick, 250);
      });
    };
    tick();
  });
}

async function startServer(skill, port) {
  const serverDir = path.join(ROOT, "skills", skill, "app", "server");
  const prefix = envPrefixFor(skill);
  const child = spawn(process.execPath, ["index.ts"], {
    cwd: serverDir,
    env: {
      ...process.env,
      [`${prefix}_UI_HOST`]: HOST,
      [`${prefix}_UI_PORT`]: String(port),
      PORT: String(port),
      NODE_PATH: path.join(ROOT, "node_modules"),
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  try {
    await waitForReady(port, skill);
  } catch (error) {
    stopServer(child);
    const tail = output.trim().split("\n").slice(-12).join("\n");
    throw new Error(`${error.message}${tail ? `\n${tail}` : ""}`);
  }
  return child;
}

function stopServer(child) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {}
  }
}

async function launchChrome() {
  const userDataDir = path.join(ROOT, ".tmp", "capture-app-screenshots-chrome");
  await rm(userDataDir, { recursive: true, force: true });
  await mkdir(userDataDir, { recursive: true });
  const port = await nextPort(34100);
  const child = spawn(
    CHROME_PATH,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "--hide-scrollbars",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  for (let i = 0; i < 80; i += 1) {
    try {
      const tabs = await cdpJson(port, "/json/version");
      if (tabs.webSocketDebuggerUrl) return { child, port, userDataDir };
    } catch {}
    await wait(250);
  }
  child.kill("SIGTERM");
  throw new Error("Chrome did not expose the DevTools endpoint");
}

async function cdpJson(port, pathName) {
  const res = await fetch(`http://${HOST}:${port}${pathName}`);
  if (!res.ok) throw new Error(`Chrome DevTools HTTP ${res.status}`);
  return res.json();
}

async function newTab(chromePort) {
  const res = await fetch(`http://${HOST}:${chromePort}/json/new?about:blank`, { method: "PUT" });
  if (!res.ok) throw new Error(`Could not create Chrome tab: ${res.status}`);
  const tab = await res.json();
  return connectCdp(tab.webSocketDebuggerUrl);
}

function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const callbacks = pending.get(message.id);
    if (!callbacks) return;
    pending.delete(message.id);
    if (message.error) callbacks.reject(new Error(message.error.message || JSON.stringify(message.error)));
    else callbacks.resolve(message.result || {});
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  return {
    async send(method, params = {}) {
      await ready;
      const callId = ++id;
      ws.send(JSON.stringify({ id: callId, method, params }));
      return new Promise((resolve, reject) => pending.set(callId, { resolve, reject }));
    },
    close() {
      try {
        ws.close();
      } catch {}
    },
  };
}

async function waitForPageStable(tab) {
  for (let i = 0; i < 100; i += 1) {
    const result = await tab.send("Runtime.evaluate", {
      expression: `(() => ({
        ready: document.readyState,
        body: !!document.body,
        text: document.body ? document.body.innerText.slice(0, 200) : "",
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight
      }))()`,
      returnByValue: true,
    });
    const value = result.result?.value || {};
    if (value.ready === "complete" && value.body && !/Loading|加载中/i.test(value.text || "")) {
      await wait(450);
      return;
    }
    await wait(150);
  }
}

async function captureOne(tab, file, serverPort) {
  const viewport = isMobile(file) ? PHONE_VIEWPORT : DESKTOP_VIEWPORT;
  await tab.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: isMobile(file),
  });
  await tab.send("Page.enable");
  await tab.send("Runtime.enable");
  const url = urlFor(file, serverPort);
  await tab.send("Page.navigate", { url });
  await waitForPageStable(tab);
  await tab.send("Runtime.evaluate", {
    expression: `(() => {
      document.querySelectorAll(".toast,[role='tooltip'],.tooltip").forEach((node) => node.remove());
      document.documentElement.style.caretColor = "transparent";
      document.body.style.caretColor = "transparent";
      window.scrollTo(0, 0);
    })()`,
  });
  await wait(100);
  const png = await tab.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(file.replace(/\.svg$/i, ".png"), Buffer.from(png.data, "base64"));
  return { url, viewport };
}

async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))));
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let files = await screenshotFiles(args);
  if (args.limit) files = files.slice(0, args.limit);
  if (!files.length) {
    console.log("No screenshot paths found.");
    return;
  }

  const bySkill = new Map();
  for (const file of files) {
    const skill = skillNameFor(file);
    if (!skill) continue;
    if (!bySkill.has(skill)) bySkill.set(skill, []);
    bySkill.get(skill).push(file);
  }

  for (const [skill, skillFiles] of bySkill) {
    for (const file of skillFiles) {
      console.log(`${args.dryRun ? "would capture" : "capture"} ${relPath(file)} -> ${urlFor(file, "PORT")}`);
    }
  }
  if (args.dryRun) return;

  const chrome = await launchChrome();
  let next = BASE_PORT;
  try {
    for (const [skill, skillFiles] of bySkill) {
      const port = await nextPort(next);
      next = port + 1;
      console.log(`\n[${skill}] starting on ${port} (${skillFiles.length} captures)`);
      const server = await startServer(skill, port);
      const tab = await newTab(chrome.port);
      try {
        for (const file of skillFiles) {
          const target = file.replace(/\.svg$/i, ".png");
          const { viewport } = await captureOne(tab, target, port);
          console.log(`captured ${relPath(target)} ${viewport.width}x${viewport.height}`);
        }
      } finally {
        tab.close();
        stopServer(server);
      }
    }
  } finally {
    try {
      chrome.child.kill("SIGTERM");
    } catch {}
    await waitForExit(chrome.child);
    await rmWithRetry(chrome.userDataDir);
  }

  if (args.frame) {
    console.log("\nFraming screenshots...");
    const frameArgs = ["scripts/frame-screenshots.mjs", "--force"];
    if (args.paths.length) {
      for (const file of files) frameArgs.push("--path", relPath(file).replace(/\.svg$/i, ".png"));
    } else {
      for (const skill of bySkill.keys()) frameArgs.push("--skill", skill);
    }
    await runCommand(process.execPath, frameArgs);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
