#!/usr/bin/env node
// Sends every outreach the operator approved in the AirApp, then marks it sent.
// Usage: node scripts/send_emails.mjs [--apply]
//
// Busabase credentials come from this process's own environment
// (BUSABASE_BASE_URL / BUSABASE_API_KEY / BUSABASE_SPACE_ID). The mailbox
// credentials come from the Busabase Vault, written once by
// scripts/configure_smtp.mjs. Neither ever reaches browser code.
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import nodemailer from "nodemailer";

import {
  appConfig,
  createTrustedClient,
  dryRunBanner,
  fail,
  parseFlags,
  readAll,
  readVaultValues,
  resolveBases,
} from "./lib.mjs";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { apply } = parseFlags(process.argv.slice(2));

const client = createTrustedClient();
const bases = await resolveBases(client);

const profile = (await readAll(client, bases.get("profile")))[0];
if (!profile) fail("求职档案还没填，先在 AirApp 的「我的资料」里保存一次。");

const fromEmail = profile.fields.from_email;
if (!fromEmail) fail("求职档案缺少发件邮箱。");

const resumeName = profile.fields.resume_file;
if (!resumeName) fail("求职档案缺少简历文件名。");
const resumePath = path.join(skillRoot, "resume", resumeName);
const resumeReady = await access(resumePath).then(
  () => true,
  () => false,
);

const queued = (await readAll(client, bases.get("companies"))).filter((row) => row.fields.status === "queued");

// Read readiness during a dry run too, so "你还没配邮箱" surfaces before the
// operator commits to sending rather than after.
const { values: smtp, source: smtpSource } = await readVaultValues([
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
]);
const smtpReady = Boolean(smtp.SMTP_HOST && smtp.SMTP_USER && smtp.SMTP_PASS);

process.stdout.write(dryRunBanner(apply));
console.log(`发件人 ${fromEmail} · 附件 ${resumeName}${resumeReady ? "" : "（缺失）"}`);
console.log(
  `SMTP ${smtpReady ? `已配置（${smtp.SMTP_HOST}:${smtp.SMTP_PORT || 465}，凭据来自${smtpSource === "vault" ? " Vault" : "环境变量"}）` : "未配置"}`,
);
console.log(`待发出 ${queued.length} 封`);
for (const company of queued) console.log(`  → ${company.fields.name} <${company.fields.sent_to}>`);

if (!smtpReady) {
  const hint =
    smtpSource === "vault"
      ? "先跑 node scripts/configure_smtp.mjs --host ... --user ... --pass ... --apply"
      : "这台 Busabase 没有 Vault，请用环境变量 SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS 提供凭据";
  if (apply) fail(`没有可用的 SMTP 凭据。${hint}`);
  console.log(`\n注意：还没有可用的 SMTP 凭据。${hint}`);
}

// A dry run exists to show the plan, so a missing attachment is a warning here
// and a hard stop only when something would actually be sent.
if (!resumeReady) {
  if (apply) fail(`找不到简历附件 ${resumePath}。把 PDF 放到 skill 的 resume/ 目录再运行。`);
  console.log(`\n注意：简历附件还不在 ${resumePath}，加 --apply 之前先放进去。`);
}

if (!apply || !queued.length) process.exit(0);

const port = Number(smtp.SMTP_PORT || 465);
const transport = nodemailer.createTransport({
  host: smtp.SMTP_HOST,
  port,
  secure: port === 465,
  auth: { user: smtp.SMTP_USER, pass: smtp.SMTP_PASS },
});

const sentAt = new Date().toISOString().slice(0, 10);
let failures = 0;

for (const company of queued) {
  const to = company.fields.sent_to;
  try {
    await transport.sendMail({
      from: fromEmail,
      to,
      subject: company.fields.email_subject,
      text: company.fields.email_body,
      attachments: [{ filename: resumeName, path: resumePath }],
    });
  } catch (error) {
    // A bounced address leaves the row queued so the operator can pick another
    // address from the pool and retry, rather than silently losing the company.
    failures += 1;
    console.error(`  ✗ ${company.fields.name} <${to}>：${error instanceof Error ? error.message : error}`);
    continue;
  }
  await client.records.changeRequest({
    recordId: company.id,
    operation: "update",
    fields: { status: "sent", "sent-at": sentAt },
    message: `Mark outreach to ${company.fields.name} as sent`,
    author: appConfig.appId,
    autoMerge: true,
  });
  console.log(`  ✓ ${company.fields.name} <${to}>`);
}

transport.close();
console.log(`已发出 ${queued.length - failures} 封，失败 ${failures} 封。`);
if (failures) process.exitCode = 1;
