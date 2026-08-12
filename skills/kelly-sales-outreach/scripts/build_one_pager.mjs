#!/usr/bin/env node
// Render the stored offer into a factual one-page PDF. Every claim comes from
// the Busabase profile; the script never invents proof or customer outcomes.
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

const section = (title, value) =>
  value ? `<section><h2>${escapeHtml(title)}</h2><p>${escapeHtml(value).replaceAll("\n", "<br />")}</p></section>` : "";

const renderHtml = (profile) => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" /><title>${escapeHtml(profile.offerName)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #172033; font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif; font-size: 10.5pt; line-height: 1.65; }
  header { padding: 18px 0 15px; border-bottom: 3px solid #126b5d; margin-bottom: 20px; }
  .eyebrow { color: #126b5d; font-size: 9pt; font-weight: 750; text-transform: uppercase; }
  h1 { margin: 4px 0 8px; font-size: 24pt; line-height: 1.2; }
  .summary { max-width: 92%; color: #405063; font-size: 12pt; }
  section { margin: 0 0 16px; page-break-inside: avoid; }
  h2 { margin: 0 0 7px; color: #126b5d; font-size: 11pt; }
  p { margin: 0; }
  footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #d9e1e7; color: #667585; font-size: 9pt; }
</style></head><body>
  <header><div class="eyebrow">PRODUCT / SERVICE</div><h1>${escapeHtml(profile.offerName)}</h1><div class="summary">${escapeHtml(profile.offerSummary)}</div></header>
  ${section("客户价值", profile.valueProposition)}
  ${section("案例与证据", profile.proofPoints)}
  ${section("适合谁", profile.idealCustomer)}
  <footer>${escapeHtml(profile.sellerName || "")} ${profile.fromEmail ? ` · ${escapeHtml(profile.fromEmail)}` : ""}</footer>
</body></html>`;

const client = createTrustedClient();
const bases = await resolveBases(client);
const row = (await readAll(client, bases.get("profile")))[0];
if (!row) fail("产品资料还没填。先运行 /kelly-sales-outreach profile。");

const profile = {
  recordId: row.id,
  sellerName: row.fields.seller_name || "",
  offerName: row.fields.offer_name || "",
  offerSummary: row.fields.offer_summary || "",
  valueProposition: row.fields.value_proposition || "",
  proofPoints: row.fields.proof_points || "",
  idealCustomer: row.fields.ideal_customer || "",
  fromEmail: row.fields.from_email || "",
};
if (!profile.offerName || !profile.offerSummary) fail("产品资料缺少名称或说明，无法生成一页资料。");

const safeName = `${profile.offerName}-one-pager`.replace(/[\\/:*?"<>|\s]+/g, "-");
const outputDir = path.join(skillRoot, "collateral");
await mkdir(outputDir, { recursive: true });
const htmlPath = path.join(outputDir, `${safeName}.html`);
const pdfName = `${safeName}.pdf`;
const pdfPath = path.join(outputDir, pdfName);
await writeFile(htmlPath, renderHtml(profile), "utf8");

process.stdout.write(dryRunBanner(apply));
console.log(`产品或服务：${profile.offerName}`);
console.log(`HTML 预览已写入 ${htmlPath}`);
console.log(`将生成 ${pdfPath}`);
if (!apply) process.exit(0);

try {
  await renderPdf(htmlPath, pdfPath, {
    userDataDir: path.join(skillRoot, ".tmp", "one-pager-chrome"),
    log: (line) => console.log(line),
  });
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

await client.records.changeRequest({
  recordId: profile.recordId,
  operation: "update",
  fields: { "collateral-file": pdfName, "updated-at": new Date().toISOString().slice(0, 10) },
  message: `Build factual one-page collateral for ${profile.offerName}`,
  author: appConfig.appId,
  autoMerge: true,
});
console.log(`已生成 ${pdfPath}，并把文件名记录到产品与 ICP Base。`);
