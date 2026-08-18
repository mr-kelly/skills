// Regression tests for the credential path that blocked a real end-to-end run:
// the skill reported "Cloud 没有 Vault" while the operator was looking at their
// configured Cloud Vault. Cloud has one; it just arrives as runtime-injected
// environment rather than through /api/v1/vault.
//
// A second regression landed 2026-08-18: as of busabase-cloud abe3453a1a
// (2026-08-13) Cloud stopped 404ing on /api/v1/vault — it now answers 200
// with every `.value` masked to "". A workspace API key was reading that
// masked response and reporting the credential missing even when it was
// configured and marked `access.runtime`, because the real value only ever
// arrives over the separate /api/v1/vault/runtime route Cloud added the same
// day. `resolveSmtpSettings` must be tested against the two routes
// separately, not one shared stub, or this regresses silently again.
import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveSmtpSettings,
  resolveSmtpSettings,
  smtpMissingHint,
} from "../../../skills/kelly-sales-outreach/scripts/lib.mjs";

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

// Routes by path so /api/v1/vault and /api/v1/vault/runtime can be given
// independent responses — real Cloud answers them very differently (masked
// document vs. real runtime values) and collapsing them into one stub is
// exactly how the 2026-08-18 regression went unnoticed.
const stubFetch = ({ vault, vaultRuntime } = {}) => {
  globalThis.fetch = async (url) => {
    const path = new URL(url).pathname;
    const route = path.endsWith("/vault/runtime") ? vaultRuntime : path.endsWith("/vault") ? vault : null;
    if (!route) return new Response("", { status: 404 });
    return new Response(route.status === 200 ? JSON.stringify(route.body) : "", {
      status: route.status,
      headers: { "content-type": "application/json" },
    });
  };
};

// Self-hosted Busabase: /api/v1/vault carries real values and there is no
// /api/v1/vault/runtime route at all (404 there, as a build without it would
// answer).
const stubVault = (status, items = []) =>
  stubFetch({ vault: { status, body: { items } }, vaultRuntime: { status: 404 } });

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
  // Neither Vault surface is reachable here (both 404) — a build with no
  // Vault at all, not specifically Cloud. `isCloud` is keyed off
  // /api/v1/vault/runtime answering, so it stays false and the generic
  // "no Vault here" hint applies, not the Cloud-specific one.
  await withEnv({ BUSABASE_BASE_URL: "https://example.busabase.internal", BUSABASE_API_KEY: "test-key" }, async () => {
    stubFetch({ vault: { status: 404 }, vaultRuntime: { status: 404 } });
    const result = await resolveSmtpSettings({ fromEmail: "me@qq.com" });

    // Host/port/user are derivable from the address; the password never is.
    assert.deepEqual(result.missing, ["SMTP_PASS"]);
    assert.equal(result.ready, false);
    assert.equal(result.vaultAvailable, false);
    assert.equal(result.isCloud, false);

    const hint = smtpMissingHint(result.missing, result.vaultAvailable, result.isCloud);
    assert.match(hint, /SMTP_PASS/);
    // No secret value or claim about where one is stored leaks into the hint.
    assert.doesNotMatch(hint, /injected|授权码值|from-vault|real-secret/);
  });
});

test("Cloud's masked /api/v1/vault cannot supply SMTP_PASS, but /api/v1/vault/runtime does", async () => {
  // This is the real end-to-end failure from the 2026-08-18 handoff report:
  // the operator confirmed SMTP_PASS in the Cloud Vault UI (runtime: true),
  // yet the script reported it missing. /api/v1/vault masks every `.value`
  // to "" for a workspace API key; /api/v1/vault/runtime is the surface that
  // actually answers with the real value that credential is entitled to.
  await withEnv({ BUSABASE_BASE_URL: "https://cloud.busabase.com", BUSABASE_API_KEY: "test-key" }, async () => {
    stubFetch({
      vault: {
        status: 200,
        body: { items: [{ key: "SMTP_PASS", value: "" }] }, // masked — never usable
      },
      vaultRuntime: {
        status: 200,
        body: { SMTP_PASS: "real-secret-from-runtime" },
      },
    });
    const result = await resolveSmtpSettings({ fromEmail: "me@qq.com" });

    assert.equal(result.values.SMTP_PASS, "real-secret-from-runtime");
    assert.equal(result.status.find((item) => item.key === "SMTP_PASS").source, "vault-runtime");
    assert.equal(result.ready, true);
    assert.equal(result.vaultAvailable, true);
    assert.equal(result.isCloud, true);
  });
});

test("Cloud hint points at the Vault UI and says a restart is not needed", async () => {
  await withEnv({ BUSABASE_BASE_URL: "https://cloud.busabase.com", BUSABASE_API_KEY: "test-key" }, async () => {
    // Configured in neither the masked document nor the runtime map yet —
    // genuinely missing, not just unreadable.
    stubFetch({ vault: { status: 200, body: { items: [] } }, vaultRuntime: { status: 200, body: {} } });
    const result = await resolveSmtpSettings({ fromEmail: "me@qq.com" });
    assert.equal(result.isCloud, true);

    const hint = smtpMissingHint(result.missing, result.vaultAvailable, result.isCloud);
    assert.match(hint, /SMTP_PASS/);
    assert.match(hint, /Busabase Cloud/);
    // The old message insisted on a new Session; the runtime route is a live
    // query, so a value saved now is visible on the very next run.
    assert.match(hint, /不用重开 Session/);
    assert.doesNotMatch(hint, /没有 Vault/);
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
