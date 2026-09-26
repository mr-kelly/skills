#!/usr/bin/env node
import { existsSync } from "node:fs";
// Builds the GitHub Pages site in docs/ from README.md + docs/README-zh-CN.md + bundled screenshots
// and demo recordings (docs/demo-recordings/).
// Zero dependencies. Re-run after changing READMEs or screenshots: node scripts/build-site.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GROUPS,
  INDUSTRY_LABELS,
  LEGACY_ALIASES,
  RISK_LABELS,
  listSkillDirs,
  readSkillMeta,
} from "./lib/skill-taxonomy.mjs";
import { MANIFEST, expectedTags } from "./sync-marketplace.mjs";
import { README_TARGETS, expectedBlock } from "./sync-readme-skills.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = path.join(ROOT, "docs");
const PAGES_DIR = path.join(DOCS, "s");
const RECORDINGS_DIR = path.join(DOCS, "demo-recordings");
const REPO_URL = "https://github.com/mr-kelly/skills";
const assetModeArg = process.argv.find((arg) => arg.startsWith("--asset-mode="));
const ASSET_MODE = assetModeArg?.slice("--asset-mode=".length) || "repository";
if (!new Set(["repository", "pages-local"]).has(ASSET_MODE)) {
  throw new Error(`Unsupported asset mode: ${ASSET_MODE}`);
}
// skills/**/assets/screenshots/** is Git LFS-tracked (see .gitattributes); raw.githubusercontent.com
// serves the LFS pointer text instead of the image, so screenshots must go through the LFS media host.
const RAW_REPO_URL = "https://media.githubusercontent.com/media/mr-kelly/skills/main";
// The two hosts are not interchangeable, and each fails differently: media.* serves ONLY LFS objects
// (a plain file 404s), raw.* serves plain files and hands back the pointer text for an LFS object.
// So an LFS asset goes through RAW_REPO_URL above and a plain one through this.
const PLAIN_REPO_URL = "https://raw.githubusercontent.com/mr-kelly/skills/main";
const INSTALL_COMMAND = "npx skills add mr-kelly/skills";
const CLAUDE_INSTALL_COMMAND = "/plugin marketplace add mr-kelly/skills\n/plugin install mr-kelly-skills";
const SITE_URL = "https://mr-kelly.github.io/skills/";

const LEGACY_SKILL_REDIRECTS = new Map([
  ["app-in-skill-creator", "kelly-app-skill-creator"],
  ["kelly-app-creator", "kelly-app-skill-creator"],
]);

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sitemapXml(skillNames) {
  const urls = [
    { loc: SITE_URL, priority: "0.9" },
    ...skillNames.sort().map((name) => ({
      loc: `${SITE_URL}s/${encodeURIComponent(name)}.html`,
      priority: "0.7",
    })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    ({ loc, priority }) => `  <url>
    <loc>${esc(loc)}</loc>
    <changefreq>monthly</changefreq>
    <priority>${priority}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>
`;
}

function stripMd(s) {
  return String(s ?? "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function parseTable(md) {
  const rows = {};
  const re = /^\| `([a-z0-9-]+)` \| (.+?) \| (.+?) \| \[[^\]]+\]\(([^)]+)\) \|$/gm;
  let m;
  while ((m = re.exec(md))) rows[m[1]] = { desc: stripMd(m[2]), when: stripMd(m[3]), doc: m[4] };
  return rows;
}

function normalizeShotPath(src, imgPrefix) {
  let out = src.replace(imgPrefix, "");
  while (out.startsWith("../")) out = out.slice(3);
  return out;
}

function siteShotPath(src, rel = "") {
  if (!src.startsWith("skills/")) return `${rel}${src}`;
  return ASSET_MODE === "pages-local" ? `${rel}${src}` : `${RAW_REPO_URL}/${src}`;
}

function siteThumbPath(src) {
  const thumb = src.replace(/\/assets\/screenshots\/([^/]+)\.(png|webp)$/i, "/assets/screenshots/thumbs/$1.webp");
  return siteShotPath(existsSync(path.join(ROOT, thumb)) ? thumb : src);
}

// ── Demo recordings ─────────────────────────────────────────────────────────
// docs/demo-recordings/<skill>/<skill>-<slug>-<zh-CN|en>.mp4, with an optional
// poster of the same name and a .webp extension beside it. Recordings are Git
// LFS objects (see .gitattributes), so in "repository" mode they go through the
// LFS media host exactly as screenshots do, while the posters — plain objects —
// go through the plain host. The Pages deploy copies docs/ verbatim, so
// "pages-local" points at that copy for both.
function siteRecordingPath(rel) {
  return ASSET_MODE === "pages-local" ? `../${rel.replace(/^docs\//, "")}` : `${RAW_REPO_URL}/${rel}`;
}

// Posters are ordinary git objects (only *.mp4 is LFS-tracked here), so in
// "repository" mode they come from the plain host — the media host would 404 them.
function sitePosterPath(rel) {
  return ASSET_MODE === "pages-local" ? `../${rel.replace(/^docs\//, "")}` : `${PLAIN_REPO_URL}/${rel}`;
}

const RECORDING_LABELS = {
  demo: ["Demo recording", "演示录屏"],
  "workflow-demo": ["Workflow demo", "工作流演示"],
};

function recordingLabel(slug) {
  if (RECORDING_LABELS[slug]) return RECORDING_LABELS[slug];
  const words = slug.replace(/-/g, " ");
  const label = words.charAt(0).toUpperCase() + words.slice(1);
  return [label, label];
}

async function recordingsFor(skill) {
  const dir = path.join(RECORDINGS_DIR, skill);
  let names;
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const nameRe = new RegExp(`^${skill}-(.+)-(zh-CN|en)$`);
  const bySlug = new Map();
  const misnamed = [];
  for (const file of names.filter((n) => n.endsWith(".mp4")).sort()) {
    const base = file.slice(0, -".mp4".length);
    const m = base.match(nameRe);
    // A recording that does not match would simply never appear. Same rule as a
    // missing category: fail the build rather than ship a page that quietly
    // lacks the video someone recorded.
    if (!m) {
      misnamed.push(`docs/demo-recordings/${skill}/${file}`);
      continue;
    }
    const entry = bySlug.get(m[1]) ?? { en: null, zh: null };
    entry[m[2] === "en" ? "en" : "zh"] = base;
    bySlug.set(m[1], entry);
  }
  if (misnamed.length) {
    throw new Error(
      `${misnamed.join(", ")}: recording names must be ${skill}-<slug>-<zh-CN|en>.mp4 (see kelly-app-skill-creator/references/demo-recording.md)`,
    );
  }
  return [...bySlug.entries()].map(([slug, own]) => {
    // No English cut yet -> the English page plays the Chinese one, and says so.
    const chosen = { en: own.en ?? own.zh, zh: own.zh ?? own.en };
    const rel = (base, ext) => `docs/demo-recordings/${skill}/${base}.${ext}`;
    const poster = (base) => (existsSync(path.join(ROOT, rel(base, "webp"))) ? rel(base, "webp") : null);
    return {
      slug,
      hasOwn: { en: Boolean(own.en), zh: Boolean(own.zh) },
      video: { en: rel(chosen.en, "mp4"), zh: rel(chosen.zh, "mp4") },
      poster: { en: poster(chosen.en), zh: poster(chosen.zh) },
    };
  });
}

// One poster card per recording, in the gallery's own grid — a slide among the
// screenshots rather than a player above them. No <video> exists until the card
// is clicked (see openVideo in LANG_JS): these are megabyte files behind an LFS
// host, and a page that is mostly a gallery should not fetch one on load.
function videoFigureHtml(rec, fallbackShot) {
  const [labelEn, labelZh] = recordingLabel(rec.slug);
  const posterOf = (lang) => {
    if (rec.poster[lang]) return sitePosterPath(rec.poster[lang]);
    if (fallbackShot) return siteShotPath(fallbackShot[lang], "../");
    return "";
  };
  const posterEn = posterOf("en");
  const posterZh = posterOf("zh");
  const noteEn = rec.hasOwn.en ? "" : " Recorded in Simplified Chinese.";
  const noteZh = rec.hasOwn.zh ? "" : " 录制语言：英文。";
  const img = posterEn
    ? `<img data-shot-en="${esc(posterEn)}" data-shot-zh="${esc(posterZh)}" src="${esc(posterEn)}" alt="" loading="lazy">`
    : "";
  return `<figure class="shot shot-video">
  <button type="button" class="video-poster${posterEn ? "" : " no-poster"}" data-video-en="${esc(siteRecordingPath(rec.video.en))}" data-video-zh="${esc(siteRecordingPath(rec.video.zh))}" data-label-en="Play: ${esc(labelEn)}" data-label-zh="播放：${esc(labelZh)}" aria-label="Play: ${esc(labelEn)}">
    ${img}
    <span class="play" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor"/></svg></span>
  </button>
  <figcaption class="cap">
    ${bilingual(`<strong>${esc(labelEn)}</strong><span>Screen recording of the app in use.${esc(noteEn)}</span>`, `<strong>${esc(labelZh)}</strong><span>应用实际操作的屏幕录制。${esc(noteZh)}</span>`, "div")}
  </figcaption>
</figure>`;
}

function parseShotSections(md, imgPrefix) {
  // Returns { sectionName: { imgs: [...], caps: [{title, text}] } }
  const sections = {};
  const parts = md.split(/^### `([a-z0-9-]+)`$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const name = parts[i];
    const body = parts[i + 1] || "";
    const imgs = [...body.matchAll(/<img src="([^"]+)"/g)].map((x) => normalizeShotPath(x[1], imgPrefix));
    const caps = [...body.matchAll(/<strong>(.*?)<\/strong><br>(.*?)<\/td>/g)].map((x) => ({
      title: x[1],
      text: x[2],
    }));
    sections[name] = { imgs, caps };
  }
  return sections;
}

async function frontmatterDescription(dir) {
  try {
    const txt = await fs.readFile(path.join(ROOT, "skills", dir, "SKILL.md"), "utf8");
    const m = txt.match(/^description:\s*"?(.+?)"?\s*$/m);
    if (!m) return "";
    const sentence = m[1].split(/(?<=\.)\s/)[0];
    return sentence;
  } catch {
    return "";
  }
}

async function skillTaxonomy(dir) {
  const meta = (await readSkillMeta(ROOT, dir)) || { category: "", tags: [] };
  const risk = (meta.tags.find((t) => t.startsWith("risk:")) || "").slice(5);
  return { category: meta.category, tags: meta.tags, risk };
}

async function hasAppDirectory(dir) {
  try {
    const stat = await fs.stat(path.join(ROOT, "skills", dir, "content", `${dir}-app`, "package.json"));
    return stat.isFile();
  } catch {
    return false;
  }
}

async function fileExists(...parts) {
  try {
    await fs.access(path.join(...parts));
    return true;
  } catch {
    return false;
  }
}

const LANG_JS = `
(function () {
  var saved = localStorage.getItem("mk-lang");
  var lang = saved || ((navigator.language || "").toLowerCase().indexOf("zh") === 0 ? "zh" : "en");
  var q = new URLSearchParams(location.search).get("lang");
  if (q === "zh" || q === "en") { lang = q; localStorage.setItem("mk-lang", lang); }
  function apply() {
    document.documentElement.setAttribute("data-lang", lang);
    document.querySelectorAll("[data-shot-en]").forEach(function (img) {
      var src = lang === "zh" && img.getAttribute("data-shot-zh") ? img.getAttribute("data-shot-zh") : img.getAttribute("data-shot-en");
      if (img.getAttribute("src") !== src) img.setAttribute("src", src);
    });
    document.querySelectorAll("[data-label-en]").forEach(function (el) {
      var label = lang === "zh" && el.getAttribute("data-label-zh") ? el.getAttribute("data-label-zh") : el.getAttribute("data-label-en");
      el.setAttribute("aria-label", label);
    });
    document.querySelectorAll(".lang-toggle button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-lang") === lang);
    });
  }
  window.mkSetLang = function (l) { lang = l; localStorage.setItem("mk-lang", l); apply(); };
  document.addEventListener("DOMContentLoaded", apply);
  apply();
  // A detached <video> keeps playing (audio, network) until it is collected, so
  // closing has to stop it first, not just remove the box.
  function closeLightbox(box) {
    box.querySelectorAll("video").forEach(function (v) {
      v.pause();
      v.removeAttribute("src");
      v.load();
    });
    box.remove();
    if (box._opener && document.contains(box._opener)) box._opener.focus();
  }
  // The <video> is created here, on click — until then nothing is fetched.
  function openVideo(button) {
    var src = lang === "zh" && button.getAttribute("data-video-zh") ? button.getAttribute("data-video-zh") : button.getAttribute("data-video-en");
    var poster = button.querySelector("img");
    var box = document.createElement("div");
    box.className = "lightbox lightbox-video";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", button.getAttribute("aria-label") || "");
    box._opener = button;
    var video = document.createElement("video");
    video.controls = true;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    if (poster) video.poster = poster.getAttribute("src");
    video.src = src;
    var close = document.createElement("button");
    close.type = "button";
    close.className = "lightbox-close";
    close.setAttribute("aria-label", lang === "zh" ? "关闭" : "Close");
    close.textContent = "\u00d7";
    close.addEventListener("click", function () { closeLightbox(box); });
    box.addEventListener("click", function (ev) { if (ev.target === box) closeLightbox(box); });
    box.appendChild(video);
    box.appendChild(close);
    document.body.appendChild(box);
    close.focus();
    var started = video.play();
    if (started && started.catch) started.catch(function () {});
  }
  document.addEventListener("click", function (e) {
    var opener = e.target.closest ? e.target.closest(".video-poster") : null;
    if (opener) { openVideo(opener); return; }
    var img = e.target.closest ? e.target.closest(".shot:not(.shot-video) img") : null;
    if (img) {
      var box = document.createElement("div");
      box.className = "lightbox";
      box.innerHTML = '<img src="' + img.getAttribute("src") + '" alt="">';
      box.addEventListener("click", function () { closeLightbox(box); });
      document.body.appendChild(box);
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") document.querySelectorAll(".lightbox").forEach(closeLightbox);
  });
  var mkFilters = { category: "all", risk: "all", industry: "all" };
  function applyFilters(updateUrl) {
    var sections = Array.prototype.slice.call(document.querySelectorAll("[data-group-section]"));
    if (!sections.length) return;
    var exists = mkFilters.category === "all" || sections.some(function (section) {
      return section.getAttribute("data-group-section") === mkFilters.category;
    });
    if (!exists) mkFilters.category = "all";

    var shown = 0;
    sections.forEach(function (section) {
      var inCategory = mkFilters.category === "all"
        || section.getAttribute("data-group-section") === mkFilters.category;
      var visible = 0;
      section.querySelectorAll("[data-skill-card]").forEach(function (card) {
        var tags = (card.getAttribute("data-tags") || "").split(" ");
        var ok = ["risk", "industry"].every(function (ns) {
          return mkFilters[ns] === "all" || tags.indexOf(ns + ":" + mkFilters[ns]) !== -1;
        });
        card.hidden = !ok;
        if (ok) visible++;
      });
      section.hidden = !(inCategory && visible > 0);
      if (inCategory) shown += visible;
    });
    var empty = document.querySelector("[data-empty-state]");
    if (empty) empty.hidden = shown > 0;

    document.querySelectorAll("[data-category-filter]").forEach(function (button) {
      button.classList.toggle("active", button.getAttribute("data-category-filter") === mkFilters.category);
    });
    document.querySelectorAll("[data-tag-filter]").forEach(function (button) {
      var value = button.getAttribute("data-tag-filter").split(":");
      button.classList.toggle("active", mkFilters[value[0]] === value[1]);
    });

    if (updateUrl && window.history && window.URL) {
      var url = new URL(window.location.href);
      ["category", "risk", "industry"].forEach(function (key) {
        if (mkFilters[key] === "all") url.searchParams.delete(key);
        else url.searchParams.set(key, mkFilters[key]);
      });
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }
  window.mkSetCategory = function (id) { mkFilters.category = id || "all"; applyFilters(true); };
  window.mkSetTag = function (tag) {
    var parts = String(tag).split(":");
    if (parts.length === 2 && mkFilters.hasOwnProperty(parts[0])) mkFilters[parts[0]] = parts[1];
    applyFilters(true);
  };
  document.addEventListener("DOMContentLoaded", function () {
    var params = new URLSearchParams(location.search);
    ["category", "risk", "industry"].forEach(function (key) {
      mkFilters[key] = params.get(key) || "all";
    });
    applyFilters(false);
  });
  document.addEventListener("click", function (e) {
    var button = e.target.closest ? e.target.closest("[data-copy]") : null;
    if (!button) return;
    var id = button.getAttribute("data-copy");
    var target = document.getElementById(id);
    if (!target) return;
    var text = target.getAttribute("data-copy-value") || target.value || target.textContent || "";
    function done(ok) {
      var original = button.getAttribute("data-original-html") || button.innerHTML;
      button.setAttribute("data-original-html", original);
      button.textContent = ok ? (lang === "zh" ? "已复制" : "Copied") : (lang === "zh" ? "复制失败" : "Copy failed");
      window.setTimeout(function () { button.innerHTML = original; }, 1400);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      return;
    }
    if (target.select) {
      target.select();
      try { done(document.execCommand("copy")); } catch (_) { done(false); }
      return;
    }
    var input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    try { done(document.execCommand("copy")); } catch (_) { done(false); }
    input.remove();
  });
})();
`;

const CSS = `
:root {
  --bg: #f7f7f8; --surface: #ffffff; --border: #e4e4e7; --text: #18181b;
  --muted: #71717a; --accent: #2563eb; --accent-soft: #eff6ff; --radius: 10px;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
[data-lang="en"] .zh, [data-lang="zh"] .en { display: none; }
.topbar {
  position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 14px;
  padding: 12px 24px; background: rgba(255,255,255,.92); backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border);
}
.topbar .brand { display: flex; align-items: center; gap: 10px; font-weight: 650; color: var(--text); }
.topbar .brand:hover { text-decoration: none; }
.brand-mark {
  width: 26px; height: 26px; border-radius: 7px; background: var(--text); color: #fff;
  display: inline-flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700;
}
.topbar .spacer { flex: 1; }
.topbar .gh { color: var(--muted); font-size: 14px; }
.lang-toggle { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.lang-toggle button {
  border: 0; background: transparent; padding: 5px 12px; font: inherit; font-size: 13px;
  color: var(--muted); cursor: pointer;
}
.lang-toggle button.active { background: var(--text); color: #fff; }
.wrap { max-width: 1240px; margin: 0 auto; padding: 0 24px 80px; }
.hero { padding: 56px 0 8px; }
.hero h1 { margin: 0 0 10px; font-size: 34px; line-height: 1.2; letter-spacing: -0.02em; }
.hero p.lede { margin: 0; max-width: 760px; color: var(--muted); font-size: 16px; }
.hero .stats { display: flex; gap: 20px; margin: 22px 0 0; color: var(--muted); font-size: 13.5px; flex-wrap: wrap; }
.hero .stats strong { color: var(--text); font-size: 15px; margin-right: 5px; }
.audit-note {
  margin-top: 18px; max-width: 760px; padding: 11px 13px; border-left: 3px solid var(--accent);
  background: var(--accent-soft); color: var(--muted); font-size: 13px; line-height: 1.5;
}
.audit-note strong { color: var(--text); margin-right: 6px; }
.home-layout {
  display: grid; grid-template-columns: minmax(0, 1fr) 286px; gap: 28px; align-items: start;
}
.home-main { min-width: 0; }
.home-sidebar {
  position: sticky; top: 74px; display: grid; gap: 12px; margin-top: 56px;
}
.home-mobile-controls { display: none; }
.install-strip {
  margin-top: 22px; background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 12px; display: grid; gap: 10px;
}
.install-strip strong { display: block; font-size: 13.5px; }
.install-strip span.note { display: block; color: var(--muted); font-size: 13px; margin-top: 1px; }
.install-actions { display: flex; align-items: stretch; gap: 8px; flex-wrap: wrap; }
.command-code {
  display: block; min-width: 0; white-space: pre-wrap; overflow-wrap: normal;
  border: 1px solid var(--border); border-radius: 8px; background: #fbfbfc;
  color: var(--text); padding: 8px 10px; font-size: 12px; line-height: 1.45;
}
.install-action-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.copy-row { display: flex; align-items: stretch; gap: 8px; min-width: 0; flex: 1 1 340px; }
.copy-row code {
  flex: 1; min-width: 0; overflow-x: auto; white-space: pre; border: 1px solid var(--border);
  border-radius: 8px; background: #fff; color: var(--text); padding: 8px 10px; font-size: 12.5px;
}
.copy-button {
  flex: 0 0 auto; border: 1px solid var(--border); background: var(--text); color: #fff;
  border-radius: 8px; min-height: 32px; padding: 0 10px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
}
.copy-button:hover { background: #27272a; }
.copy-button.secondary { background: #fff; color: var(--text); }
.copy-button.secondary:hover { border-color: var(--text); background: #fafafa; }
.copy-button.subtle { background: #fff; color: var(--muted); font-weight: 500; }
.copy-button.subtle:hover { color: var(--text); border-color: var(--text); background: #fafafa; }
.install-more {
  color: var(--muted); font-size: 13px; align-self: center;
}
.install-more summary, .side-details summary {
  cursor: pointer; color: var(--muted); font-size: 13px; list-style: none;
  display: flex; align-items: center; gap: 7px; padding: 2px 0 2px 2px;
}
.install-more summary::-webkit-details-marker, .side-details summary::-webkit-details-marker { display: none; }
.install-more summary::before, .side-details summary::before {
  content: "›"; width: 14px; height: 14px; border-radius: 4px; color: var(--muted);
  display: inline-flex; align-items: center; justify-content: center; transform: rotate(0deg);
  transition: transform .15s ease;
}
.install-more[open] summary::before, .side-details[open] summary::before { transform: rotate(90deg); }
.details-body { display: grid; gap: 8px; margin-top: 8px; padding-left: 23px; }
.mobile-skill-install { display: none; }
.category-list { display: grid; gap: 6px; }
.category-button {
  width: 100%; border: 1px solid transparent; background: transparent; color: var(--text);
  border-radius: 8px; padding: 7px 9px; font: inherit; font-size: 13px; text-align: left;
  display: flex; justify-content: space-between; gap: 10px; cursor: pointer;
}
.category-button:hover { background: #f4f4f5; }
.category-button.active { border-color: var(--border); background: var(--accent-soft); color: var(--accent); }
.category-button .count { color: var(--muted); font-size: 12px; }
.category-chips { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
.category-chip {
  flex: 0 0 auto; border: 1px solid var(--border); background: var(--surface); color: var(--text);
  border-radius: 999px; padding: 6px 10px; font: inherit; font-size: 12.5px; cursor: pointer;
}
.category-chip.active { background: var(--text); color: #fff; border-color: var(--text); }
.tag-list { display: flex; flex-wrap: wrap; gap: 6px; }
.tag-button {
  border: 1px solid var(--border); background: var(--surface); color: var(--muted);
  border-radius: 999px; padding: 4px 9px; font: inherit; font-size: 12px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 5px;
}
.tag-button:hover { background: #f4f4f5; }
.tag-button.active { background: var(--text); color: #fff; border-color: var(--text); }
.tag-button .count { opacity: .6; font-size: 11px; }
.risk {
  align-self: flex-start; margin-top: 10px; border-radius: 999px; padding: 2px 8px;
  font-size: 11px; font-weight: 600; letter-spacing: .01em; border: 1px solid transparent;
}
.risk-sandbox { background: #f4f4f5; color: #52525b; border-color: #e4e4e7; }
.risk-read-only { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
.risk-local-write { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
.risk-gated-write { background: #fffbeb; color: #b45309; border-color: #fde68a; }
.empty-state { margin: 44px 0; color: var(--muted); font-size: 14px; }
h2.group {
  margin: 44px 0 16px; font-size: 15px; font-weight: 650; letter-spacing: .04em;
  text-transform: uppercase; color: var(--muted);
}
[data-lang="zh"] h2.group { text-transform: none; letter-spacing: .08em; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
.card {
  display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); overflow: hidden; color: var(--text); transition: box-shadow .15s, transform .15s;
}
.card:hover { text-decoration: none; box-shadow: 0 8px 24px rgba(24,24,27,.08); transform: translateY(-2px); }
/* .card sets display:flex, which outranks the UA stylesheet's [hidden] { display: none }. */
.card[hidden] { display: none; }
.card .thumb { aspect-ratio: 3 / 2; background: #eef0f3; overflow: hidden; border-bottom: 1px solid var(--border); }
.card .thumb img { width: 100%; height: 100%; object-fit: cover; object-position: top left; display: block; }
.card .thumb.empty { display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 26px; }
.card .body { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 6px; }
.card .name { font-weight: 650; font-size: 15.5px; display: flex; align-items: center; gap: 8px; }
.card .name .pill {
  font-size: 11px; font-weight: 600; color: var(--accent); background: var(--accent-soft);
  border-radius: 999px; padding: 2px 8px;
}
.card .desc { color: var(--muted); font-size: 13.5px; line-height: 1.55; }
.skill-hero { padding: 44px 0 10px; }
.skill-hero .crumb { font-size: 13px; color: var(--muted); margin-bottom: 14px; display: block; }
.skill-hero h1 { margin: 0 0 10px; font-size: 30px; letter-spacing: -0.02em; }
.skill-hero p { margin: 0; max-width: 800px; color: var(--muted); font-size: 15.5px; }
.skill-layout {
  display: grid; grid-template-columns: minmax(0, 1fr) 286px; gap: 28px; align-items: start;
}
.skill-main { min-width: 0; }
.skill-sidebar {
  position: sticky; top: 74px; display: grid; gap: 12px; margin-top: 44px;
}
.side-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 14px; display: grid; gap: 11px;
}
.side-card.install-card { gap: 10px; }
.side-card h2, .side-card h3 {
  margin: 0; font-size: 13px; letter-spacing: .04em; text-transform: uppercase; color: var(--muted);
}
[data-lang="zh"] .side-card h2, [data-lang="zh"] .side-card h3 { text-transform: none; }
.side-card p { margin: 0; color: var(--muted); font-size: 12.5px; line-height: 1.5; }
.skill-sidebar .copy-row { flex-basis: auto; flex-direction: column; }
.skill-sidebar .copy-row code { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.45; }
.skill-sidebar .copy-button { min-height: 32px; }
.side-links { display: grid; gap: 8px; }
.side-links a {
  border: 1px solid var(--border); background: #fff; border-radius: 8px;
  padding: 7px 10px; font-size: 13px; color: var(--text);
}
.side-links a:hover { border-color: var(--text); text-decoration: none; }
.side-details .copy-row { margin-top: 10px; }
.skill-links { display: flex; gap: 10px; margin-top: 18px; flex-wrap: wrap; }
.skill-links a {
  border: 1px solid var(--border); background: var(--surface); border-radius: 8px;
  padding: 6px 13px; font-size: 13px; color: var(--text);
}
.skill-links a:hover { border-color: var(--text); text-decoration: none; }
.panel {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 16px 20px; margin-top: 26px;
}
.panel h3 { margin: 0 0 6px; font-size: 13px; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
[data-lang="zh"] .panel h3 { text-transform: none; }
.panel p { margin: 0; color: var(--text); }
.shots { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 18px; margin-top: 28px; }
.shot { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.shot img { width: 100%; display: block; cursor: zoom-in; }
.shot .cap { padding: 12px 16px; border-top: 1px solid var(--border); }
.shot .cap strong { display: block; font-size: 14px; margin-bottom: 2px; }
.shot .cap span { color: var(--muted); font-size: 13px; }
.shot-video .video-poster {
  position: relative; display: block; width: 100%; margin: 0; padding: 0; border: 0;
  background: #18181b; color: #fff; cursor: pointer; line-height: 0;
}
.shot-video .video-poster.no-poster { aspect-ratio: 16 / 10; }
.shot-video .video-poster img { width: 100%; height: auto; display: block; cursor: pointer; }
.shot-video .play { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.shot-video .play::before {
  content: ""; position: absolute; width: 64px; height: 64px; border-radius: 50%;
  background: rgba(24,24,27,.72); box-shadow: 0 6px 24px rgba(0,0,0,.28);
  transition: transform .15s ease, background .15s ease;
}
.shot-video .play svg { position: relative; margin-left: 4px; }
.shot-video .video-poster:hover .play::before,
.shot-video .video-poster:focus-visible .play::before { transform: scale(1.08); background: rgba(24,24,27,.86); }
.shot-video .video-poster:focus-visible { outline: 2px solid var(--text); outline-offset: -2px; }
@media (prefers-reduced-motion: reduce) { .shot-video .play::before { transition: none; } }
.lightbox {
  position: fixed; inset: 0; z-index: 50; background: rgba(24,24,27,.86);
  display: flex; align-items: center; justify-content: center; padding: 4vh 4vw; cursor: zoom-out;
}
.lightbox img { max-width: 100%; max-height: 100%; border-radius: 8px; box-shadow: 0 24px 80px rgba(0,0,0,.5); }
.lightbox-video { cursor: default; }
.lightbox video { max-width: 100%; max-height: 100%; border-radius: 8px; background: #000; box-shadow: 0 24px 80px rgba(0,0,0,.5); }
.lightbox-close {
  position: absolute; top: 14px; right: 18px; width: 40px; height: 40px; border: 0; border-radius: 50%;
  background: rgba(255,255,255,.14); color: #fff; font-size: 24px; line-height: 1; cursor: pointer;
}
.lightbox-close:hover, .lightbox-close:focus-visible { background: rgba(255,255,255,.28); }
.footer { margin-top: 64px; padding-top: 22px; border-top: 1px solid var(--border); color: var(--muted); font-size: 13px; }
@media (max-width: 860px) {
  .hero h1 { font-size: 26px; }
  .wrap { padding: 0 16px 60px; }
  .topbar { padding: 10px 16px; }
  .home-layout { display: block; }
  .home-sidebar { display: none; }
  .home-mobile-controls { display: grid; gap: 10px; margin-top: 18px; }
  .home-mobile-controls .install-strip { margin-top: 0; padding: 10px; gap: 8px; }
  .home-mobile-controls .install-strip span.note { display: none; }
  .home-mobile-controls .command-code, .home-mobile-controls .copy-row code { padding: 7px 9px; font-size: 12px; }
  .install-actions { display: grid; }
  .copy-row { flex-direction: column; }
  .copy-button { min-height: 32px; }
  .skill-layout { display: block; }
  .skill-sidebar { position: static; margin-top: 18px; }
  .mobile-skill-install { display: grid; }
  .mobile-skill-install { margin-top: 14px; padding: 10px; gap: 8px; }
  .mobile-skill-install span.note { display: none; }
  .mobile-skill-install .command-code, .mobile-skill-install .copy-row code { padding: 7px 9px; font-size: 12px; }
  .mobile-skill-install .copy-button { min-height: 32px; }
  .skill-sidebar .side-card:first-child { display: none; }
  .shots { grid-template-columns: 1fr; }
}
`;

function topbar(rel) {
  return `<header class="topbar">
  <a class="brand" href="${rel}index.html"><span class="brand-mark">K</span> mr-kelly/skills</a>
  <span class="spacer"></span>
  <nav class="lang-toggle" aria-label="Language">
    <button type="button" data-lang="en" onclick="mkSetLang('en')">EN</button>
    <button type="button" data-lang="zh" onclick="mkSetLang('zh')">中文</button>
  </nav>
  <a class="gh" href="${REPO_URL}" target="_blank" rel="noopener">GitHub ↗</a>
</header>`;
}

function pageShell({ title, body, rel }) {
  return `<!DOCTYPE html>
<html lang="en" data-lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="Kelly's App-in-Skill business tools — agent skills that bundle a local review UI.">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#18181b"/><text x="16" y="22" font-size="17" font-weight="700" font-family="sans-serif" fill="#fff" text-anchor="middle">K</text></svg>')}">
<style>${CSS}</style>
</head>
<body>
${topbar(rel)}
<div class="wrap">
${body}
<footer class="footer">
  <span class="en">MIT licensed · Built from the repo READMEs by <code>scripts/build-site.mjs</code> · <a href="${REPO_URL}">mr-kelly/skills</a></span>
  <span class="zh">MIT 许可 · 由 <code>scripts/build-site.mjs</code> 从仓库 README 生成 · <a href="${REPO_URL}">mr-kelly/skills</a></span>
</footer>
</div>
<script>${LANG_JS}</script>
</body>
</html>`;
}

function bilingual(en, zh, tag = "span") {
  return `<${tag} class="en">${en}</${tag}><${tag} class="zh">${zh}</${tag}>`;
}

function copyCommandHtml(id, command) {
  return `<div class="copy-row">
  <code id="${id}">${esc(command)}</code>
  <button class="copy-button" type="button" data-copy="${id}">${bilingual("Copy", "复制")}</button>
</div>`;
}

function installCommandBlock({ prefix, command, prompt, compact = false }) {
  const displayCommand = command.replace(" --skill ", "\n--skill ");
  return `<code class="command-code" id="${prefix}-npx" data-copy-value="${esc(command)}">${esc(displayCommand)}</code>
<div class="install-action-row">
  <button class="copy-button" type="button" data-copy="${prefix}-npx">${bilingual("Copy", "复制")}</button>
  <button class="copy-button secondary" type="button" data-copy="${prefix}-prompt">${bilingual("Copy prompt", "复制提示")}</button>
</div>
<textarea id="${prefix}-prompt" hidden readonly>${esc(prompt)}</textarea>
<details class="${compact ? "install-more" : "side-details"}">
  <summary>${bilingual("Claude Code", "Claude Code")}</summary>
  <div class="details-body">
    <code class="command-code" id="${prefix}-claude">${esc(CLAUDE_INSTALL_COMMAND)}</code>
    <button class="copy-button subtle" type="button" data-copy="${prefix}-claude">${bilingual("Copy Claude commands", "复制 Claude 命令")}</button>
  </div>
</details>`;
}

function installCard({
  prefix,
  titleEn = "Install",
  titleZh = "安装",
  descriptionEn,
  descriptionZh,
  command,
  prompt,
  compact = false,
  extraClass = "",
}) {
  const bodyClass = `${compact ? "install-strip" : "side-card install-card"}${extraClass ? ` ${extraClass}` : ""}`;
  const heading = compact
    ? `<strong>${bilingual(titleEn, titleZh)}</strong>`
    : `<h2>${bilingual(titleEn, titleZh)}</h2>`;
  const note = compact
    ? `<span class="note">${bilingual(descriptionEn, descriptionZh)}</span>`
    : `<p>${bilingual(descriptionEn, descriptionZh)}</p>`;
  return `<section class="${bodyClass}">
  <div>
    ${heading}
    ${note}
  </div>
  <div class="install-actions">
    ${installCommandBlock({ prefix, command, prompt, compact })}
  </div>
</section>`;
}

function installData(skill) {
  const isSkill = Boolean(skill);
  const installName = isSkill ? skill.folder : "";
  const displayName =
    isSkill && skill.name !== installName ? `${skill.name} (${installName})` : isSkill ? skill.name : "";
  const npxCommand = isSkill ? `${INSTALL_COMMAND} --skill ${installName}` : INSTALL_COMMAND;
  const prompt = isSkill
    ? `Install ${displayName} from ${SITE_URL} for this agent, then use it for my next task.\n\nRun:\n${npxCommand}\n\nAfter it is installed, invoke the skill as $${installName}.`
    : `Install Kelly's skills from ${SITE_URL} for this agent.\n\nRun:\n${INSTALL_COMMAND}\n\nAfter installation, list the available skills and help me choose the right one for my task.`;
  return { displayName, npxCommand, prompt };
}

function skillMobileInstallStrip(s) {
  const data = installData(s);
  const prefix = `mobile-install-${s.name.replace(/[^a-z0-9-]/g, "-")}`;
  return installCard({
    prefix,
    descriptionEn: `Install ${esc(data.displayName)} or copy a ready prompt for your agent.`,
    descriptionZh: `安装 ${esc(data.displayName)}，或复制现成提示给 agent。`,
    command: data.npxCommand,
    prompt: data.prompt,
    compact: true,
    extraClass: "mobile-skill-install",
  });
}

function riskBadge(risk) {
  const label = RISK_LABELS.find((r) => r.id === risk);
  if (!label) return "";
  return `<span class="risk risk-${risk}">${bilingual(esc(label.en), esc(label.zh))}</span>`;
}

// Each namespace (risk / industry) filters independently and intersects with the others.
function tagFacetSection(ns, titleEn, titleZh, facets) {
  if (!facets.length) return "";
  const buttons = facets
    .map(
      (f) =>
        `<button class="tag-button" type="button" data-tag-filter="${esc(f.tag)}" onclick="mkSetTag('${esc(f.tag)}')">${bilingual(esc(f.en), esc(f.zh))}<span class="count">${f.count}</span></button>`,
    )
    .join("\n");
  return `  <section class="side-card">
    <h3>${bilingual(esc(titleEn), esc(titleZh))}</h3>
    <div class="tag-list">
      <button class="tag-button active" type="button" data-tag-filter="${ns}:all" onclick="mkSetTag('${ns}:all')">${bilingual("Any", "不限")}</button>
${buttons}
    </div>
  </section>`;
}

function categoryButton(g, count, variant = "button") {
  const isChip = variant === "chip";
  const className = isChip ? "category-chip" : "category-button";
  const suffix = isChip ? "" : `<span class="count">${count}</span>`;
  return `<button class="${className}" type="button" data-category-filter="${g.id}" onclick="mkSetCategory('${g.id}')">${bilingual(esc(g.en), esc(g.zh))}${suffix}</button>`;
}

function homeSidebar(groups, riskFacets = [], industryFacets = []) {
  const total = groups.reduce((sum, g) => sum + g.count, 0);
  const categoryButtons = [
    `<button class="category-button active" type="button" data-category-filter="all" onclick="mkSetCategory('all')">${bilingual("All skills", "全部 skills")}<span class="count">${total}</span></button>`,
    ...groups.map((g) => categoryButton(g, g.count)),
  ].join("\n");
  const data = installData();
  return `<aside class="home-sidebar">
  ${installCard({
    prefix: "install-site",
    descriptionEn: "Add the full bundle, then invoke the skill you need.",
    descriptionZh: "安装完整 bundle，然后调用需要的 skill。",
    command: data.npxCommand,
    prompt: data.prompt,
  })}
  <section class="side-card">
    <h3>${bilingual("Categories", "分类")}</h3>
    <div class="category-list">${categoryButtons}</div>
  </section>
${tagFacetSection("risk", "What it can touch", "外部副作用", riskFacets)}
${tagFacetSection("industry", "Industry", "行业", industryFacets)}
</aside>`;
}

function homeMobileControls(groups, riskFacets = []) {
  const categoryChips = [
    `<button class="category-chip active" type="button" data-category-filter="all" onclick="mkSetCategory('all')">${bilingual("All", "全部")}</button>`,
    ...groups.map((g) => categoryButton(g, g.count, "chip")),
  ].join("\n");
  const riskChips = riskFacets.length
    ? `\n  <nav class="category-chips" aria-label="Risk">${[
        `<button class="category-chip active" type="button" data-tag-filter="risk:all" onclick="mkSetTag('risk:all')">${bilingual("Any risk", "副作用不限")}</button>`,
        ...riskFacets.map(
          (r) =>
            `<button class="category-chip" type="button" data-tag-filter="${esc(r.tag)}" onclick="mkSetTag('${esc(r.tag)}')">${bilingual(esc(r.en), esc(r.zh))}</button>`,
        ),
      ].join("\n")}</nav>`
    : "";
  const data = installData();
  return `<div class="home-mobile-controls">
  ${installCard({
    prefix: "mobile-install-site",
    titleEn: "Quick install",
    titleZh: "快速安装",
    descriptionEn: "Copy the command or a ready agent prompt.",
    descriptionZh: "复制命令或现成 agent 提示。",
    command: data.npxCommand,
    prompt: data.prompt,
    compact: true,
  })}
  <nav class="category-chips" aria-label="Categories">${categoryChips}</nav>${riskChips}
</div>`;
}

function skillSidebar(s) {
  const data = installData(s);
  const prefix = `install-${s.name.replace(/[^a-z0-9-]/g, "-")}`;
  return `<aside class="skill-sidebar">
  ${installCard({
    prefix,
    descriptionEn: `Install ${esc(data.displayName)} without leaving this page.`,
    descriptionZh: `不用离开这个页面，直接安装 ${esc(data.displayName)}。`,
    command: data.npxCommand,
    prompt: data.prompt,
  })}
  <section class="side-card">
    <h3>${bilingual("Links", "链接")}</h3>
    <nav class="side-links">
      <a href="${REPO_URL}/tree/main/skills/${s.folder}" target="_blank" rel="noopener">${bilingual("Source", "源码")} ↗</a>
      <a href="${REPO_URL}/blob/main/skills/${s.folder}/SKILL.md" target="_blank" rel="noopener">SKILL.md ↗</a>
${s.hasReadme ? `      <a href="${REPO_URL}/blob/main/skills/${s.folder}/README.md" target="_blank" rel="noopener">README ↗</a>\n` : ""}    </nav>
  </section>
</aside>`;
}

async function main() {
  const readmeEn = await fs.readFile(path.join(ROOT, "README.md"), "utf8");
  const readmeZh = await fs.readFile(path.join(DOCS, "README-zh-CN.md"), "utf8");
  const tableEn = parseTable(readmeEn);
  const tableZh = parseTable(readmeZh);
  const shotsEn = parseShotSections(readmeEn, "docs/");
  const shotsZh = parseShotSections(readmeZh, "");

  const dirs = await listSkillDirs(ROOT);

  // Legacy alias dirs are hardlinks to their replacement's SKILL.md — they get a redirect
  // page, not a card, otherwise the same skill shows up several times on the index.
  const allNames = [...new Set([...Object.keys(tableEn), ...dirs])].filter((n) => !LEGACY_ALIASES.has(n));

  const skills = {};
  for (const name of allNames) {
    const folder = name;
    const en = tableEn[name] || {};
    const zh = tableZh[name] || {};
    const descEn = en.desc || (await frontmatterDescription(folder));
    const sEn = shotsEn[name] || { imgs: [], caps: [] };
    const sZh = shotsZh[name] || { imgs: [], caps: [] };
    const shots = sEn.imgs.map((src, i) => ({
      en: src,
      zh: sZh.imgs[i] || src,
      capEn: sEn.caps[i] || { title: "", text: "" },
      capZh: sZh.caps[i] || sEn.caps[i] || { title: "", text: "" },
    }));
    skills[name] = {
      name,
      folder,
      descEn,
      descZh: zh.desc || descEn,
      whenEn: en.when || "",
      whenZh: zh.when || en.when || "",
      shots,
      recordings: await recordingsFor(folder),
      hasApp: await hasAppDirectory(folder),
      hasReadme: await fileExists(ROOT, "skills", folder, "README.md"),
      ...(await skillTaxonomy(folder)),
    };
  }

  // Classification lives in each SKILL.md, so a new skill without one is a build error
  // rather than something that silently drops into a catch-all bucket.
  const knownCategories = new Set(GROUPS.map((g) => g.id));
  const taxonomyErrors = [];
  for (const s of Object.values(skills)) {
    if (!s.category) taxonomyErrors.push(`${s.name}: missing metadata.category in SKILL.md`);
    else if (!knownCategories.has(s.category))
      taxonomyErrors.push(`${s.name}: unknown metadata.category "${s.category}"`);
    if (!s.risk) taxonomyErrors.push(`${s.name}: missing a risk:<id> tag in SKILL.md`);
    else if (!RISK_LABELS.some((r) => r.id === s.risk))
      taxonomyErrors.push(`${s.name}: unknown risk tag "risk:${s.risk}"`);
  }
  // The marketplace listing is derived from the same metadata, so catch drift here rather
  // than shipping a stale plugin manifest.
  const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
  const wantTags = JSON.stringify(await expectedTags());
  for (const plugin of manifest.plugins || []) {
    if (JSON.stringify(plugin.tags) !== wantTags)
      taxonomyErrors.push(
        `.claude-plugin/marketplace.json: plugin "${plugin.name}" tags are stale — run node scripts/sync-marketplace.mjs`,
      );
  }

  // Same for the README skill tables, which must be grouped by the same categories.
  for (const target of README_TARGETS) {
    try {
      const raw = await fs.readFile(target.file, "utf8");
      if (!raw.includes(await expectedBlock(target)))
        taxonomyErrors.push(
          `${path.relative(ROOT, target.file)}: skills table is stale — run node scripts/sync-readme-skills.mjs`,
        );
    } catch (err) {
      taxonomyErrors.push(`${path.relative(ROOT, target.file)}: ${err.message}`);
    }
  }

  if (taxonomyErrors.length) {
    console.error(`build-site: ${taxonomyErrors.length} taxonomy error(s) — see AGENTS.md`);
    for (const e of taxonomyErrors) console.error(`  - ${e}`);
    process.exit(1);
  }

  // --- index.html ---
  let groupsHtml = "";
  const visibleGroups = [];
  for (const g of GROUPS) {
    // allNames leads with the curated README table order, so cards keep that ordering.
    const members = allNames.filter((n) => skills[n].category === g.id);
    if (!members.length) continue;
    visibleGroups.push({ ...g, count: members.length });
    groupsHtml += `<section class="group-section" data-group-section="${g.id}">
<h2 class="group" id="${g.id}">${bilingual(esc(g.en), esc(g.zh))}</h2>
<div class="grid">\n`;
    for (const n of members) groupsHtml += cardHtml(skills[n]);
    groupsHtml += "</div>\n</section>\n";
  }

  const riskFacets = RISK_LABELS.map((r) => ({
    ...r,
    tag: `risk:${r.id}`,
    count: Object.values(skills).filter((s) => s.risk === r.id).length,
  })).filter((r) => r.count);
  const industryFacets = INDUSTRY_LABELS.map((i) => ({
    ...i,
    tag: `industry:${i.id}`,
    count: Object.values(skills).filter((s) => s.tags.includes(`industry:${i.id}`)).length,
  })).filter((i) => i.count);

  const appCount = Object.values(skills).filter((s) => s.hasApp).length;
  const indexBody = `
<div class="home-layout">
  <main class="home-main">
    <section class="hero">
      <h1>${bilingual("Kelly&rsquo;s App-in-Skill workspace", "Kelly 的 App-in-Skill 工作区")}</h1>
      <p class="lede">
        ${bilingual(
          "Agent skills for daily business operations. Each App-in-Skill pairs an operating procedure for the agent with a local browser UI where a human reviews, approves, edits, and hands work back — dashboards for money, CRM, chat, SEO, market intel, ops, and more.",
          "服务日常业务的 agent skills。每个 App-in-Skill 都由两部分组成：给 agent 的操作规程 + 一个本地浏览器操作台，供人 review、批准、编辑并把任务交还给 agent —— 覆盖资金、CRM、聊天聚合、SEO、市场情报、运维等场景。",
        )}
      </p>
      <div class="stats">
        <span><strong>${allNames.length}</strong>${bilingual("skills", "个 skills")}</span>
        <span><strong>${appCount}</strong>${bilingual("bundled App UIs", "个内置 App UI")}</span>
        <span><strong>0</strong>${bilingual("npm dependencies", "npm 依赖")}</span>
      </div>
      <div class="audit-note">
        ${bilingual(
          "<strong>Workflow contracts are explicit.</strong> New operating apps use the Busabase Research, Plan, Action, and Retrospective contract; existing local apps retain their audited safety baseline.",
          "<strong>工作流契约明确。</strong>新的运营应用使用 Busabase Research、Plan、Action、Retrospective 契约；现有本地应用保留已审计的安全基线。",
        )}
      </div>
      ${homeMobileControls(visibleGroups, riskFacets)}
    </section>
    ${groupsHtml}    <p class="empty-state" data-empty-state hidden>${bilingual(
      "No skill matches these filters.",
      "没有 skill 同时满足这些筛选条件。",
    )}</p>
  </main>
  ${homeSidebar(visibleGroups, riskFacets, industryFacets)}
</div>`;

  function cardHtml(s) {
    const thumb = s.shots[0];
    const thumbHtml = thumb
      ? `<div class="thumb"><img data-shot-en="${esc(siteThumbPath(thumb.en))}" data-shot-zh="${esc(siteThumbPath(thumb.zh))}" src="${esc(siteThumbPath(thumb.en))}" alt="${esc(s.name)} UI" loading="lazy"></div>`
      : `<div class="thumb empty">⚙️</div>`;
    const href = s.hasApp || s.descEn ? `s/${s.name}.html` : `${REPO_URL}/tree/main/skills/${s.folder}`;
    return `<a class="card" data-skill-card data-tags="${esc(s.tags.join(" "))}" href="${href}">
  ${thumbHtml}
  <div class="body">
    <span class="name">${esc(s.name)}${s.hasApp ? `<span class="pill">${bilingual("App UI", "App UI")}</span>` : ""}</span>
    <span class="desc">${bilingual(esc(s.descEn), esc(s.descZh))}</span>
    ${riskBadge(s.risk)}
  </div>
</a>\n`;
  }

  await fs.mkdir(PAGES_DIR, { recursive: true });
  await fs.writeFile(
    path.join(DOCS, "index.html"),
    pageShell({ title: "mr-kelly/skills — Kelly's App-in-Skill workspace", body: indexBody, rel: "" }),
  );

  // --- per-skill pages ---
  for (const s of Object.values(skills)) {
    const shotsHtml = s.shots
      .map(
        (sh) => `<figure class="shot">
  <img data-shot-en="${esc(siteShotPath(sh.en, "../"))}" data-shot-zh="${esc(siteShotPath(sh.zh, "../"))}" src="${esc(siteShotPath(sh.en, "../"))}" alt="${esc(sh.capEn.title || s.name)}" loading="lazy">
  <figcaption class="cap">
    ${bilingual(`<strong>${esc(sh.capEn.title)}</strong><span>${esc(sh.capEn.text)}</span>`, `<strong>${esc(sh.capZh.title)}</strong><span>${esc(sh.capZh.text)}</span>`, "div")}
  </figcaption>
</figure>`,
      )
      .join("\n");
    const whenHtml = s.whenEn
      ? `    <div class="panel"><h3>${bilingual("When to use it", "什么时候用")}</h3><p>${bilingual(esc(s.whenEn), esc(s.whenZh))}</p></div>\n`
      : "";
    const videosHtml = s.recordings.map((rec) => videoFigureHtml(rec, s.shots[0])).join("\n");
    const galleryHtml = [videosHtml, shotsHtml].filter(Boolean).join("\n");
    const shotsSectionHtml = galleryHtml ? `    <div class="shots">${galleryHtml}</div>\n` : "";

    const body = `
<div class="skill-layout">
  <main class="skill-main">
    <section class="skill-hero">
      <a class="crumb" href="../index.html">${bilingual("&larr; All skills", "&larr; 全部 skills")}</a>
      <h1>${esc(s.name)}</h1>
      <p>${bilingual(esc(s.descEn), esc(s.descZh))}</p>
      ${skillMobileInstallStrip(s)}
    </section>
${whenHtml}${shotsSectionHtml}
  </main>
  ${skillSidebar(s)}
</div>`;

    await fs.writeFile(
      path.join(PAGES_DIR, `${s.name}.html`),
      pageShell({ title: `${s.name} — mr-kelly/skills`, body, rel: "../" }),
    );
  }

  for (const [legacyName, currentName] of LEGACY_SKILL_REDIRECTS) {
    const target = `${currentName}.html`;
    await fs.writeFile(
      path.join(PAGES_DIR, `${legacyName}.html`),
      `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Moved — ${currentName}</title>
<link rel="canonical" href="${SITE_URL}s/${target}">
<meta http-equiv="refresh" content="0; url=${target}">
<script>location.replace(${JSON.stringify(target)} + location.search + location.hash);</script>
</head><body><p><code>${legacyName}</code> is now <code>${currentName}</code>. Redirecting to <a href="${target}">${currentName}</a>&hellip;</p></body></html>\n`,
    );
  }

  await fs.writeFile(path.join(DOCS, ".nojekyll"), "");
  await fs.writeFile(path.join(DOCS, "sitemap.xml"), sitemapXml(Object.keys(skills)));
  console.log(`Built docs/index.html + ${Object.keys(skills).length} skill pages + docs/sitemap.xml`);
}

await main();
