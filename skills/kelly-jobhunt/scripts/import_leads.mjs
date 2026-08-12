#!/usr/bin/env node
// Writes the companies and contact addresses an Agent discovered into Busabase.
// Usage: node scripts/import_leads.mjs findings.json [--apply]
//
// findings.json:
// {
//   "companies": [
//     { "key": "lanxi-tech", "name": "蓝汐科技", "website": "...", "sourceUrl": "...",
//       "industry": "...", "matchScore": 92, "matchReason": "...",
//       "evidenceType": "official-site" | "aggregator" | "business-match",
//       "evidenceDate": "2026-08-12",
//       "emailSubject": "...", "emailBody": "..." }
//   ],
//   "leads": [
//     { "companyKey": "lanxi-tech", "email": "hr@...", "role": "HR 邮箱",
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

const EVIDENCE_TYPES = ["official-site", "aggregator", "business-match"];

// Evidence is recorded as given or left blank — never inferred. Guessing
// "official-site" because a website was supplied would let a stale aggregator
// listing sort to the top of the queue wearing the wrong badge.
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
  "match-score": Number(company.matchScore) || 0,
  "match-reason": company.matchReason || "",
  "email-subject": company.emailSubject || "",
  "email-body": company.emailBody || "",
  status: "draft",
  "evidence-type": evidenceType(company),
  "evidence-date": evidenceDate(company),
});

const leadFields = (lead) => ({
  email: lead.email,
  "company-key": lead.companyKey,
  role: lead.role || "通用",
  "source-url": lead.sourceUrl || "",
  confidence: ["high", "medium", "low"].includes(lead.confidence) ? lead.confidence : "medium",
});

const client = createTrustedClient();
const bases = await resolveBases(client);
const existingCompanies = new Map((await readAll(client, bases.get("companies"))).map((row) => [row.fields.key, row]));
const existingLeads = new Set(
  (await readAll(client, bases.get("leads"))).map((row) => `${row.fields.company_key}|${row.fields.email}`),
);

// An import must never re-open a company the operator already approved or sent,
// and must never mail the same address twice.
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
  console.log(`\n注意：${unlabelled} 家公司没有证据类型，审阅时无法判断岗位是否还有效。`);
  console.log("补上 evidenceType（official-site / aggregator / business-match）与 evidenceDate 会更好用。");
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
console.log("已写入 Busabase。打开 AirApp 即可逐条审阅并发送。");
