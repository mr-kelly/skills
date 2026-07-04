#!/usr/bin/env node
// Builds the GitHub Pages site in docs/ from README.md + docs/README-zh-CN.md + docs/screenshots/.
// Zero dependencies. Re-run after changing READMEs or screenshots: node scripts/build-site.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = path.join(ROOT, "docs");
const PAGES_DIR = path.join(DOCS, "s");
const REPO_URL = "https://github.com/mr-kelly/skills";

const GROUPS = [
  { id: "finance", en: "Finance & Back Office", zh: "经营台账", skills: ["kelly-money", "kelly-audit", "kelly-crm"] },
  {
    id: "ecommerce",
    en: "Cross-Border E-commerce",
    zh: "跨境电商",
    skills: ["kelly-picks", "kelly-listing", "kelly-ads", "kelly-inquiry"],
  },
  {
    id: "comms",
    en: "Comms & Service",
    zh: "沟通与协作",
    skills: ["kelly-email", "kelly-messenger", "kelly-tickets", "kelly-standup"],
  },
  {
    id: "growth",
    en: "Growth & Market",
    zh: "增长与市场",
    skills: ["kelly-social", "kelly-seo", "kelly-feedback", "kelly-radar", "kelly-writer"],
  },
  {
    id: "production",
    en: "Production & Teaching",
    zh: "制作与教学",
    skills: ["kelly-drama", "kelly-mv", "kelly-lesson"],
  },
  { id: "eng", en: "Engineering & Ops", zh: "工程与运维", skills: ["kelly-devops", "kelly-pr-review"] },
  {
    id: "workspace",
    en: "Workspace Helpers",
    zh: "工作区工具",
    skills: ["agent-rules", "app-in-skill-creator", "publish-skills"],
  },
];

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripMd(s) {
  return String(s ?? "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function parseTable(md) {
  const rows = {};
  const re = /^\| `([a-z0-9-]+)` \| (.+?) \| (.+?) \| \[Open README\]\(([^)]+)\) \|$/gm;
  let m;
  while ((m = re.exec(md))) rows[m[1]] = { desc: stripMd(m[2]), when: stripMd(m[3]), doc: m[4] };
  return rows;
}

function parseShotSections(md, imgPrefix) {
  // Returns { sectionName: { imgs: [...], caps: [{title, text}] } }
  const sections = {};
  const parts = md.split(/^### `([a-z0-9-]+)`$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const name = parts[i];
    const body = parts[i + 1] || "";
    const imgs = [...body.matchAll(/<img src="([^"]+)"/g)].map((x) => x[1].replace(imgPrefix, ""));
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
    document.querySelectorAll(".lang-toggle button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-lang") === lang);
    });
  }
  window.mkSetLang = function (l) { lang = l; localStorage.setItem("mk-lang", l); apply(); };
  document.addEventListener("DOMContentLoaded", apply);
  apply();
  document.addEventListener("click", function (e) {
    var img = e.target.closest ? e.target.closest(".shot img") : null;
    if (img) {
      var box = document.createElement("div");
      box.className = "lightbox";
      box.innerHTML = '<img src="' + img.getAttribute("src") + '" alt="">';
      box.addEventListener("click", function () { box.remove(); });
      document.body.appendChild(box);
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") document.querySelectorAll(".lightbox").forEach(function (b) { b.remove(); });
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
.wrap { max-width: 1080px; margin: 0 auto; padding: 0 24px 80px; }
.hero { padding: 56px 0 8px; }
.hero h1 { margin: 0 0 10px; font-size: 34px; line-height: 1.2; letter-spacing: -0.02em; }
.hero p.lede { margin: 0; max-width: 760px; color: var(--muted); font-size: 16px; }
.hero .stats { display: flex; gap: 20px; margin: 22px 0 0; color: var(--muted); font-size: 13.5px; flex-wrap: wrap; }
.hero .stats strong { color: var(--text); font-size: 15px; margin-right: 5px; }
.install {
  display: flex; gap: 10px; flex-wrap: wrap; margin-top: 22px;
}
.install code {
  background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
  padding: 8px 14px; font-size: 13px; color: var(--text);
}
h2.group {
  margin: 44px 0 16px; font-size: 15px; font-weight: 650; letter-spacing: .04em;
  text-transform: uppercase; color: var(--muted);
}
[data-lang="zh"] h2.group { text-transform: none; letter-spacing: .08em; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.card {
  display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); overflow: hidden; color: var(--text); transition: box-shadow .15s, transform .15s;
}
.card:hover { text-decoration: none; box-shadow: 0 8px 24px rgba(24,24,27,.08); transform: translateY(-2px); }
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
.lightbox {
  position: fixed; inset: 0; z-index: 50; background: rgba(24,24,27,.86);
  display: flex; align-items: center; justify-content: center; padding: 4vh 4vw; cursor: zoom-out;
}
.lightbox img { max-width: 100%; max-height: 100%; border-radius: 8px; box-shadow: 0 24px 80px rgba(0,0,0,.5); }
.footer { margin-top: 64px; padding-top: 22px; border-top: 1px solid var(--border); color: var(--muted); font-size: 13px; }
@media (max-width: 640px) {
  .hero h1 { font-size: 26px; }
  .wrap { padding: 0 16px 60px; }
  .topbar { padding: 10px 16px; }
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

async function main() {
  const readmeEn = await fs.readFile(path.join(ROOT, "README.md"), "utf8");
  const readmeZh = await fs.readFile(path.join(DOCS, "README-zh-CN.md"), "utf8");
  const tableEn = parseTable(readmeEn);
  const tableZh = parseTable(readmeZh);
  const shotsEn = parseShotSections(readmeEn, "docs/");
  const shotsZh = parseShotSections(readmeZh, "");

  const dirs = (await fs.readdir(path.join(ROOT, "skills"), { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  // Display-name → folder mapping (kelly-writer lives in skills/kelly-content).
  const folderFor = (name) => (dirs.includes(name) ? name : name === "kelly-writer" ? "kelly-content" : name);

  const allNames = [
    ...new Set([...Object.keys(tableEn), ...dirs.map((d) => (d === "kelly-content" ? "kelly-writer" : d))]),
  ];

  const skills = {};
  for (const name of allNames) {
    const folder = folderFor(name);
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
      hasApp: shots.length > 0,
    };
  }

  // --- index.html ---
  let groupsHtml = "";
  const placed = new Set();
  for (const g of GROUPS) {
    const members = g.skills.filter((n) => skills[n]);
    if (!members.length) continue;
    members.forEach((n) => placed.add(n));
    groupsHtml += `<h2 class="group" id="${g.id}">${bilingual(esc(g.en), esc(g.zh))}</h2>\n<div class="grid">\n`;
    for (const n of members) groupsHtml += cardHtml(skills[n]);
    groupsHtml += "</div>\n";
  }
  const leftovers = allNames.filter((n) => !placed.has(n));
  if (leftovers.length) {
    groupsHtml += `<h2 class="group">${bilingual("More", "更多")}</h2>\n<div class="grid">\n`;
    for (const n of leftovers) groupsHtml += cardHtml(skills[n]);
    groupsHtml += "</div>\n";
  }

  const appCount = Object.values(skills).filter((s) => s.hasApp).length;
  const indexBody = `
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
  <div class="install">
    <code>npx skills add mr-kelly/skills</code>
    <code>/plugin marketplace add mr-kelly/skills</code>
  </div>
</section>
${groupsHtml}`;

  function cardHtml(s) {
    const thumb = s.shots[0];
    const thumbHtml = thumb
      ? `<div class="thumb"><img data-shot-en="${esc(thumb.en)}" data-shot-zh="${esc(thumb.zh)}" src="${esc(thumb.en)}" alt="${esc(s.name)} UI" loading="lazy"></div>`
      : `<div class="thumb empty">⚙️</div>`;
    const href = s.hasApp || s.descEn ? `s/${s.name}.html` : `${REPO_URL}/tree/main/skills/${s.folder}`;
    return `<a class="card" href="${href}">
  ${thumbHtml}
  <div class="body">
    <span class="name">${esc(s.name)}${s.hasApp ? `<span class="pill">${bilingual("App UI", "App UI")}</span>` : ""}</span>
    <span class="desc">${bilingual(esc(s.descEn), esc(s.descZh))}</span>
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
  <img data-shot-en="../${esc(sh.en)}" data-shot-zh="../${esc(sh.zh)}" src="../${esc(sh.en)}" alt="${esc(sh.capEn.title || s.name)}" loading="lazy">
  <figcaption class="cap">
    ${bilingual(`<strong>${esc(sh.capEn.title)}</strong><span>${esc(sh.capEn.text)}</span>`, `<strong>${esc(sh.capZh.title)}</strong><span>${esc(sh.capZh.text)}</span>`, "div")}
  </figcaption>
</figure>`,
      )
      .join("\n");

    const body = `
<section class="skill-hero">
  <a class="crumb" href="../index.html">${bilingual("&larr; All skills", "&larr; 全部 skills")}</a>
  <h1>${esc(s.name)}</h1>
  <p>${bilingual(esc(s.descEn), esc(s.descZh))}</p>
  <div class="skill-links">
    <a href="${REPO_URL}/tree/main/skills/${s.folder}" target="_blank" rel="noopener">${bilingual("Source", "源码")} ↗</a>
    <a href="${REPO_URL}/blob/main/skills/${s.folder}/SKILL.md" target="_blank" rel="noopener">SKILL.md ↗</a>
    <a href="${REPO_URL}/blob/main/skills/${s.folder}/README.md" target="_blank" rel="noopener">README ↗</a>
  </div>
</section>
${s.whenEn ? `<div class="panel"><h3>${bilingual("When to use it", "什么时候用")}</h3><p>${bilingual(esc(s.whenEn), esc(s.whenZh))}</p></div>` : ""}
${shotsHtml ? `<div class="shots">${shotsHtml}</div>` : ""}`;

    await fs.writeFile(
      path.join(PAGES_DIR, `${s.name}.html`),
      pageShell({ title: `${s.name} — mr-kelly/skills`, body, rel: "../" }),
    );
  }

  await fs.writeFile(path.join(DOCS, ".nojekyll"), "");
  console.log(`Built docs/index.html + ${Object.keys(skills).length} skill pages into docs/s/`);
}

await main();
