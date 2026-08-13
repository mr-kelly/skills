#!/usr/bin/env node
// Sends every outreach the operator approved in the AirApp, then marks it sent.
// Usage: node scripts/send_emails.mjs [--apply] [--test-to <address>]
//
// Busabase credentials come from this process's own environment
// (BUSABASE_BASE_URL / BUSABASE_API_KEY / BUSABASE_SPACE_ID). The mailbox
// credentials come from the Busabase Vault, written once by
// scripts/configure_smtp.mjs. Neither ever reaches browser code.
//
// --test-to proves the transport — SMTP auth and the rendering of a real letter,
// plus the attachment when one is configured — by delivering to one address
// you own. It changes nothing in
// Busabase: no contact row is rewritten, and every company stays `queued`,
// because nobody at that company was actually written to. Rehearsing by editing
// 25 contact rows to a test address, as the first live run did, destroys the
// research it took an hour to gather.
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
  resolveBases,
  resolveSmtpSettings,
  smtpMissingHint,
} from "./lib.mjs";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { apply } = parseFlags(process.argv.slice(2));

const testToIndex = process.argv.indexOf("--test-to");
const testTo = testToIndex >= 0 ? (process.argv[testToIndex + 1] || "").trim() : "";
if (testToIndex >= 0 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(testTo)) {
  fail("--test-to 需要一个邮箱地址，例如 --test-to me@qq.com");
}
// One letter is enough to prove the transport, and it is the letter the
// operator is about to send for real. Sending all 25 to yourself proves the
// same thing 25 times.
const testLimitIndex = process.argv.indexOf("--test-limit");
const testLimit = testLimitIndex >= 0 ? Number(process.argv[testLimitIndex + 1]) : 1;
if (testTo && (!Number.isInteger(testLimit) || testLimit < 1)) fail("--test-limit 必须是大于 0 的整数。");

const client = createTrustedClient();
const bases = await resolveBases(client);

const profile = (await readAll(client, bases.get("profile")))[0];
if (!profile) fail("求职档案还没填，先在 AirApp 的「我的资料」里保存一次。");

const fromEmail = profile.fields.from_email;
if (!fromEmail) fail("求职档案缺少发件邮箱。");

const resumeName = profile.fields.resume_file;
const resumePath = resumeName ? path.join(skillRoot, "resume", resumeName) : "";
const resumeReady = resumePath
  ? await access(resumePath).then(
      () => true,
      () => false,
    )
  : false;

const allQueued = (await readAll(client, bases.get("companies"))).filter((row) => row.fields.status === "queued");
const queued = testTo ? allQueued.slice(0, testLimit) : allQueued;

// Read readiness during a dry run too, so "你还没配邮箱" surfaces before the
// operator commits to sending rather than after.
const {
  values: smtp,
  status: smtpStatus,
  missing: smtpMissing,
  ready: smtpReady,
  vaultAvailable,
  runtimeAvailable,
} = await resolveSmtpSettings({ fromEmail });

const SOURCE_LABEL = {
  environment: "环境变量注入",
  vault: "Vault",
  "vault-runtime": "Vault 运行时",
  derived: "由发件地址推导",
};

process.stdout.write(dryRunBanner(apply));
console.log(`发件人 ${fromEmail} · 附件 ${resumeName ? `${resumeName}${resumeReady ? "" : "（缺失）"}` : "无"}`);

// Per item, and existence only: a value printed here would end up in a log, and
// one of these four is a password.
console.log("SMTP 就绪状态");
for (const item of smtpStatus) {
  console.log(`  ${item.key.padEnd(9)} ${item.ready ? `就绪 · ${SOURCE_LABEL[item.source]}` : "缺失"}`);
}

if (testTo) {
  console.log(`\n测试发送模式：全部改投 ${testTo}，公司联系人一个都不动。`);
  console.log(
    `队列里 ${allQueued.length} 封，本次只试发 ${queued.length} 封；发完仍是 queued，真正的收件人没有收到任何东西。`,
  );
}

console.log(`待发出 ${queued.length} 封`);
for (const company of queued) {
  const realTo = company.fields.sent_to;
  console.log(`  → ${company.fields.name} <${testTo ? `${testTo}（原本 ${realTo}）` : realTo}>`);
}

if (!smtpReady) {
  const hint = smtpMissingHint(smtpMissing, { vaultAvailable, runtimeAvailable });
  if (apply) fail(`SMTP 还没准备好，没有发送任何邮件。\n${hint}`);
  console.log(`\n注意：SMTP 还没准备好。\n${hint}`);
}

// A dry run exists to show the plan, so a missing attachment is a warning here
// and a hard stop only when something would actually be sent.
if (resumeName && !resumeReady) {
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
  const to = testTo || company.fields.sent_to;
  try {
    await transport.sendMail({
      from: fromEmail,
      to,
      // The subject says so on a test send, so a letter that lands in a real
      // inbox by mistake is never mistaken for an actual application.
      subject: testTo ? `[测试] ${company.fields.email_subject}` : company.fields.email_subject,
      text: company.fields.email_body,
      attachments: resumeReady ? [{ filename: resumeName, path: resumePath }] : [],
    });
  } catch (error) {
    // A bounced address leaves the row queued so the operator can pick another
    // address from the pool and retry, rather than silently losing the company.
    failures += 1;
    console.error(`  ✗ ${company.fields.name} <${to}>：${error instanceof Error ? error.message : error}`);
    continue;
  }
  // A test send writes nothing: the company was never contacted, so marking it
  // sent would drop it out of the queue it still belongs in.
  if (!testTo) {
    await client.records.changeRequest({
      recordId: company.id,
      operation: "update",
      fields: { status: "sent", "sent-at": sentAt },
      message: `Mark outreach to ${company.fields.name} as sent`,
      author: appConfig.appId,
      autoMerge: true,
    });
  }
  console.log(`  ✓ ${company.fields.name} <${to}>`);
}

transport.close();
const delivered = queued.length - failures;
if (testTo) {
  console.log(
    `测试发出 ${delivered} 封到 ${testTo}，失败 ${failures} 封。Busabase 没有任何改动，${allQueued.length} 封仍在队列里。`,
  );
  if (!failures) console.log("去收件箱确认正文和可选附件，没问题就跑 node scripts/send_emails.mjs --apply 正式发送。");
} else {
  console.log(`已发出 ${delivered} 封，失败 ${failures} 封。`);
}
if (failures) process.exitCode = 1;
