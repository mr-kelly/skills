import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { appConfig } from "../../../skills/kelly-security/content/kelly-security-app/app/js/config.js";
import { collectCheck, parseTransport, runSsh } from "../../../skills/kelly-security/lib/acquisition.mjs";
import { CHECKS } from "../../../skills/kelly-security/lib/catalog.mjs";
import { exportRun, reportMarkdown } from "../../../skills/kelly-security/lib/report.mjs";
import { executeRun, planRun } from "../../../skills/kelly-security/lib/runner.mjs";
import { connectStore, relationId } from "../../../skills/kelly-security/lib/store.mjs";
import { getFreePort, startProcess } from "../harness/process.mjs";

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const skillRoot = path.join(root, "skills/kelly-security");
const labRoot = path.join(root, "tests/app-skills/kelly-security/fixtures/ssh-lab");
const BUSABASE_VERSION = "0.99.1";
const LAB_IMAGE = "kelly-security-ssh-lab:1";
const LAB_BASE_DIGEST = "node@sha256:6449e19d8184d84062525b6a7524def03146c2cb04a7f08b076680d0e8e4240a";
const window = { start: "2026-10-25T00:00:00Z", end: "2026-10-26T00:00:00Z" };
const secrets = [
  "synthetic-auth-secret",
  "synthetic-curl-secret",
  "synthetic-query-secret",
  "synthetic-audit-secret",
  "synthetic-service-secret",
];
const command = (executable, args, options = {}) =>
  exec(executable, args, { cwd: root, maxBuffer: 8 * 1024 * 1024, timeout: 180000, ...options });
const runFilter = (runId) => [{ fieldSlug: "run-reference", operator: "eq", value: runId }];

const waitData = async (origin) => {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${origin}/api/v1/nodes?depth=1`, { signal: AbortSignal.timeout(2000) })).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Isolated Busabase data layer did not become ready");
};

test("actual OpenSSH collection, persisted Busabase workflow and report integrity", { timeout: 600000 }, async (t) => {
  try {
    await command("docker", ["info", "--format", "{{.ServerVersion}}"], { timeout: 10000 });
  } catch (error) {
    if (process.env.KELLY_SECURITY_REQUIRE_SSH_LAB === "1") throw error;
    t.skip(
      "Docker unavailable; real isolated SSH is not verified. Set KELLY_SECURITY_REQUIRE_SSH_LAB=1 to require it.",
    );
    return;
  }
  const work = await mkdtemp(path.join(os.tmpdir(), "kelly-security-ssh-oss-"));
  await chmod(work, 0o700);
  let containerId = "";
  let server;
  const externalOrigin = process.env.KELLY_SECURITY_TEST_BASE_URL;
  let origin;
  const emptyConfig = path.join(work, "empty-config");
  await writeFile(emptyConfig, "", { mode: 0o600 });
  const serverArgs = [];
  t.after(async () => {
    const failures = [];
    if (containerId) await command("docker", ["rm", "-f", containerId]).catch((error) => failures.push(error));
    if (server) await server.stop().catch((error) => failures.push(error));
    await rm(work, { recursive: true, force: true });
    assert.equal(failures.length, 0, "Lab cleanup must remove its container and processes");
  });
  if (externalOrigin) {
    const url = new URL(externalOrigin);
    assert.equal(url.protocol, "http:");
    assert.ok(
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname),
      "Only an explicit disposable loopback instance may be reused",
    );
    origin = url.origin;
  } else {
    origin = `http://127.0.0.1:${await getFreePort()}`;
    serverArgs.push(
      "--yes",
      `busabase@${BUSABASE_VERSION}`,
      "server",
      "--host",
      "127.0.0.1",
      "--port",
      new URL(origin).port,
      "--data",
      path.join(work, "busabase-data"),
    );
    server = await startProcess({
      command: "npx",
      args: serverArgs,
      cwd: work,
      env: { BUSABASE_CONFIG: emptyConfig, BUSABASE_API_KEY: "", BUSABASE_SPACE_ID: "local" },
      readyUrl: `${origin}/api/health`,
      timeoutMs: 180000,
    });
  }
  await waitData(origin);
  const env = {
    ...process.env,
    BUSABASE_BASE_URL: origin,
    BUSABASE_SPACE_ID: "local",
    BUSABASE_API_KEY: "",
    BUSABASE_CONFIG: emptyConfig,
  };
  process.env.BUSABASE_BASE_URL = origin;
  process.env.BUSABASE_SPACE_ID = "local";
  process.env.BUSABASE_API_KEY = "";
  await command(process.execPath, ["scripts/check.mjs"], { cwd: skillRoot, env });
  await command(process.execPath, ["scripts/setup.mjs", "--apply"], { cwd: skillRoot, env });
  const store = await connectStore();
  assert.equal(store.resources.bases.length, 6);
  assert.ok(store.resources.airApp, "Installation must include the actual AirApp, not only Bases");
  await command(process.execPath, ["scripts/setup.mjs", "--apply"], { cwd: skillRoot, env });
  const secondSetup = await connectStore();
  assert.deepEqual(
    secondSetup.resources.bases.map((base) => [base.key, base.baseId, base.nodeId]).sort(),
    store.resources.bases.map((base) => [base.key, base.baseId, base.nodeId]).sort(),
    "A repeated setup must reuse exactly the same owned resources",
  );
  for (const base of store.resources.bases) {
    const detail = await store.client.bases.get({ baseId: base.baseId });
    assert.deepEqual(
      detail.fields.map((field) => field.slug),
      appConfig.bases.find((declared) => declared.key === base.key).fields.map((field) => field.slug),
      `${base.key} must preserve the declared field order after package installation`,
    );
  }

  await command("docker", ["build", "--tag", LAB_IMAGE, labRoot]);
  const image = (await command("docker", ["image", "inspect", LAB_IMAGE, "--format", "{{.Id}}"])).stdout.trim();
  t.diagnostic(`SSH lab base ${LAB_BASE_DIGEST}; built ${image}; Busabase ${BUSABASE_VERSION}`);
  const clientDirectory = path.join(work, "client");
  const serverDirectory = path.join(work, "server");
  await mkdir(clientDirectory, { mode: 0o700 });
  await mkdir(serverDirectory, { mode: 0o700 });
  const identity = path.join(clientDirectory, "id_ed25519");
  const hostKey = path.join(serverDirectory, "host_ed25519");
  const wrongKey = path.join(clientDirectory, "wrong_host_ed25519");
  for (const filename of [identity, hostKey, wrongKey])
    await command("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", filename]);
  await writeFile(path.join(serverDirectory, "client.pub"), await readFile(`${identity}.pub`), { mode: 0o600 });
  containerId = (
    await command("docker", [
      "run",
      "--detach",
      "--rm",
      "--memory",
      "256m",
      "--cpus",
      "1",
      "--pids-limit",
      "128",
      "--publish",
      "127.0.0.1::22",
      "--mount",
      `type=bind,source=${serverDirectory},target=/lab/keys,readonly`,
      LAB_IMAGE,
    ])
  ).stdout.trim();
  const address = (await command("docker", ["port", containerId, "22/tcp"])).stdout.trim();
  assert.match(address, /^127\.0\.0\.1:\d+$/);
  const port = address.split(":")[1];
  const knownHosts = path.join(clientDirectory, "known_hosts");
  const wrongKnownHosts = path.join(clientDirectory, "wrong_known_hosts");
  await writeFile(knownHosts, `[127.0.0.1]:${port} ${(await readFile(`${hostKey}.pub`, "utf8")).trim()}\n`, {
    mode: 0o600,
  });
  await writeFile(wrongKnownHosts, `[127.0.0.1]:${port} ${(await readFile(`${wrongKey}.pub`, "utf8")).trim()}\n`, {
    mode: 0o600,
  });
  const config = path.join(clientDirectory, "config");
  const wrongConfig = path.join(clientDirectory, "wrong_config");
  const configText = (known) =>
    `Host kelly-lab\n  HostName 127.0.0.1\n  Port ${port}\n  User root\n  IdentityFile ${identity}\n  IdentitiesOnly yes\n  UserKnownHostsFile ${known}\n  GlobalKnownHostsFile /dev/null\n`;
  await writeFile(config, configText(knownHosts), { mode: 0o600 });
  await writeFile(wrongConfig, configText(wrongKnownHosts), { mode: 0o600 });
  const sshFor = (filename) => (alias, script) =>
    runSsh(alias, script, {
      // runSsh always calls the explicit argv/pipe overload; preserve that native
      // boundary while redirecting only this lab's SSH configuration.
      spawnProcess: /** @type {typeof spawn} */ (
        (executable, args, options) => spawn(executable, ["-F", filename, ...args], options)
      ),
    });
  const ssh = sshFor(config);
  let connected = false;
  for (let i = 0; i < 30; i++) {
    const response = await ssh("kelly-lab", "printf 'lab-ready\\n'\n");
    if (response.code === 0) {
      assert.match(response.stdout, /lab-ready/);
      connected = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert.ok(connected, "The disposable SSH server must accept the generated client key");
  const suffix = randomUUID();
  const host = await store.create(
    "hosts",
    {
      title: `SSH lab ${suffix}`,
      "ssh-alias": "kelly-lab",
      role: "Isolated synthetic Linux SSH fixture",
      "is-example": false,
    },
    `ssh-lab-host-${suffix}`,
  );
  const makeRun = (name) =>
    store.create(
      "runs",
      {
        title: `SSH lab ${name} ${suffix}`,
        host: host.id,
        "scope-reference": `lab-only-${suffix}`,
        "window-start": window.start,
        "window-end": window.end,
        "check-profile": "intrusion-triage",
        status: "requested",
        "requested-at": new Date().toISOString(),
      },
      `ssh-lab-${name}-${suffix}`,
    );
  const options = (run) => ({
    runId: run.id,
    aliases: ["kelly-lab"],
    scope: `lab-only-${suffix}`,
    start: window.start,
    end: window.end,
    directory: path.join(work, "evidence", run.id),
  });
  const collector = (input) => collectCheck({ ...input, ssh });
  let completedRun;

  await t.test("direct source acquisition executes all twelve Linux recipes with sound framing", async () => {
    for (const check of CHECKS) {
      const result = await collectCheck({
        alias: "kelly-lab",
        check,
        window,
        directory: path.join(work, "direct-evidence"),
        runId: `direct-${suffix}`,
        ssh,
      });
      assert.equal(result.code, 0, `${check.id} must finish its actual SSH collection`);
      const bytes = await readFile(path.join(work, "direct-evidence", result.artifact));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), result.sha256);
      const raw = JSON.parse(bytes.toString("utf8"));
      const transport = parseTransport(raw.stdout);
      assert.deepEqual(transport.gaps, [], `${check.id} transport framing must remain intact`);
      assert.ok(transport.sources.length > 0, `${check.id} must record sources or explicit coverage gaps`);
      assert.ok(!result.analysis.signals.some((signal) => signal.source === "/etc/shadow"));
      if (check.id === "ssh-authentication") {
        assert.ok(result.analysis.signals.some((signal) => signal.kind === "failed-then-success"));
        assert.ok(result.analysis.signals.some((signal) => signal.kind === "execution-record"));
      }
      if (check.id === "web-access-and-errors") {
        assert.ok(result.analysis.signals.some((signal) => signal.kind === "web-attack-attempt"));
        assert.ok(!result.analysis.signals.some((signal) => signal.kind === "successful-login"));
      }
      assert.notEqual(result.analysis.conclusion, "confirmed-malicious");
      for (const secret of secrets) assert.ok(!JSON.stringify(result.analysis).includes(secret));
    }
  });

  await t.test(
    "real host identity verification rejects a mismatched host key and stops after one attempt",
    async () => {
      const rejected = await sshFor(wrongConfig)("kelly-lab", "printf 'must-not-run\\n'\n");
      assert.equal(rejected.code, 255);
      assert.equal(rejected.stdout, "");
      const run = await makeRun("identity-denied");
      let attempts = 0;
      await assert.rejects(
        executeRun(store, options(run), {
          collector: async (input) => {
            attempts++;
            return collectCheck({ ...input, ssh: sshFor(wrongConfig) });
          },
        }),
        /SSH_CONNECTION_REJECTED/,
      );
      assert.equal(attempts, 1);
      const failed = await store.get("runs", run.id);
      assert.equal(failed.fields.status, "failed");
      const checks = await store.page("checks", { valueFilters: runFilter(run.id) });
      assert.equal(checks.records.length, 1);
      assert.equal(checks.records[0].fields.status, "failed");
    },
  );
  await t.test("the stored task cannot expand the local host or time authorization", async () => {
    const run = await makeRun("authorization-denied");
    await assert.rejects(
      planRun(store, { ...options(run), aliases: ["some-other-host"] }),
      /HOST_OUTSIDE_CURRENT_SESSION_AUTHORIZATION/,
    );
    await assert.rejects(
      planRun(store, { ...options(run), start: "2026-10-25T12:00:00Z" }),
      /WINDOW_OUTSIDE_CURRENT_SESSION_AUTHORIZATION/,
    );
    assert.equal((await store.page("checks", { valueFilters: runFilter(run.id) })).records.length, 0);
    assert.equal((await store.get("runs", run.id)).fields.status, "requested");
  });
  await t.test(
    "all fixed recipes run via OpenSSH and write redacted, attributable, hash-verifiable evidence",
    async () => {
      completedRun = await makeRun("complete");
      const runOptions = options(completedRun);
      let acquired = 0;
      const result = await executeRun(store, runOptions, {
        collector: async (input) => {
          acquired++;
          const running = await store.get("runs", completedRun.id);
          assert.equal(running.fields.status, "running", "Run progress must be persisted before remote collection");
          const checkPage = await store.page("checks", { valueFilters: runFilter(completedRun.id) });
          assert.ok(
            checkPage.records.some(
              (row) => row.fields["check-id"] === input.check.id && row.fields.status === "running",
            ),
          );
          if (acquired === 1)
            await assert.rejects(
              executeRun(store, { ...runOptions, resume: true }, { collector }),
              /ANOTHER_RUNNER_HAS_LIVE_CLAIM/,
            );
          return collector(input);
        },
      });
      assert.equal(acquired, CHECKS.length);
      assert.equal(result.outcomes.length, 12);
      const report = await exportRun(store, completedRun.id);
      assert.equal(report.complete, true);
      assert.equal(report.checks.length, 12);
      for (const check of report.checks) {
        assert.equal(check.fields["run-reference"], completedRun.id);
        assert.equal(relationId(check.fields.run), completedRun.id);
      }
      assert.ok(report.evidence.length >= 12);
      assert.ok(report.findings.length >= 3, "Synthetic sudo, Web and persistence leads must remain reviewable");
      assert.ok(
        report.findings.every(
          (finding) => finding.fields.conclusion === "suspicious" && finding.fields.verdict === "needs-review",
        ),
      );
      for (const finding of report.findings) {
        assert.equal(finding.fields["run-reference"], completedRun.id);
        assert.equal(relationId(finding.fields.run), completedRun.id);
      }
      for (const evidence of report.evidence) {
        assert.equal(evidence.fields["check-reference"], relationId(evidence.fields.check));
      }
      const content = JSON.stringify({ checks: report.checks, evidence: report.evidence, findings: report.findings });
      for (const secret of secrets)
        assert.ok(!content.includes(secret), `The published evidence must redact ${secret}`);
      assert.ok(
        !report.evidence.some((row) => String(row.fields["source-locator"]).startsWith("/etc/shadow")),
        "A log body cannot forge its source path",
      );
      assert.ok(report.evidence.some((row) => String(row.fields["source-locator"]).startsWith("/var/log/auth.log:")));
      for (const evidence of report.evidence) {
        const artifact = path.join(runOptions.directory, String(evidence.fields["artifact-reference"]));
        const bytes = await readFile(artifact);
        assert.equal(createHash("sha256").update(bytes).digest("hex"), evidence.fields.sha256);
        assert.equal((await stat(artifact)).mode & 0o777, 0o600);
      }
      assert.equal((await stat(runOptions.directory)).mode & 0o777, 0o700);
      const authCheck = report.checks.find((row) => row.fields["check-id"] === "ssh-authentication");
      const authEvidence = report.evidence.find((row) => relationId(row.fields.check) === authCheck.id);
      const raw = JSON.parse(
        await readFile(path.join(runOptions.directory, String(authEvidence.fields["artifact-reference"])), "utf8"),
      );
      const transport = parseTransport(raw.stdout);
      assert.equal(transport.gaps.length, 0);
      assert.ok(
        transport.sources.find((item) => item.source === "/var/log/auth.log").text.includes("KELLY_SOURCE /etc/shadow"),
      );
      const markdown = reportMarkdown(report);
      assert.match(markdown, /采集完成不等于已排除入侵/);
      assert.match(markdown, /SHA-256/);
      assert.match(markdown, /HTTP|Web/);
      for (const secret of secrets) assert.ok(!markdown.includes(secret));
      const reportPath = path.join(work, "report.md");
      await command(process.execPath, ["scripts/report.mjs", "--run", completedRun.id, "--output", reportPath], {
        cwd: skillRoot,
        env,
      });
      assert.match(await readFile(reportPath, "utf8"), /Linux 入侵核查报告/);
      await assert.rejects(
        command(process.execPath, ["scripts/report.mjs", "--run", completedRun.id, "--output", reportPath], {
          cwd: skillRoot,
          env,
        }),
        /EEXIST/,
      );
      const capped = await exportRun(store, completedRun.id, { maxRows: 1 });
      assert.equal(capped.complete, false);
      const reconnected = await connectStore();
      assert.equal((await reconnected.get("runs", completedRun.id)).fields.status, result.status);
      assert.equal((await exportRun(reconnected, completedRun.id)).evidence.length, report.evidence.length);
      t.diagnostic(
        `Real acquisition persisted ${report.checks.length} checks, ${report.evidence.length} evidence rows and ${report.findings.length} review leads.`,
      );
    },
  );
  await t.test("cancellation preserves the current real collection and prevents subsequent SSH", async () => {
    const run = await makeRun("cancelled");
    let count = 0;
    const result = await executeRun(store, options(run), {
      collector: async (input) => {
        count++;
        const evidence = await collector(input);
        const fresh = await store.get("runs", run.id);
        await store.update("runs", fresh, { status: "cancelled" });
        return evidence;
      },
    });
    assert.equal(result.status, "cancelled");
    assert.equal(count, 1);
    assert.equal((await exportRun(store, run.id)).checks.length, 1);
    await assert.rejects(executeRun(store, { ...options(run), resume: true }, { collector }), /RUN_NOT_EXECUTABLE/);
  });
  await t.test("an interrupted real run resumes without overwriting completed evidence", async () => {
    const run = await makeRun("resume");
    let count = 0;
    await assert.rejects(
      executeRun(store, options(run), {
        collector: async (input) => {
          count++;
          if (count === 2) throw new Error("synthetic interruption");
          return collector(input);
        },
      }),
      /synthetic interruption/,
    );
    const before = await exportRun(store, run.id);
    assert.equal(before.checks.filter((row) => row.fields.status === "completed").length, 1);
    const original = before.evidence[0];
    const result = await executeRun(store, { ...options(run), resume: true }, { collector });
    assert.ok(["partial", "completed"].includes(result.status));
    const after = await exportRun(store, run.id);
    assert.equal(after.checks.length, 13, "The interrupted attempt remains alongside twelve latest recipe outcomes");
    const preserved = after.evidence.find((row) => row.id === original.id);
    assert.equal(preserved.fields.sha256, original.fields.sha256);
    assert.equal(preserved.fields["artifact-reference"], original.fields["artifact-reference"]);
  });
  if (!externalOrigin)
    await t.test("isolated Busabase restart retains the actual investigation", async () => {
      const before = await exportRun(await connectStore(), completedRun.id);
      await server.stop();
      server = await startProcess({
        command: "npx",
        args: serverArgs,
        cwd: work,
        env: { BUSABASE_CONFIG: emptyConfig, BUSABASE_API_KEY: "", BUSABASE_SPACE_ID: "local" },
        readyUrl: `${origin}/api/health`,
        timeoutMs: 180000,
      });
      await waitData(origin);
      const after = await exportRun(await connectStore(), completedRun.id);
      assert.equal(after.evidence.length, before.evidence.length);
      assert.equal(after.checks.length, before.checks.length);
      assert.deepEqual(
        after.evidence.map((row) => row.fields.sha256).sort(),
        before.evidence.map((row) => row.fields.sha256).sort(),
      );
    });
  else
    t.diagnostic(
      "Explicit shared disposable-instance mode: persistence checked through a new SDK connection; restart intentionally not performed.",
    );
});
