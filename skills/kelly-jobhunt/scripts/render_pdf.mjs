// Turns a local HTML file into a PDF, trying every renderer this machine has.
//
// Kept apart from build_resume.mjs so the fallback chain can be tested without a
// Busabase connection: the failure this exists for (headless Chrome dying at
// startup on a box with no session bus) only ever shows up at run time.
import { spawn } from "node:child_process";
import { globSync, statSync } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Playwright's own Chromium counts as an installed browser. On a CI image or a
// container that never had desktop Chrome, it is usually the only one present.
export function playwrightChromiums() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), ".cache", "ms-playwright");
  try {
    return [
      ...globSync("chromium*/chrome-linux/chrome", { cwd: root }),
      ...globSync("chromium*/chrome-mac/Chromium.app/Contents/MacOS/Chromium", { cwd: root }),
      ...globSync("chromium*/chrome-win/chrome.exe", { cwd: root }),
    ].map((relative) => path.join(root, relative));
  } catch {
    return [];
  }
}

export function chromeCandidates() {
  return [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ...playwrightChromiums(),
  ].filter(Boolean);
}

export const findChromes = (candidates = chromeCandidates()) =>
  candidates.filter((candidate) => {
    try {
      return statSync(candidate).isFile();
    } catch {
      return false;
    }
  });

// A PDF is "real" only if it exists and has some bytes. Chrome can exit 0 having
// written nothing at all, so the exit code alone is not the verdict.
const pdfWritten = async (pdfPath) => ((await stat(pdfPath).catch(() => null))?.size ?? 0) > 1000;

// Chrome prints a PDF straight from the command line. Driving it over CDP would
// need a WebSocket global and a live debugging port for no extra benefit here —
// there is nothing to interact with, just one static page to typeset.
/**
 * @param {string} chromePath
 * @param {string} htmlPath
 * @param {string} pdfPath
 * @param {{ userDataDir: string }} options
 * @returns {Promise<{ code: number, stderr: string }>}
 */
export async function printWithChromeCli(chromePath, htmlPath, pdfPath, { userDataDir }) {
  await rm(userDataDir, { recursive: true, force: true });
  await mkdir(userDataDir, { recursive: true });

  const result = await new Promise((resolve) => {
    const child = spawn(
      chromePath,
      [
        "--headless=new",
        `--user-data-dir=${userDataDir}`,
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--no-pdf-header-footer",
        // Headless Chrome in a container has no sandbox of its own and a tiny
        // /dev/shm; without these it dies during startup rather than at the page.
        "--no-sandbox",
        "--disable-dev-shm-usage",
        `--print-to-pdf=${pdfPath}`,
        `file://${htmlPath}`,
      ],
      // Keep stderr: "Chrome 挂了" without the reason is not a diagnosis.
      // Chrome logs "Failed to connect to the bus" on any machine without a
      // session bus and still prints fine, so stderr alone is not a verdict —
      // only the exit code plus a written file is.
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => resolve({ code: -1, stderr: error.message }));
    child.on("exit", (code) => resolve({ code: code ?? -1, stderr }));
  });

  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  return result;
}

// Same engine, driven through the library instead of the command line. Worth a
// second attempt because it does its own launch — different flags, its own temp
// dirs, its own crash handling — so an environment that breaks the CLI often
// survives it. Optional dependency: absent on most machines, and that is fine.
export async function printWithPlaywright(htmlPath, pdfPath) {
  // Resolved at run time only. Playwright is a fallback, not a dependency of
  // this skill, so a literal specifier here would make the typechecker demand a
  // package that is legitimately absent on most machines.
  const playwright = "playwright";
  const { chromium } = await import(playwright);
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage();
    await page.goto(`file://${htmlPath}`, { waitUntil: "load" });
    await page.pdf({ path: pdfPath, format: "A4", printBackground: true });
  } finally {
    await browser.close();
  }
}

/**
 * Returns { renderer, attempts } on success. Throws with every attempt spelled
 * out on failure — a renderer that failed silently is why this file exists.
 *
 * @param {string} htmlPath
 * @param {string} pdfPath
 * @param {{ userDataDir: string, log?: (line: string) => void, candidates?: string[] }} options
 */
export async function renderPdf(htmlPath, pdfPath, { userDataDir, log = () => {}, candidates }) {
  const attempts = [];

  for (const chromePath of findChromes(candidates ?? chromeCandidates())) {
    const { code, stderr } = await printWithChromeCli(chromePath, htmlPath, pdfPath, { userDataDir });
    if (code === 0 && (await pdfWritten(pdfPath))) return { renderer: `chrome-cli:${chromePath}`, attempts };
    const tail = stderr ? `\n    ${stderr.trim().split("\n").slice(-3).join("\n    ")}` : "";
    attempts.push(`Chrome 命令行 ${chromePath}：退出码 ${code}${tail}`);
  }

  try {
    await printWithPlaywright(htmlPath, pdfPath);
    if (await pdfWritten(pdfPath)) {
      if (attempts.length) log("（命令行 Chrome 没成功，改用 Playwright 生成。）");
      return { renderer: "playwright", attempts };
    }
    attempts.push("Playwright：跑完了但没写出 PDF");
  } catch (error) {
    attempts.push(`Playwright：${error instanceof Error ? error.message.split("\n")[0] : error}`);
  }

  const detail = attempts.length
    ? attempts.map((line) => `  - ${line}`).join("\n")
    : "  - 这台机器上没找到任何 Chrome 或 Chromium";
  throw Object.assign(
    new Error(
      [
        "排不出 PDF，下面每种渲染方式都试过了：",
        detail,
        "",
        `HTML 预览仍在 ${htmlPath}，可以自己打开「打印 → 存为 PDF」。`,
        "或者装一个渲染器再重跑：CHROME_PATH=/path/to/chrome，或 npx playwright install chromium。",
      ].join("\n"),
    ),
    { attempts },
  );
}
