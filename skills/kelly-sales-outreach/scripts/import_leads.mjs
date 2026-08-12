#!/usr/bin/env node
// Writes target accounts and public business contacts discovered by the Agent.
// Usage: node scripts/import_leads.mjs findings.json [--apply]
//
// findings.json:
// {
//   "companies": [
//     { "key": "lanxi-tech", "name": "蓝汐科技", "website": "...", "sourceUrl": "...",
//       "industry": "...", "region": "...", "companySize": "...",
//       "matchScore": 92, "matchReason": "...", "painSignals": "...",
//       "evidenceType": "first-party" | "public-directory" | "market-signal",
//       "evidenceDate": "2026-08-12",
//       "emailSubject": "...", "emailBody": "..." }
//   ],
//   "leads": [
//     { "companyKey": "lanxi-tech", "email": "hello@...", "contactName": "...", "role": "销售负责人",
//       "sourceUrl": "...", "confidence": "high" }
//   ]
// }
import { readFile } from "node:fs/promises";

import {
  appConfig,
  createTrustedClient,
  dryRunBanner,
  fail,
  mergeChangeRequest,
  parseFlags,
  readAll,
  resolveBases,
} from "./lib.mjs";

const { apply, positional } = parseFlags(process.argv.slice(2));
const inputPath = positional[0];
if (!inputPath) fail("用法：node scripts/import_leads.mjs <findings.json> [--apply]");

const findings = await readFile(inputPath, "utf8")
  .then(JSON.parse)
  .catch((error) => fail(`读不了 ${inputPath}：${error instanceof Error ? error.message : error}`));
const companies = findings.companies || [];
const leads = findings.leads || [];
const invalidCompanies = companies.filter((company) => !company.key || !company.name || !company.sourceUrl);
if (invalidCompanies.length) fail("每家公司都必须有 key、name 和 sourceUrl；来源不明的公司不能导入。");
const invalidLeads = leads.filter(
  (lead) => !lead.companyKey || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lead.email || "") || !lead.sourceUrl,
);
if (invalidLeads.length) fail("每个联系人都必须有 companyKey、有效邮箱和公开 sourceUrl；猜测邮箱不能导入。");

const EVIDENCE_TYPES = ["first-party", "public-directory", "market-signal"];

// Evidence is recorded as given or left blank, never inferred from a URL.
const evidenceType = (company) => (EVIDENCE_TYPES.includes(company.evidenceType) ? company.evidenceType : "");

// When the finding was captured, not when it was imported: they differ once a
// research pass is reviewed the next day, and the whole point is staleness.
const evidenceDate = (company) => (/^\d{4}-\d{2}-\d{2}$/.test(company.evidenceDate || "") ? company.evidenceDate : "");

const companyFields = (company) => ({
  name: company.name,
  key: company.key,
  website: company.website || "",
  "source-url": company.sourceUrl || "",
  industry: company.industry || "",
  region: company.region || "",
  "company-size": company.companySize || "",
  "match-score": Number(company.matchScore) || 0,
  "match-reason": company.matchReason || "",
  "pain-signals": company.painSignals || "",
  "email-subject": company.emailSubject || "",
  "email-body": company.emailBody || "",
  status: "draft",
  "evidence-type": evidenceType(company),
  "evidence-date": evidenceDate(company),
});

const leadFields = (lead) => ({
  email: lead.email,
  "company-key": lead.companyKey,
  "contact-name": lead.contactName || "",
  role: lead.role || "业务联系人",
  "source-url": lead.sourceUrl || "",
  confidence: ["high", "medium", "low"].includes(lead.confidence) ? lead.confidence : "medium",
});

const client = createTrustedClient();
const bases = await resolveBases(client);
const existingCompanies = new Map((await readAll(client, bases.get("companies"))).map((row) => [row.fields.key, row]));
const knownCompanyKeys = new Set([...existingCompanies.keys(), ...companies.map((company) => company.key)]);
const orphanLeads = leads.filter((lead) => !knownCompanyKeys.has(lead.companyKey));
if (orphanLeads.length) {
  fail(`联系人引用了不存在的公司：${[...new Set(orphanLeads.map((lead) => lead.companyKey))].join("、")}`);
}
const existingLeads = new Set(
  (await readAll(client, bases.get("leads"))).map((row) => `${row.fields.company_key}|${row.fields.email}`),
);

// Never reopen a reviewed account or duplicate a public contact.
const newCompanies = companies.filter((company) => !existingCompanies.has(company.key));
const skippedCompanies = companies.filter((company) => existingCompanies.has(company.key));
const newLeads = leads.filter((lead) => !existingLeads.has(`${lead.companyKey}|${lead.email}`));

process.stdout.write(dryRunBanner(apply));
console.log(`公司：新增 ${newCompanies.length} 家，已存在跳过 ${skippedCompanies.length} 家`);
console.log(`邮箱：新增 ${newLeads.length} 个，重复跳过 ${leads.length - newLeads.length} 个`);
const unlabelled = newCompanies.filter((company) => !evidenceType(company)).length;
for (const company of newCompanies) {
  const evidence = evidenceType(company)
    ? `${evidenceType(company)}${evidenceDate(company) ? ` @ ${evidenceDate(company)}` : "（无日期）"}`
    : "无证据标注";
  console.log(`  + ${company.name} (${company.key}) 匹配度 ${company.matchScore} · ${evidence}`);
}
if (unlabelled) {
  console.log(`\n注意：${unlabelled} 家公司没有证据类型，审阅时无法判断来源强度。`);
  console.log("补上 evidenceType（first-party / public-directory / market-signal）与 evidenceDate 会更好用。");
}
for (const lead of newLeads) console.log(`  + ${lead.email} → ${lead.companyKey}`);

if (!apply) process.exit(0);

if (newCompanies.length) {
  const changeRequest = await client.bases.createBulkChangeRequest({
    baseId: bases.get("companies").baseId,
    records: newCompanies.map(companyFields),
    message: `Import ${newCompanies.length} target companies for ${appConfig.appName}`,
    submittedBy: appConfig.appId,
  });
  await mergeChangeRequest(client, changeRequest);
}
if (newLeads.length) {
  const changeRequest = await client.bases.createBulkChangeRequest({
    baseId: bases.get("leads").baseId,
    records: newLeads.map(leadFields),
    message: `Import ${newLeads.length} contact addresses for ${appConfig.appName}`,
    submittedBy: appConfig.appId,
  });
  await mergeChangeRequest(client, changeRequest);
}
console.log("已写入 Busabase。打开 AirApp 即可逐条审核目标、联系人和首触达草稿。");
