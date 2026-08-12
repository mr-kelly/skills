#!/usr/bin/env node
// Sends every outreach the operator approved in the AirApp, then marks it sent.
// Usage: node scripts/send_emails.mjs [--apply] [--test-to <address>]
//
// Busabase credentials come from this process's own environment
// (BUSABASE_BASE_URL / BUSABASE_API_KEY / BUSABASE_SPACE_ID). The mailbox
// credentials come from the Busabase Vault, written once by
// scripts/configure_smtp.mjs. Neither ever reaches browser code.
//
// --test-to proves the transport — SMTP auth, optional attachment, and rendering of
// a real letter — by delivering to one address you own. It changes nothing in
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
if (!profile) fail("产品资料还没填，先在 AirApp 的「产品与 ICP」里保存一次。");

const fromEmail = profile.fields.from_email;
if (!fromEmail) fail("产品与 ICP 资料缺少发件邮箱。");

const collateralName = profile.fields.collateral_file || "";
const collateralPath = collateralName ? path.join(skillRoot, "collateral", collateralName) : "";
const collateralReady = collateralPath
  ? await access(collateralPath).then(
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
} = await resolveSmtpSettings({ fromEmail });

const SOURCE_LABEL = { environment: "环境变量注入", vault: "Vault", derived: "由发件地址推导" };

process.stdout.write(dryRunBanner(apply));
console.log(
  `发件人 ${fromEmail} · 销售资料 ${collateralName ? `${collateralName}${collateralReady ? "" : "（缺失）"}` : "无附件"}`,
);

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
  const hint = smtpMissingHint(smtpMissing, vaultAvailable);
  if (apply) fail(`SMTP 还没准备好，没有发送任何邮件。\n${hint}`);
  console.log(`\n注意：SMTP 还没准备好。\n${hint}`);
}

// Collateral is optional. Once explicitly configured it must exist, otherwise
// the approved email would promise an attachment that was silently omitted.
if (collateralName && !collateralReady) {
  if (apply) fail(`找不到销售资料 ${collateralPath}。把文件放到 skill 的 collateral/ 目录，或清空附件字段。`);
  console.log(`\n注意：已配置的销售资料不在 ${collateralPath}，加 --apply 前先补齐或清空字段。`);
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
  // Re-read immediately before the side effect. This prevents a stale dry run
  // from sending after another operator changed the row or recorded opt-out.
  const current = (await readAll(client, bases.get("companies"))).find((row) => row.id === company.id);
  if (!current || current.fields.status !== "queued" || current.fields.sent_at || current.fields.opted_out_at) {
    failures += 1;
    console.error(`  ✗ ${company.fields.name}：状态已变化，未发送`);
    continue;
  }
  const to = testTo || company.fields.sent_to;
  try {
    await transport.sendMail({
      from: fromEmail,
      to,
      // A test message is unmistakable if it lands in the wrong inbox.
      subject: testTo ? `[测试] ${company.fields.email_subject}` : company.fields.email_subject,
      text: company.fields.email_body,
      attachments: collateralReady ? [{ filename: collateralName, path: collateralPath }] : [],
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
  if (!failures) console.log("去收件箱确认排版和附件，没问题就跑 node scripts/send_emails.mjs --apply 正式发送。");
} else {
  console.log(`已发出 ${delivered} 封，失败 ${failures} 封。`);
}
if (failures) process.exitCode = 1;
