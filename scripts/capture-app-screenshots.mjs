#!/usr/bin/env node
// Capture deterministic App-in-Skill screenshots from existing screenshot paths.
//
// Usage:
//   node scripts/capture-app-screenshots.mjs --dry-run
//   node scripts/capture-app-screenshots.mjs --skill kelly-email --frame
//   node scripts/capture-app-screenshots.mjs --all --frame

import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = process.env.AIRAPP_SCREENSHOT_ROOT
  ? path.resolve(process.env.AIRAPP_SCREENSHOT_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);
const HOST = "127.0.0.1";
const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const PHONE_VIEWPORT = { width: 390, height: 844 };
const BASE_PORT = 33100;
const SCREENSHOT_WEBP_QUALITY = 85;

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
  "kelly-legal-casebase-ingest": {
    detail: "/items/ingest-lease-arrears",
    "needs-review": "/review",
    workbench: "/items/ingest-lease-arrears",
    "mobile-detail": "/items/ingest-lease-arrears",
  },
  "kelly-legal-firm-radar": {
    "needs-review": "/review",
    workbench: "/items/insight-real-estate-growth",
  },
  "kelly-legal-matter-strategy": {
    "needs-review": "/review",
    workbench: "/items/strategy-saas-arrears",
  },
  "kelly-legal-contracts": {
    playbook: "/claims",
    contracts: "/products",
  },
  "kelly-legal-precedent-desk": {
    "needs-review": "/review",
    workbench: "/items/pack-lease-break",
  },
  "kelly-writer": {
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
  "kelly-money": {
    detail: "/invoices/inv-render-20260625",
  },
  "kelly-invest-stock": {
    overview: "/strategies",
    detail: "/strategies/buffett/portfolio",
    regression: "/regression",
  },
  "kelly-jobhunt": {
    overview: "/to-send",
    "to-send": "/to-send",
    list: "/to-send",
    detail: "/to-send/company-lanxi",
    profile: "/profile",
    sent: "/sent",
    blocked: "/all/company-maimang",
  },
  "kelly-sales-outreach": {
    overview: "/to-send",
    "to-send": "/to-send",
    profile: "/profile",
    sent: "/sent",
    blocked: "/all/company-yunhe",
  },
  "kelly-instructor-sourcing": {
    all: "/all",
    criteria: "/criteria",
    qualified: "/qualified",
    connected: "/connected",
  },
  "kelly-ideas": {
    overview: "/overview",
    "idea-detail": "/ideas/idea-email",
    questions: "/ideas/idea-vague/questions",
    documents: "/ideas/idea-email/prd",
  },
  "kelly-wechat-crm": {
    people: "/people/wechat-person-xiaoyu",
    groups: "/groups/wechat-group-product",
    snapshots: "/relationship-snapshots/wechat-snapshot-xiaoyu-20260825",
    goals: "/goals/new",
    actions: "/actions/wechat-action-xiaoyu",
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
    matrix: false,
    baseline: false,
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
    else if (arg === "--matrix") args.matrix = true;
    else if (arg === "--baseline") args.baseline = true;
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
  node scripts/capture-app-screenshots.mjs --path skills/foo/assets/screenshots/overview.webp
  node scripts/capture-app-screenshots.mjs --matrix --all

Options:
  --all       Capture all tracked App-in-Skill screenshot paths as WebP.
  --skill     Limit to one skill folder under skills/. May be repeated.
  --path      Limit to one screenshot path. May be repeated.
  --frame     Run scripts/frame-screenshots.mjs --force after capture.
  --dry-run   Print planned captures without launching apps or writing files.
  --limit     Capture only the first N planned paths.
  --matrix    Capture light/dark desktop/phone cells under .tmp and assert layout.
  --baseline  With --matrix, capture all four cells without enforcing new acceptance assertions.
`);
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
    .replace(/\.(png|svg|webp)$/i, "")
    .replace(/[.-]zh-CN$/, "");
}

function languageFor(file) {
  return /[.-]zh-CN\.(png|svg|webp)$/i.test(file) ? "zh-CN" : "en";
}

function isMobile(file) {
  const stem = screenshotStem(file);
  return stem.startsWith("mobile-") || stem.endsWith("-mobile");
}

function routeStem(file) {
  return screenshotStem(file)
    .replace(/^mobile-/, "")
    .replace(/-mobile$/, "");
}

async function screenshotFiles(args) {
  let files;
  if (args.paths.length) {
    files = args.paths.map((p) => path.resolve(ROOT, p));
  } else {
    let skillNames = args.skills;
    if (!skillNames.length) {
      const entries = await readdir(path.join(ROOT, "skills"), { withFileTypes: true });
      skillNames = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    }
    const dirs = skillNames.map((skill) => path.join(ROOT, "skills", skill, "assets", "screenshots"));
    files = [];
    for (const dir of dirs) {
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (entry.isFile()) files.push(path.join(dir, entry.name));
      }
    }
  }

  const filtered = [];
  for (const file of files) {
    if (!/\/assets\/screenshots\/[^/]+\.(png|svg|webp)$/i.test(relPath(file))) continue;
    if (/\.original\./i.test(file)) continue;
    try {
      if ((await stat(file)).isFile()) filtered.push(file);
    } catch {}
  }
  return filtered.sort();
}

function screenshotOutputPath(file) {
  return file.replace(/\.(png|svg)$/i, ".webp");
}

function routeFor(file) {
  const skill = skillNameFor(file);
  const cleanStem = routeStem(file);
  return ROUTE_OVERRIDES[skill]?.[cleanStem] || GENERIC_ROUTE_MAP[cleanStem] || `/${cleanStem}`;
}

function urlFor(file, port) {
  const lang = languageFor(file);
  const route = routeFor(file);
  const params = new URLSearchParams({ demo: "1", lang });
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
    server.listen(port);
  });
}

async function nextPort(start) {
  for (let port = start; port < start + 800; port += 1) {
    if (await canListen(port)) return port;
  }
  throw new Error(`Could not find an open port from ${start}`);
}

function waitForReady(port, skill, timeoutMs = 30000) {
  // kelly-email keeps a different (pre-Busabase-only) server shape with no /health route;
  // it exposes readiness via /api/state instead.
  const path = skill === "kelly-email" ? "/api/state?demo=overview" : "/health";
  const isReady = (data) => (skill === "kelly-email" ? data.app === skill : Boolean(data.ok));
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`http://${HOST}:${port}${path}`, { timeout: 700 }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            const data = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300 && isReady(data)) {
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
  const appDir = path.join(ROOT, "skills", skill, "content", `${skill}-app`);
  const child = spawn(process.execPath, ["server.js"], {
    cwd: appDir,
    env: {
      ...process.env,
      PORT: String(port),
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
  const chromePath = CHROME_CANDIDATES.find((candidate) => {
    try {
      return candidate && statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
  if (!chromePath)
    throw new Error(`Chrome not found. Set CHROME_PATH or install one of: ${CHROME_CANDIDATES.join(", ")}`);
  const userDataDir = path.join(ROOT, ".tmp", "capture-app-screenshots-chrome");
  await rm(userDataDir, { recursive: true, force: true });
  await mkdir(userDataDir, { recursive: true });
  const port = await nextPort(34100);
  const child = spawn(
    chromePath,
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
  // Mobile shots show the full scrolled page (phone-bezel screenshots conventionally
  // show all content, not just the above-the-fold slice); desktop shots show the
  // app shell as a user would actually see it on first load, so they stay viewport-clipped.
  let captureBeyondViewport = false;
  if (isMobile(file)) {
    await tab.send("Runtime.evaluate", {
      expression: `(() => {
        const style = document.createElement("style");
        style.textContent = "html,body{height:auto!important;overflow:visible!important;}" +
          "*{max-height:none!important;}";
        document.head.appendChild(style);
        document.querySelectorAll("*").forEach((el) => {
          const cs = getComputedStyle(el);
          if (cs.overflowY === "auto" || cs.overflowY === "scroll" || cs.height === "100vh") {
            el.style.setProperty("overflow", "visible", "important");
            el.style.setProperty("height", "auto", "important");
            el.style.setProperty("max-height", "none", "important");
          }
        });
      })()`,
    });
    await wait(100);
    const heightResult = await tab.send("Runtime.evaluate", {
      expression: "Math.min(document.documentElement.scrollHeight, 15000)",
      returnByValue: true,
    });
    const fullHeight = Math.max(Number(heightResult.result?.value) || viewport.height, viewport.height);
    await tab.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: fullHeight,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await wait(100);
    captureBeyondViewport = true;
  }
  const png = await tab.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport,
  });
  const pngBuffer = Buffer.from(png.data, "base64");
  const output =
    path.extname(file).toLowerCase() === ".webp"
      ? await sharp(pngBuffer).webp({ quality: SCREENSHOT_WEBP_QUALITY, effort: 4 }).toBuffer()
      : pngBuffer;
  await writeFile(file, output);
  return { url, viewport };
}

async function captureMatrixCell(tab, skill, serverPort, scheme, viewportName, viewport, outputRoot) {
  await tab.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewportName === "phone",
  });
  await tab.send("Emulation.setEmulatedMedia", {
    media: "",
    features: [{ name: "prefers-color-scheme", value: scheme }],
  });
  await tab.send("Page.enable");
  await tab.send("Runtime.enable");
  await tab.send("Page.navigate", { url: `http://${HOST}:${serverPort}/?demo=1` });
  await waitForPageStable(tab);

  const evaluated = await tab.send("Runtime.evaluate", {
    expression: `(() => {
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const clipped = [...document.querySelectorAll("button, .badge, th, .sidebar a, .sidebar button, .nav-item")]
        .filter((element) => visible(element) && element.textContent.trim() && !element.classList.contains("has-tooltip"))
        .filter((element) => element.scrollWidth > element.clientWidth + 3 || element.scrollHeight > element.clientHeight + 3)
        .slice(0, 20)
        .map((element) => ({
          selector: element.className || element.tagName.toLowerCase(),
          text: element.textContent.trim().replace(/\\s+/g, " ").slice(0, 80),
          client: [element.clientWidth, element.clientHeight],
          scroll: [element.scrollWidth, element.scrollHeight]
        }));
      const surface = (selector, stickyOnly = false) => {
        const element = [...document.querySelectorAll(selector)].find(
          (candidate) => !stickyOnly || getComputedStyle(candidate).position === "sticky"
        );
        return element ? getComputedStyle(element).backgroundColor : null;
      };
      const pageBackground = [".app-shell", ".shell", "#app", "main", "body", ".sidebar", ".list-panel", ".detail-panel", ".content"]
        .map((selector) => document.querySelector(selector))
        .filter(Boolean)
        .map((element) => getComputedStyle(element).backgroundColor)
        .find((color) => color !== "transparent" && color !== "rgba(0, 0, 0, 0)") || "transparent";
      const parseColor = (value) => {
        const match = value.match(/rgba?\(([^)]+)\)/);
        if (!match) return null;
        const parts = match[1].replace("/", " ").split(/[\s,]+/).filter(Boolean);
        if (parts.length < 3) return null;
        const alpha = parts[3]?.endsWith("%") ? Number.parseFloat(parts[3]) / 100 : Number(parts[3] ?? 1);
        return [Number(parts[0]), Number(parts[1]), Number(parts[2]), alpha];
      };
      const luminance = (color) => {
        const channels = color.slice(0, 3).map((channel) => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      const contrast = (foreground, background) => {
        const first = luminance(foreground);
        const second = luminance(background);
        return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
      };
      const identity = (element) => element.tagName.toLowerCase() +
        (element.id ? "#" + element.id : "") +
        (element.classList.length ? "." + [...element.classList].slice(0, 3).join(".") : "");
      const ignoredTags = new Set(["IMG", "SVG", "CANVAS", "IFRAME", "VIDEO"]);
      const visibleElements = [...document.body.querySelectorAll("*")]
        .filter((element) => visible(element) && !ignoredTags.has(element.tagName));
      const brightSurfaces = visibleElements
        .filter((element) => {
          const color = parseColor(getComputedStyle(element).backgroundColor);
          const rect = element.getBoundingClientRect();
          return color && color[3] > 0.8 && luminance(color) > 0.8 && rect.width * rect.height > 1200;
        })
        .slice(0, 30)
        .map(identity);
      const brightBackgroundImages = visibleElements
        .filter((element) => !element.closest(".demo-visuals-panel"))
        .filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          if (style.backgroundImage === "none" || rect.width * rect.height <= 1200) return false;
          return [...style.backgroundImage.matchAll(/rgba?\([^)]+\)/g)]
            .map((match) => parseColor(match[0]))
            .some((color) => color && color[3] > 0.8 && luminance(color) > 0.8 && Math.max(...color.slice(0, 3)) - Math.min(...color.slice(0, 3)) < 20);
        })
        .slice(0, 30)
        .map(identity);
      const lowContrastText = visibleElements
        .filter((element) => [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()))
        .map((element) => {
          const foreground = parseColor(getComputedStyle(element).color);
          let ancestor = element;
          let background = null;
          while (ancestor && !background) {
            const candidate = parseColor(getComputedStyle(ancestor).backgroundColor);
            if (candidate && candidate[3] > 0.8) background = candidate;
            ancestor = ancestor.parentElement;
          }
          return foreground && background
            ? { selector: identity(element), ratio: contrast(foreground, background), text: element.textContent.trim().slice(0, 80) }
            : null;
        })
        .filter((result) => result && result.ratio < 3)
        .slice(0, 30);
      const overlapArea = (first, second) => {
        if (!first || !second || !visible(first) || !visible(second)) return 0;
        if (first.contains(second) || second.contains(first)) return 0;
        const a = first.getBoundingClientRect();
        const b = second.getBoundingClientRect();
        return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
          Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      };
      const layoutOverlaps = [
        [".demo-visuals-panel", ".content"],
        [".demo-visuals-grid", ".metrics"]
      ]
        .map(([first, second]) => ({ first, second, area: overlapArea(document.querySelector(first), document.querySelector(second)) }))
        .filter((result) => result.area > 1);
      return {
        overflow: document.documentElement.scrollWidth <= window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        pageBackground,
        panelHeading: surface(".panel-heading", true),
        modalHeader: surface(".modal-header"),
        clipped,
        brightSurfaces,
        brightBackgroundImages,
        lowContrastText,
        layoutOverlaps
      };
    })()`,
    returnByValue: true,
  });
  const evidence = evaluated.result?.value;
  const screenshot = await tab.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const outputDir = path.join(outputRoot, skill);
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${scheme}-${viewportName}.png`);
  await writeFile(outputPath, Buffer.from(screenshot.data, "base64"));
  return { ...evidence, outputPath };
}

async function runMatrix(args) {
  let skills = execFileSync("git", ["ls-files", "skills"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter((filePath) => filePath.startsWith("skills/kelly-") && filePath.endsWith("/app/index.html"))
    .map((filePath) => filePath.split("/")[1])
    .sort();
  if (args.skills.length) skills = skills.filter((skill) => args.skills.includes(skill));
  if (args.limit) skills = skills.slice(0, args.limit);
  if (args.dryRun) {
    for (const skill of skills) console.log(`would check ${skill}: light/dark x desktop/phone`);
    return;
  }

  const chrome = await launchChrome();
  const failures = [];
  const outputRoot = path.resolve(
    process.env.BASE_UI_MATRIX_OUTPUT_DIR ||
      path.join(ROOT, ".tmp", args.baseline ? "base-ui-before" : "base-ui-matrix"),
  );
  let next = BASE_PORT;
  try {
    for (const skill of skills) {
      const port = await nextPort(next);
      next = port + 1;
      let server;
      try {
        server = await startServer(skill, port);
        const tab = await newTab(chrome.port);
        try {
          const results = new Map();
          for (const [viewportName, viewport] of Object.entries({ desktop: DESKTOP_VIEWPORT, phone: PHONE_VIEWPORT })) {
            for (const scheme of ["light", "dark"]) {
              const result = await captureMatrixCell(tab, skill, port, scheme, viewportName, viewport, outputRoot);
              results.set(`${scheme}-${viewportName}`, result);
              if (!args.baseline && !result.overflow) {
                failures.push(
                  `${skill} ${scheme}-${viewportName}: ${result.scrollWidth}px > ${result.viewportWidth}px`,
                );
              }
              if (!args.baseline && result.clipped.length) {
                failures.push(`${skill} ${scheme}-${viewportName}: clipped text ${JSON.stringify(result.clipped)}`);
              }
              if (!args.baseline && result.layoutOverlaps.length) {
                failures.push(
                  `${skill} ${scheme}-${viewportName}: overlapping work surfaces ${JSON.stringify(result.layoutOverlaps)}`,
                );
              }
              if (!args.baseline && scheme === "dark" && result.brightSurfaces.length) {
                failures.push(
                  `${skill} dark-${viewportName}: bright surfaces ${JSON.stringify(result.brightSurfaces)}`,
                );
              }
              if (!args.baseline && scheme === "dark" && result.brightBackgroundImages.length) {
                failures.push(
                  `${skill} dark-${viewportName}: bright background images ${JSON.stringify(result.brightBackgroundImages)}`,
                );
              }
              if (!args.baseline && scheme === "dark" && result.lowContrastText.length) {
                failures.push(
                  `${skill} dark-${viewportName}: text contrast below 3:1 ${JSON.stringify(result.lowContrastText)}`,
                );
              }
            }
          }
          for (const viewportName of args.baseline ? [] : ["desktop", "phone"]) {
            const light = results.get(`light-${viewportName}`);
            const dark = results.get(`dark-${viewportName}`);
            if (light.pageBackground === dark.pageBackground) {
              failures.push(`${skill} ${viewportName}: page background does not change in dark mode`);
            }
            for (const [label, key] of [
              [".panel-heading", "panelHeading"],
              [".modal-header", "modalHeader"],
            ]) {
              if (light[key] && dark[key] && light[key] === dark[key]) {
                failures.push(`${skill} ${viewportName}: ${label} background does not change in dark mode`);
              }
            }
          }
          console.log(`PASS ${skill} (${args.baseline ? "baseline evidence" : "4 cells"})`);
        } finally {
          tab.close();
        }
      } catch (error) {
        failures.push(`${skill}: ${error instanceof Error ? error.message : error}`);
      } finally {
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

  console.log(`Matrix checked ${skills.length} apps and ${skills.length * 4} cells.`);
  console.log(`Screenshots: ${outputRoot}`);
  if (failures.length) throw new Error(`Matrix failures (${failures.length}):\n${failures.join("\n")}`);
}

async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))));
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.matrix) {
    await runMatrix(args);
    return;
  }
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
      console.log(
        `${args.dryRun ? "would capture" : "capture"} ${relPath(screenshotOutputPath(file))} <- ${urlFor(file, "PORT")}`,
      );
    }
  }
  if (args.dryRun) return;

  const chrome = await launchChrome();
  let next = BASE_PORT;
  const failedSkills = [];
  const succeededFiles = [];
  try {
    for (const [skill, skillFiles] of bySkill) {
      const port = await nextPort(next);
      next = port + 1;
      console.log(`\n[${skill}] starting on ${port} (${skillFiles.length} captures)`);
      let server;
      try {
        server = await startServer(skill, port);
      } catch (error) {
        console.error(`  skipping ${skill}: ${error instanceof Error ? error.message : error}`);
        failedSkills.push(skill);
        continue;
      }
      const tab = await newTab(chrome.port);
      try {
        for (const file of skillFiles) {
          const target = screenshotOutputPath(file);
          try {
            const { viewport } = await captureOne(tab, target, port);
            if (target !== file) await rm(file, { force: true });
            console.log(`captured ${relPath(target)} ${viewport.width}x${viewport.height}`);
            succeededFiles.push(target);
          } catch (error) {
            console.error(`  failed ${relPath(target)}: ${error instanceof Error ? error.message : error}`);
            failedSkills.push(skill);
          }
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

  if (args.frame && succeededFiles.length) {
    console.log("\nFraming screenshots...");
    const frameArgs = ["scripts/frame-screenshots.mjs", "--force"];
    for (const file of succeededFiles) frameArgs.push("--path", relPath(file));
    await runCommand(process.execPath, frameArgs);
  }

  if (failedSkills.length) {
    console.log(`\nFailed skills: ${[...new Set(failedSkills)].join(", ")}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
