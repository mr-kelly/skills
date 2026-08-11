#!/usr/bin/env node
// Writes the companies and contact addresses an Agent discovered into Busabase.
// Usage: node scripts/import_leads.mjs findings.json [--apply]
//
// findings.json:
// {
//   "companies": [
//     { "key": "lanxi-tech", "name": "蓝汐科技", "website": "...", "sourceUrl": "...",
//       "industry": "...", "matchScore": 92, "matchReason": "...",
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
  mergeChangeRequest,
  parseFlags,
  readAll,
  resolveBases,
} from "./lib.mjs";

const { apply, positional } = parseFlags(process.argv.slice(2));
const inputPath = positional[0];
if (!inputPath) {
  console.error("Usage: node scripts/import_leads.mjs <findings.json> [--apply]");
  process.exit(1);
}

const findings = JSON.parse(await readFile(inputPath, "utf8"));
const companies = findings.companies || [];
const leads = findings.leads || [];

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
for (const company of newCompanies) console.log(`  + ${company.name} (${company.key}) 匹配度 ${company.matchScore}`);
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
