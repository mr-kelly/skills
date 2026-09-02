import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..");
const BASE_UI = fs.readFileSync(path.join(ROOT, "scripts", "base-ui.css"));

function appDirs() {
  return execFileSync("git", ["ls-files", "skills"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter((filePath) => filePath.startsWith("skills/kelly-") && filePath.endsWith("/app/index.html"))
    .map((filePath) => path.dirname(path.join(ROOT, filePath)))
    .sort();
}

function cssFiles(appDir) {
  const rootCss = fs
    .readdirSync(appDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".css") &&
        entry.name !== "base-ui.css" &&
        entry.name !== "accent-theme.css",
    )
    .map((entry) => path.join(appDir, entry.name));
  const stylesDir = path.join(appDir, "styles");
  const layeredCss = fs.existsSync(stylesDir)
    ? fs
        .readdirSync(stylesDir, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isFile() &&
            entry.name.endsWith(".css") &&
            entry.name !== "layers.css" &&
            entry.name !== "base-ui.css",
        )
        .map((entry) => path.join(stylesDir, entry.name))
    : [];
  return [...rootCss, ...layeredCss];
}

test("all AirApps use the byte-identical shared Base UI in the required cascade order", () => {
  const apps = appDirs();
  assert.equal(apps.length, 70, "update the rollout when an AirApp is added or removed");

  for (const appDir of apps) {
    const relative = path.relative(ROOT, appDir);
    const layered = fs.existsSync(path.join(appDir, "styles", "layers.css"));
    const baseUiHref = layered ? "./styles/base-ui.css" : "./base-ui.css";
    assert.deepEqual(fs.readFileSync(path.join(appDir, baseUiHref)), BASE_UI, relative);

    const html = fs.readFileSync(path.join(appDir, "index.html"), "utf8");
    assert.match(html, /<meta name="color-scheme" content="light dark">/, relative);
    const stylesheets = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi)].map(
      (match) => match[1],
    );
    assert.equal(stylesheets.filter((href) => href.endsWith("base-ui.css")).length, 1, relative);
    assert.equal(stylesheets[0], baseUiHref, relative);

    const accentIndex = stylesheets.findIndex((href) => href.endsWith("accent-theme.css"));
    if (accentIndex >= 0) assert.equal(accentIndex, stylesheets.length - 1, relative);

    const layersPath = path.join(appDir, "styles", "layers.css");
    if (fs.existsSync(layersPath)) {
      assert.match(fs.readFileSync(layersPath, "utf8"), /@layer\s+base-ui\s*,/, relative);
    }
  }
});

test("app CSS uses the shared type scale and only documented semantic radius literals", () => {
  for (const appDir of appDirs()) {
    for (const filePath of cssFiles(appDir)) {
      const relative = path.relative(ROOT, filePath);
      const css = fs.readFileSync(filePath, "utf8");
      assert.doesNotMatch(css, /font-size\s*:\s*\d+(?:\.\d+)?px/i, relative);
      assert.doesNotMatch(css, /color-scheme\s*:\s*light\s*;/i, relative);

      for (const match of css.matchAll(/border-radius\s*:\s*([^;}]*\d+(?:\.\d+)?px[^;}]*)(?:;|})/gi)) {
        const value = match[1];
        const isPill = /^\s*999px\s*$/i.test(value);
        const isIllustration = relative.includes("kelly-digital-human") && /(?:24|28|34|58|62|70|84)px/.test(value);
        assert.ok(isPill || isIllustration, `${relative}: undocumented radius literal ${value.trim()}`);
      }
    }
  }
});

test("the shared layer excludes product shell and list-detail layout", () => {
  const css = BASE_UI.toString("utf8");
  assert.doesNotMatch(css, /\.(?:app-shell|sidebar|content-split|list-panel|detail-panel|modal)(?:\b|[-:])/);
});
