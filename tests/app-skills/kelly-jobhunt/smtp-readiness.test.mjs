// Regression tests for the credential path that blocked a real end-to-end run:
// the skill reported "Cloud 没有 Vault" while the operator was looking at their
// configured Cloud Vault.
//
// Cloud now serves both routes: `/api/v1/vault` with every secret masked to "",
// and `/api/v1/vault/runtime` with the values of items marked `access.runtime`.
// A self-hosted instance serves the first with real values and has no second.
// Which routes answer is the only reliable way to tell them apart.
import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveSmtpSettings,
  resolveSmtpSettings,
  smtpMissingHint,
  upsertVaultItems,
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

const json = (status, body) =>
  new Response(status === 200 ? JSON.stringify(body) : "", {
    status,
    headers: { "content-type": "application/json" },
  });

// A self-hosted instance: /api/v1/vault holds real values, no runtime route.
const stubVault = (status, items = []) => {
  globalThis.fetch = async (url) => (String(url).endsWith("/vault/runtime") ? json(404) : json(status, { items }));
};

// Cloud: the same items with secrets masked, plus a runtime route carrying the
// values of whatever was marked `access.runtime`.
const stubCloud = (items, runtime) => {
  const masked = items.map((item) => ({
    scopeType: "personal",
    kind: "secret",
    ...item,
    value: (item.kind ?? "secret") === "secret" ? "" : item.value,
  }));
  globalThis.fetch = async (url) =>
    String(url).endsWith("/vault/runtime") ? json(200, runtime) : json(200, { items: masked });
};

test("runtime-injected env alone is enough, and skips the Vault entirely", async () => {
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

test("only the missing item is reported, and the hint never prints a secret", async () => {
  await withEnv({ BUSABASE_BASE_URL: "https://cloud.busabase.com", BUSABASE_API_KEY: "test-key" }, async () => {
    stubCloud([{ key: "SMTP_HOST", value: "smtp.qq.com", kind: "variable" }], {});
    const result = await resolveSmtpSettings({ fromEmail: "me@qq.com" });

    // Host/port/user are derivable from the address; the password never is, so
    // it is the only thing the operator can still be missing.
    assert.deepEqual(result.missing, ["SMTP_PASS"]);
    assert.equal(result.ready, false);

    const hint = smtpMissingHint(result.missing, result);
    assert.match(hint, /SMTP_PASS/);
    // The message that started all of this claimed the feature was absent.
    assert.doesNotMatch(hint, /没有 Vault/);
    assert.doesNotMatch(hint, /app-password|授权码值/);
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

    // On an instance that can store them, the fix is to write them.
    assert.match(smtpMissingHint(["SMTP_PASS"], result), /configure_smtp/);
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

test("on Cloud the value comes from the runtime route, not the masked list", async () => {
  await withEnv({ BUSABASE_BASE_URL: "https://cloud.busabase.com", BUSABASE_API_KEY: "test-key" }, async () => {
    // This is the whole point of the follow-up: the masked GET can only say
    // SMTP_PASS exists. Reading its value used to require saving it and then
    // restarting the session so the env injection picked it up.
    stubCloud(
      [
        { key: "SMTP_HOST", value: "smtp.qq.com", kind: "variable" },
        { key: "SMTP_PORT", value: "465", kind: "variable" },
        { key: "SMTP_USER", value: "me@qq.com", kind: "variable" },
        { key: "SMTP_PASS", value: "app-password" },
      ],
      { SMTP_PASS: "app-password", UNRELATED: "not-ours" },
    );

    const result = await resolveSmtpSettings({ fromEmail: "me@qq.com" });
    assert.equal(result.ready, true);
    assert.equal(result.values.SMTP_PASS, "app-password");
    // Non-secrets come straight off the list; the password could only have come
    // from the runtime route.
    assert.deepEqual(
      result.status.map((item) => item.source),
      ["vault", "vault", "vault", "vault-runtime"],
    );
    assert.equal(result.vaultAvailable, true);
    assert.equal(result.runtimeAvailable, true);
  });
});

test("a Cloud instance is told it can write, and that no restart is needed", async () => {
  await withEnv({ BUSABASE_BASE_URL: "https://cloud.busabase.com", BUSABASE_API_KEY: "test-key" }, async () => {
    stubCloud([{ key: "SMTP_HOST", value: "smtp.qq.com", kind: "variable" }], {});
    const result = await resolveSmtpSettings({ fromEmail: "me@qq.com" });

    assert.deepEqual(result.missing, ["SMTP_PASS"]);
    const hint = smtpMissingHint(result.missing, result);
    assert.match(hint, /configure_smtp/);
    // configure_smtp writes to the personal scope with runtime set, so the value
    // is readable immediately. The old advice sent people to restart a session.
    assert.match(hint, /不用重开 Session/);
    assert.doesNotMatch(hint, /没有 Vault/);
  });
});

test("with no vault route at all, the environment is named as the way through", async () => {
  await withEnv({ BUSABASE_BASE_URL: "http://old-selfhosted:3000", BUSABASE_API_KEY: "test-key" }, async () => {
    globalThis.fetch = async () => new Response("", { status: 404 });
    const result = await resolveSmtpSettings({ fromEmail: "me@qq.com" });

    assert.equal(result.vaultAvailable, false);
    assert.equal(result.runtimeAvailable, false);
    const hint = smtpMissingHint(result.missing, result);
    assert.match(hint, /SMTP_PASS=\.\.\./);
    assert.doesNotMatch(hint, /configure_smtp/);
  });
});

test("writing credentials back keeps ids and leaves other scopes alone", async () => {
  await withEnv({ BUSABASE_BASE_URL: "https://cloud.busabase.com", BUSABASE_API_KEY: "test-key" }, async () => {
    // Cloud masks secrets on read and reads a blank secret as "keep the stored
    // value", matched by id. Stripping ids — they look like server bookkeeping —
    // used to blank every secret in the scope this script had not set itself.
    // Sending back Space-scoped items is the other half: Cloud takes the write's
    // target scope from the items, so a mixed batch is refused outright.
    let written = null;
    globalThis.fetch = async (url, init) => {
      if (init?.method === "PUT") {
        written = JSON.parse(init.body);
        return json(200, { items: [] });
      }
      return json(200, {
        items: [
          { id: "itm_1", key: "UNRELATED_TOKEN", kind: "secret", value: "", scopeType: "personal" },
          { id: "itm_2", key: "SPACE_TOKEN", kind: "secret", value: "", scopeType: "workspace", scopeId: "spc_1" },
        ],
      });
    };

    await upsertVaultItems([{ kind: "secret", key: "SMTP_PASS", value: "app-password", scopeType: "personal" }]);

    const keys = written.items.map((entry) => entry.key).sort();
    assert.deepEqual(keys, ["SMTP_PASS", "UNRELATED_TOKEN"], "only the personal scope is rewritten");

    const untouched = written.items.find((entry) => entry.key === "UNRELATED_TOKEN");
    assert.equal(untouched.id, "itm_1", "the id has to survive or the blank wipes the stored value");
    assert.equal(untouched.value, "", "a masked secret is written back blank, meaning keep");
  });
});
