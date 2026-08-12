// The resume PDF failed to render on a real machine because the one Chrome the
// script knew about exited -1 at startup. These cover the fallback chain that
// replaced it: try every browser present, then Playwright, then say why.
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  chromeCandidates,
  findChromes,
  playwrightChromiums,
  renderPdf,
} from "../../../skills/kelly-jobhunt/scripts/render_pdf.mjs";

const HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>t</title>
<style>@page { size: A4; margin: 16mm 15mm; }</style></head>
<body><h1>陈某某</h1><p>目标岗位：产品经理</p></body></html>`;

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "jobhunt-pdf-"));
  const htmlPath = join(dir, "resume.html");
  await writeFile(htmlPath, HTML, "utf8");
  return { dir, htmlPath, pdfPath: join(dir, "resume.pdf"), userDataDir: join(dir, "chrome") };
}

const installedChromes = findChromes();

test("renders a PDF with whatever browser this machine has", { skip: installedChromes.length === 0 }, async () => {
  const { htmlPath, pdfPath, userDataDir } = await fixture();
  const { renderer } = await renderPdf(htmlPath, pdfPath, { userDataDir });
  assert.ok(renderer);
  const bytes = await readFile(pdfPath);
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  assert.ok(bytes.length > 1000, `PDF is only ${bytes.length} bytes`);
});

test(
  "a browser that will not start is recorded, and the next one is tried",
  { skip: installedChromes.length === 0 },
  async () => {
    const { dir, htmlPath, pdfPath, userDataDir } = await fixture();

    // Executable, and exits non-zero without writing anything — the shape of the
    // startup crash this fallback exists for.
    const broken = join(dir, "broken-chrome");
    await writeFile(broken, "#!/bin/sh\necho 'Failed to connect to the bus' >&2\nexit 1\n", "utf8");
    await chmod(broken, 0o755);

    const { renderer, attempts } = await renderPdf(htmlPath, pdfPath, {
      userDataDir,
      candidates: [broken, ...installedChromes],
    });

    assert.equal(attempts.length, 1, "the broken browser should be the only recorded failure");
    assert.match(attempts[0], /broken-chrome/);
    assert.match(attempts[0], /退出码 1/);
    // stderr is kept, so the report says why rather than just that.
    assert.match(attempts[0], /Failed to connect to the bus/);
    assert.notEqual(renderer, `chrome-cli:${broken}`);
    assert.equal((await readFile(pdfPath)).subarray(0, 5).toString(), "%PDF-");
  },
);

test("with nothing that can render, it says so and keeps the HTML", async () => {
  const { htmlPath, pdfPath, userDataDir } = await fixture();
  const error = await renderPdf(htmlPath, pdfPath, { userDataDir, candidates: ["/nonexistent/chrome"] }).then(
    () => null,
    (thrown) => thrown,
  );

  assert.ok(error, "expected a throw when no renderer works");
  // The operator is never left without a next step: the HTML preview is still
  // printable by hand, and both install routes are named.
  assert.match(error.message, /HTML 预览仍在/);
  assert.match(error.message, new RegExp(htmlPath.replaceAll("/", "\\/")));
  assert.match(error.message, /CHROME_PATH/);
  assert.match(error.message, /playwright install/);
});

test("Playwright's own Chromium counts as an installed browser", async () => {
  // A CI image installs chromium through Playwright and never has desktop
  // Chrome; before this the script reported "找不到 Chrome" while one sat in the
  // cache directory.
  const root = await mkdtemp(join(tmpdir(), "ms-playwright-"));
  const chrome = join(root, "chromium-1208", "chrome-linux", "chrome");
  await mkdir(join(root, "chromium-1208", "chrome-linux"), { recursive: true });
  await writeFile(chrome, "#!/bin/sh\nexit 0\n", "utf8");
  // The headless shell sits beside it under the same chromium* prefix and is not
  // a drop-in for --print-to-pdf, so it must not be picked up.
  await mkdir(join(root, "chromium_headless_shell-1208", "chrome-linux"), { recursive: true });
  await writeFile(join(root, "chromium_headless_shell-1208", "chrome-linux", "headless_shell"), "", "utf8");

  const key = "PLAYWRIGHT_BROWSERS_PATH";
  const saved = process.env[key];
  process.env[key] = root;
  try {
    assert.deepEqual(playwrightChromiums(), [chrome]);
    assert.ok(chromeCandidates().includes(chrome));
  } finally {
    if (saved === undefined) delete process.env[key];
    else process.env[key] = saved;
  }
});
