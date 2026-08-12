#!/usr/bin/env node
// Renders the job-search profile into a typeset PDF resume.
//
// Usage:
//   node scripts/build_resume.mjs           # dry run: writes the HTML preview only
//   node scripts/build_resume.mjs --apply   # writes resume/<name>.pdf and records the file name
//
// Layout is plain HTML + CSS printed by headless Chrome. That choice is
// deliberate: Chrome already ships the CJK fonts a Chinese resume needs, so the
// repo does not have to vendor a multi-megabyte font file, and the template
// stays editable by anyone who can read CSS.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { appConfig, createTrustedClient, dryRunBanner, fail, parseFlags, readAll, resolveBases } from "./lib.mjs";
import { renderPdf } from "./render_pdf.mjs";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { apply } = parseFlags(process.argv.slice(2));

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

// `resume-source` holds whatever the operator handed over, already tidied by
// the Agent during `/kelly-jobhunt profile`. Blank lines separate blocks; a
// line ending in a colon becomes a section heading.
const renderBlocks = (source) =>
  String(source || "")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trim());
      const [first, ...rest] = lines;
      if (/[:：]$/.test(first) && rest.length) {
        return `<section><h2>${escapeHtml(first.replace(/[:：]$/, ""))}</h2><ul>${rest
          .map((line) => `<li>${escapeHtml(line.replace(/^[-·•]\s*/, ""))}</li>`)
          .join("")}</ul></section>`;
      }
      return `<section><p>${lines.map(escapeHtml).join("<br />")}</p></section>`;
    })
    .join("");

const renderHtml = (profile) => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" /><title>${escapeHtml(profile.name)}</title>
<style>
  @page { size: A4; margin: 16mm 15mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: #1b2430;
    font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC",
      "Source Han Sans SC", Inter, system-ui, sans-serif;
    font-size: 10.5pt;
    line-height: 1.62;
  }
  header { border-bottom: 2px solid #18794e; padding-bottom: 10px; margin-bottom: 16px; }
  h1 { margin: 0; font-size: 20pt; letter-spacing: 0.5px; }
  .role { margin-top: 4px; color: #18794e; font-size: 12pt; font-weight: 700; }
  .contact { margin-top: 6px; color: #5b6a75; font-size: 9.5pt; }
  .contact span + span::before { content: " · "; }
  section { margin-bottom: 13px; page-break-inside: avoid; }
  h2 {
    margin: 0 0 6px;
    padding-bottom: 3px;
    border-bottom: 1px solid #dce1e5;
    color: #18794e;
    font-size: 11pt;
    letter-spacing: 1px;
  }
  ul { margin: 0; padding-left: 17px; }
  li { margin-bottom: 3px; }
  p { margin: 0; }
  footer { margin-top: 18px; color: #93a0aa; font-size: 8pt; text-align: right; }
</style></head>
<body>
  <header>
    <h1>${escapeHtml(profile.name)}</h1>
    <div class="role">${escapeHtml(profile.targetRole)}</div>
    <div class="contact">
      ${profile.fromEmail ? `<span>${escapeHtml(profile.fromEmail)}</span>` : ""}
      ${profile.locations ? `<span>${escapeHtml(profile.locations)}</span>` : ""}
      ${profile.industries ? `<span>${escapeHtml(profile.industries)}</span>` : ""}
    </div>
  </header>
  ${profile.highlights ? `<section><h2>个人概述</h2><p>${escapeHtml(profile.highlights)}</p></section>` : ""}
  ${renderBlocks(profile.resumeSource)}
  <footer>更新于 ${escapeHtml(profile.updatedAt || new Date().toISOString().slice(0, 10))}</footer>
</body></html>`;

const client = createTrustedClient();
const bases = await resolveBases(client);
const row = (await readAll(client, bases.get("profile")))[0];
if (!row) fail("求职档案还没填。先跑 /kelly-jobhunt profile，把你的简历交给它。");

const profile = {
  recordId: row.id,
  name: row.fields.name || "",
  targetRole: row.fields.target_role || "",
  locations: row.fields.locations || "",
  industries: row.fields.industries || "",
  highlights: row.fields.highlights || "",
  fromEmail: row.fields.from_email || "",
  resumeSource: row.fields.resume_source || "",
  updatedAt: row.fields.updated_at || "",
};

if (!profile.name || !profile.targetRole) fail("求职档案缺少姓名或目标岗位，排不出简历。先跑 /kelly-jobhunt profile。");
if (!profile.resumeSource && !profile.highlights) {
  fail("求职档案里没有任何简历内容（简历原文与自我介绍都是空的）。先跑 /kelly-jobhunt profile。");
}

const safeName = `${profile.name}-${profile.targetRole}`.replace(/[\\/:*?"<>|\s]+/g, "-");
const resumeDir = path.join(skillRoot, "resume");
await mkdir(resumeDir, { recursive: true });
const htmlPath = path.join(resumeDir, `${safeName}.html`);
const pdfName = `${safeName}.pdf`;
const pdfPath = path.join(resumeDir, pdfName);

await writeFile(htmlPath, renderHtml(profile), "utf8");

process.stdout.write(dryRunBanner(apply));
console.log(`姓名 ${profile.name} · 目标岗位 ${profile.targetRole}`);
console.log(
  `内容块 ${renderBlocks(profile.resumeSource).split("<section>").length - 1} 段 + 个人概述 ${profile.highlights ? "1" : "0"} 段`,
);
console.log(`HTML 预览已写入 ${htmlPath}`);
console.log(`将生成 ${pdfPath}`);

if (!apply) {
  console.log("\n先打开那份 HTML 看看排版对不对，满意了再加 --apply 生成 PDF。");
  process.exit(0);
}

try {
  await renderPdf(htmlPath, pdfPath, {
    userDataDir: path.join(skillRoot, ".tmp", "resume-chrome"),
    log: (line) => console.log(line),
  });
} catch (error) {
  fail(error.message);
}

await client.records.changeRequest({
  recordId: profile.recordId,
  operation: "update",
  fields: { "resume-file": pdfName, "updated-at": new Date().toISOString().slice(0, 10) },
  message: `Build typeset resume PDF for ${profile.name}`,
  author: appConfig.appId,
  autoMerge: true,
});

console.log(`\n已生成 ${pdfPath}，并把文件名记进求职档案。`);
console.log("下一步：/kelly-jobhunt research  去找目标公司。");
