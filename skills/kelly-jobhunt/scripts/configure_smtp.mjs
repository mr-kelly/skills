#!/usr/bin/env node
// Stores the job seeker's own SMTP credentials in the Busabase Vault, so the
// sender can resolve them later without anyone pasting a password into chat.
//
// Usage:
//   node scripts/configure_smtp.mjs --host smtp.qq.com --port 465 --user me@qq.com --pass <授权码>
//   node scripts/configure_smtp.mjs ... --apply
//
// The password may also arrive as SMTP_PASS in this process's environment, so
// it never has to appear in shell history:
//   SMTP_PASS=xxx node scripts/configure_smtp.mjs --host ... --user ... --apply
import {
  SMTP_KEYS,
  appConfig,
  createTrustedClient,
  dryRunBanner,
  fail,
  parseFlags,
  readAll,
  resolveBases,
  upsertVaultItems,
  vaultWriteUnavailableHint,
} from "./lib.mjs";

const VAULT_KEYS = SMTP_KEYS;

const flag = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
};

const { apply } = parseFlags(process.argv.slice(2));
const host = flag("host");
const port = flag("port") || "465";
const user = flag("user");
const pass = flag("pass") || process.env.SMTP_PASS || "";

if (!host || !user)
  fail("用法：node scripts/configure_smtp.mjs --host smtp.qq.com --port 465 --user 你的邮箱 --pass 授权码 [--apply]");
if (!pass) fail("缺少授权码。用 --pass 传入，或设置环境变量 SMTP_PASS（不会写进 shell 历史）。");
if (!/^\d+$/.test(port)) fail(`--port 必须是数字，收到 ${port}`);

const secret = (key, value, description) => ({
  kind: key === "SMTP_PASS" ? "secret" : "variable",
  key,
  value,
  scopeType: "personal",
  environment: "local",
  description,
  // reveal:false keeps the password out of the Busabase UI as well; the sender
  // resolves it at runtime, nobody needs to look at it.
  access: { runtime: true, reveal: key !== "SMTP_PASS", edit: true, share: false },
});

const items = [
  secret("SMTP_HOST", host, `${appConfig.appName} SMTP host`),
  secret("SMTP_PORT", port, `${appConfig.appName} SMTP port`),
  secret("SMTP_USER", user, `${appConfig.appName} SMTP user`),
  secret("SMTP_PASS", pass, `${appConfig.appName} SMTP app password`),
];

process.stdout.write(dryRunBanner(apply));
console.log(`将写入 Busabase Vault 的 ${VAULT_KEYS.length} 项（值不会打印，也不会写进任何 Base）：`);
console.log(`  SMTP_HOST = ${host}`);
console.log(`  SMTP_PORT = ${port}`);
console.log(`  SMTP_USER = ${user}`);
// Not even a masked password: a mask still leaks the length, and it would sit
// in whatever log or transcript captured this run.
console.log("  SMTP_PASS = 已提供（密文，不打印，仅发送脚本可读）");

if (!apply) process.exit(0);

const client = createTrustedClient();
const stored = await upsertVaultItems(items);
if (stored === null) fail(vaultWriteUnavailableHint);

// The Base records only the reference name, never the values.
const bases = await resolveBases(client);
const profile = (await readAll(client, bases.get("profile")))[0];
if (profile) {
  await client.records.changeRequest({
    recordId: profile.id,
    operation: "update",
    fields: { "smtp-vault-key": VAULT_KEYS.join(","), "from-email": profile.fields.from_email || user },
    message: "Record SMTP Vault reference names on the job-search profile",
    author: appConfig.appId,
    autoMerge: true,
  });
}

console.log("\n已写入 Vault。求职档案里只记了引用名，没有记任何值。");
console.log("下一步：node scripts/send_emails.mjs   （先预演，确认后加 --apply）");
