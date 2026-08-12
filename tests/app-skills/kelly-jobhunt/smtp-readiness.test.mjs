// Regression tests for the credential path that blocked a real end-to-end run:
// the skill reported "Cloud 没有 Vault" while the operator was looking at their
// configured Cloud Vault. Cloud has one; it just arrives as runtime-injected
// environment rather than through /api/v1/vault.
import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveSmtpSettings,
  resolveSmtpSettings,
  smtpMissingHint,
} from "../../../skills/kelly-jobhunt/scripts/lib.mjs";

const SMTP_ENV = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "BUSABASE_BASE_URL", "BUSABASE_API_KEY"];

// Each case owns the whole SMTP environment: a stray SMTP_PASS exported by the
// developer running the suite would otherwise turn a "missing" case green.
async function withEnv(env, run) {
  const saved = Object.fromEntries(SMTP_ENV.map((key) => [key, process.env[key]]));
  const savedFetch = globalThis.fetch;
  for (const key of SMTP_ENV) delete process.env[key];
  Object.assign(process.env, env);
  try {
    return await run();
  } finally {
    for (const key of SMTP_ENV) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    globalThis.fetch = savedFetch;
  }
}

const stubVault = (status, items = []) => {
  globalThis.fetch = async () =>
    new Response(status === 200 ? JSON.stringify({ items }) : "", {
      status,
      headers: { "content-type": "application/json" },
    });
};

test("Cloud has no /api/v1/vault, but runtime-injected env is enough to send", async () => {
  await withEnv(
    {
      BUSABASE_BASE_URL: "https://cloud.busabase.com",
      BUSABASE_API_KEY: "test-key",
      SMTP_HOST: "smtp.qq.com",
      SMTP_PORT: "465",
      SMTP_USER: "me@qq.com",
      SMTP_PASS: "injected-by-runtime",
    },
    async () => {
      // Every key came from the environment, so the Vault is never consulted at
      // all — a 404 round trip that cannot change the answer is not worth making.
      globalThis.fetch = async () => assert.fail("should not call the Vault when the environment is complete");
      const result = await resolveSmtpSettings({ fromEmail: "me@qq.com" });
      assert.equal(result.ready, true);
      assert.deepEqual(result.missing, []);
      assert.equal(result.values.SMTP_PASS, "injected-by-runtime");
      assert.deepEqual(
        result.status.map((item) => item.source),
        ["environment", "environment", "environment", "environment"],
      );
    },
  );
});

test("only the missing item is reported, and no secret is printed", async () => {
  await withEnv({ BUSABASE_BASE_URL: "https://cloud.busabase.com", BUSABASE_API_KEY: "test-key" }, async () => {
    stubVault(404);
    const result = await resolveSmtpSettings({ fromEmail: "me@qq.com" });

    // Host/port/user are derivable from the address; the password never is.
    assert.deepEqual(result.missing, ["SMTP_PASS"]);
    assert.equal(result.ready, false);
    assert.equal(result.vaultAvailable, false);

    const hint = smtpMissingHint(result.missing, result.vaultAvailable);
    assert.match(hint, /SMTP_PASS/);
    assert.match(hint, /新的 Session/);
    // The old message claimed the feature was absent. It is not.
    assert.doesNotMatch(hint, /没有 Vault/);
    assert.doesNotMatch(hint, /injected|授权码值/);
  });
});

test("a local Vault still supplies the values, and says so per item", async () => {
  await withEnv({ BUSABASE_BASE_URL: "http://localhost:3000", BUSABASE_API_KEY: "test-key" }, async () => {
    stubVault(200, [
      { key: "SMTP_HOST", value: "smtp.example.com" },
      { key: "SMTP_PORT", value: "587" },
      { key: "SMTP_USER", value: "me@example.com" },
      { key: "SMTP_PASS", value: "from-vault" },
    ]);
    const result = await resolveSmtpSettings({ fromEmail: "me@example.com" });
    assert.equal(result.ready, true);
    assert.equal(result.vaultAvailable, true);
    assert.equal(result.values.SMTP_HOST, "smtp.example.com");
    assert.ok(result.status.every((item) => item.source === "vault"));

    // On an instance that can store them, the fix is to write them, not to
    // start a new session.
    assert.match(smtpMissingHint(["SMTP_PASS"], true), /configure_smtp/);
  });
});

test("the environment overrides the Vault, so one run can use another mailbox", async () => {
  await withEnv(
    {
      BUSABASE_BASE_URL: "http://localhost:3000",
      BUSABASE_API_KEY: "test-key",
      SMTP_HOST: "smtp.override.com",
    },
    async () => {
      stubVault(200, [
        { key: "SMTP_HOST", value: "smtp.example.com" },
        { key: "SMTP_PORT", value: "587" },
        { key: "SMTP_USER", value: "me@example.com" },
        { key: "SMTP_PASS", value: "from-vault" },
      ]);
      const result = await resolveSmtpSettings({ fromEmail: "me@example.com" });
      assert.equal(result.values.SMTP_HOST, "smtp.override.com");
      assert.equal(result.status[0].source, "environment");
      assert.equal(result.status[3].source, "vault");
    },
  );
});

test("a QQ sender address implies its own server, and an explicit one still wins", () => {
  assert.deepEqual(deriveSmtpSettings("me@qq.com"), {
    SMTP_HOST: "smtp.qq.com",
    SMTP_PORT: "465",
    SMTP_USER: "me@qq.com",
  });
  assert.equal(deriveSmtpSettings("me@foxmail.com").SMTP_HOST, "smtp.qq.com");
  assert.equal(deriveSmtpSettings("me@outlook.com").SMTP_PORT, "587");
  // Nothing is guessed for a company domain — its MX is not its submission host.
  assert.deepEqual(deriveSmtpSettings("me@some-employer.cn"), {});
  assert.deepEqual(deriveSmtpSettings(""), {});
});

test("derivation never invents a password", async () => {
  await withEnv({ BUSABASE_BASE_URL: "https://cloud.busabase.com", BUSABASE_API_KEY: "test-key" }, async () => {
    stubVault(404);
    const result = await resolveSmtpSettings({ fromEmail: "me@163.com" });
    assert.equal(result.values.SMTP_HOST, "smtp.163.com");
    assert.equal(result.status[0].source, "derived");
    assert.equal(result.values.SMTP_PASS, "");
    assert.equal(result.ready, false);
  });
});
