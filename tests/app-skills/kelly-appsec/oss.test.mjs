import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, symlink } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { importInventory } from "../../../skills/kelly-appsec/lib/inventory.mjs";
import { executeRun, planRun } from "../../../skills/kelly-appsec/lib/runner.mjs";
import { eq, startOss } from "../security-suite-harness/oss.mjs";
import { inventoryFixture, startApiFixture } from "./fixtures/api.mjs";

test(
  "AppSec installs and evaluates real authorized API behavior with persistent evidence",
  { timeout: 300000 },
  async (t) => {
    const lab = await startOss(t, "kelly-appsec");
    const api = await startApiFixture(t);
    const project = await lab.store.create(
      "projects",
      {
        title: "Synthetic order API",
        owner: "Lab reviewer",
        "repository-reference": "fixture:api.mjs",
        "source-revision": "rev-a",
        environment: "lab",
        origin: api.origin,
        "scope-note": "isolated-order-test",
        "onboarding-version": 1,
        "onboarding-state": "complete",
        "is-example": false,
      },
      "appsec-orders-project",
    );
    const document = inventoryFixture();
    const inventory = await importInventory(lab.store, { projectId: project.id, document });
    const first = inventory.rules.map((row) => row.id);
    const again = await importInventory(lab.store, { projectId: project.id, document });
    assert.deepEqual(
      again.rules.map((row) => row.id),
      first,
      "A repeated import must not duplicate inventory",
    );
    const fullRules = inventory.rules.filter((row) => !row.fields["record-key"].endsWith(":redirect"));
    const makeRun = (title, rules = fullRules, fields = {}) =>
      lab.store.create(
        "runs",
        {
          title,
          "project-reference": project.id,
          "source-revision": "rev-a",
          environment: "lab",
          origin: api.origin,
          "scope-reference": "isolated-order-test",
          "rule-snapshot": rules.map((row) => ({ id: row.id, headCommitId: row.headCommitId })),
          mode: "dynamic",
          status: "requested",
          "requested-at": new Date().toISOString(),
          project: project.id,
          ...fields,
        },
        `appsec-${title}`,
      );
    const authorization = (run, changes = {}) => ({
      runId: run.id,
      projectId: project.id,
      origin: api.origin,
      environment: "lab",
      revision: "rev-a",
      scope: "isolated-order-test",
      allowedMethods: ["GET"],
      allowedPaths: document.endpoints.map((endpoint) => endpoint.path),
      allowedObjectIds: ["test-a", "test-b", "public"],
      credentials: { "user-a": "synthetic-a-token", "user-b": "synthetic-b-token", anonymous: "synthetic-admin-token" },
      allowMutations: false,
      requestLimit: 100,
      directory: path.join(lab.work, "evidence", run.id),
      ...changes,
    });
    let completedRun;

    await t.test("scope, project, revision and path are independently enforced before HTTP", async () => {
      for (const change of [
        { revision: "other-revision" },
        { environment: "production" },
        { scope: "other-case" },
        { allowedPaths: ["/public"] },
        { origin: "https://outside.example.test" },
      ]) {
        const run = await makeRun(`deny-${Object.keys(change)[0]}`);
        const count = api.requests.length;
        await assert.rejects(executeRun(lab.store, authorization(run, change)));
        assert.equal(api.requests.length, count);
        assert.equal((await lab.store.get("runs", run.id)).fields.status, "requested");
      }
    });

    await t.test("stored counters cannot expand a smaller local request budget", async () => {
      const run = await makeRun("invalid-counter", fullRules, { "request-count": -10 });
      const count = api.requests.length;
      await assert.rejects(executeRun(lab.store, authorization(run, { requestLimit: 1 })));
      assert.equal(api.requests.length, count);
    });

    await t.test("the real API distinguishes public access, unknown 200 responses and forbidden data", async () => {
      completedRun = await makeRun("full-investigation");
      const result = await executeRun(lab.store, authorization(completedRun));
      assert.equal(result.status, "partial");
      const outcomes = new Map(result.outcomes.map((outcome) => [outcome.ruleKey, outcome.result]));
      assert.equal(outcomes.get("own-a"), "satisfied");
      assert.equal(outcomes.get("own-b"), "satisfied");
      assert.equal(outcomes.get("public"), "satisfied");
      assert.equal(outcomes.get("cross-b"), "violated");
      assert.equal(outcomes.get("leak"), "violated");
      assert.equal(outcomes.get("neutral"), "inconclusive", "HTTP 200 alone must not prove BOLA");
      assert.equal(api.outsideRequests.length, 0, "Do not follow redirects beyond the declared origin");
      assert.equal(
        api.requests.find((request) => request.path === "/public")?.actor,
        "anonymous",
        "Anonymous stays anonymous even if a credential map has that key",
      );
      assert.equal(api.state.writes, 0);
      const checks = await lab.store.page("checks", { valueFilters: eq("run-reference", completedRun.id) });
      const evidence = await lab.store.page("evidence", { valueFilters: eq("run-reference", completedRun.id) });
      const findings = await lab.store.page("findings", { valueFilters: eq("run-reference", completedRun.id) });
      assert.equal(checks.records.length, fullRules.length);
      assert.equal(evidence.records.length, fullRules.length);
      assert.equal(findings.records.length, 2);
      const firstPage = await lab.store.page("checks", {
        valueFilters: eq("run-reference", completedRun.id),
        limit: 2,
      });
      assert.equal(firstPage.records.length, 2);
      assert.ok(firstPage.nextCursor);
      const secondPage = await lab.store.page("checks", {
        valueFilters: eq("run-reference", completedRun.id),
        limit: 2,
        cursor: firstPage.nextCursor,
      });
      assert.equal(secondPage.records.length, 2);
      assert.ok(
        secondPage.records.every(
          (row) =>
            row.fields["run-reference"] === completedRun.id && !firstPage.records.some((first) => first.id === row.id),
        ),
      );
      for (const row of [...checks.records, ...evidence.records, ...findings.records]) {
        assert.equal(row.fields.run, completedRun.id);
        assert.equal(row.fields["project-reference"], project.id);
        assert.equal(row.fields.project, project.id);
        assert.equal(row.fields["source-revision"], "rev-a");
      }
      for (const row of evidence.records) {
        assert.ok(!String(row.fields["redacted-excerpt"]).includes("synthetic-response-secret"));
        assert.ok(!String(row.fields["redacted-excerpt"]).includes("synthetic-a-token"));
        const bytes = await readFile(
          path.join(authorization(completedRun).directory, row.fields["artifact-reference"]),
        );
        assert.equal(createHash("sha256").update(bytes).digest("hex"), row.fields.sha256);
      }
      assert.ok(findings.records.every((row) => row.fields.verdict === "needs-review"));
    });

    await t.test("redirects do not expand the declared origin", async () => {
      const run = await makeRun(
        "redirect-boundary",
        inventory.rules.filter((row) => row.fields["record-key"].endsWith(":redirect")),
      );
      const result = await executeRun(lab.store, authorization(run));
      assert.equal(result.outcomes[0].result, "inconclusive");
      assert.equal(api.outsideRequests.length, 0);
    });

    await t.test("cancellation preserves one completed request and prevents subsequent HTTP", async () => {
      const run = await makeRun("cancelled-investigation");
      const count = api.requests.length;
      let done = false;
      const store = {
        ...lab.store,
        update: async (key, row, fields) => {
          const result = await lab.store.update(key, row, fields);
          if (key === "checks" && fields.status === "completed" && !done) {
            done = true;
            const fresh = await lab.store.get("runs", run.id);
            await lab.store.update("runs", fresh, { status: "cancelled" });
          }
          return result;
        },
      };
      const result = await executeRun(store, authorization(run));
      assert.equal(result.status, "cancelled");
      assert.equal(api.requests.length, count + 1);
      assert.equal((await lab.store.page("evidence", { valueFilters: eq("run-reference", run.id) })).records.length, 1);
    });

    await t.test("a live claim and queued claim cannot start additional HTTP", async () => {
      const run = await makeRun("live-claim", fullRules, {
        status: "running",
        "runner-id": "other-runner",
        "heartbeat-at": new Date().toISOString(),
      });
      const count = api.requests.length;
      await assert.rejects(executeRun(lab.store, authorization(run, { resume: true })), /CLAIM/);
      const pending = await makeRun("queued-claim");
      const store = {
        ...lab.store,
        update: async (key, row, fields) => {
          if (key === "runs" && fields["claim-reference"]) throw new Error("WRITE_PENDING");
          return lab.store.update(key, row, fields);
        },
      };
      await assert.rejects(executeRun(store, authorization(pending)), /WRITE_PENDING/);
      assert.equal(api.requests.length, count);
    });

    await t.test("interrupted evidence resumes with new attempts without overwriting earlier artifacts", async () => {
      const run = await makeRun("resume-investigation");
      let reads = 0;
      const store = {
        ...lab.store,
        create: async (key, fields, idempotencyKey) => {
          if (key === "evidence" && ++reads === 2) throw new Error("SYNTHETIC_SYNC_INTERRUPTION");
          return lab.store.create(key, fields, idempotencyKey);
        },
      };
      await assert.rejects(executeRun(store, authorization(run)), /SYNTHETIC_SYNC_INTERRUPTION/);
      const previous = await lab.store.page("evidence", { valueFilters: eq("run-reference", run.id) });
      assert.equal(previous.records.length, 1);
      const namesBefore = await readdir(authorization(run).directory);
      await executeRun(lab.store, authorization(run, { resume: true }));
      const after = await lab.store.page("evidence", { valueFilters: eq("run-reference", run.id) });
      assert.equal(
        after.records.find((row) => row.id === previous.records[0].id)?.fields.sha256,
        previous.records[0].fields.sha256,
      );
      const namesAfter = await readdir(authorization(run).directory);
      assert.ok(namesBefore.every((name) => namesAfter.includes(name)));
    });

    await t.test("a symlink evidence directory is rejected without changing its target", async () => {
      const run = await makeRun(
        "symlink-directory",
        inventory.rules.filter((row) => row.fields.identity === "anonymous"),
      );
      const target = path.join(lab.work, "unrelated-private-target");
      await mkdir(target, { mode: 0o750 });
      const directory = path.join(lab.work, "linked-evidence");
      await symlink(target, directory);
      const mode = (await stat(target)).mode;
      const count = api.requests.length;
      await assert.rejects(executeRun(lab.store, authorization(run, { directory })), /SYMLINK/);
      assert.equal((await stat(target)).mode, mode);
      assert.equal(api.requests.length, count);
    });

    await t.test("completed history from a mismatched scope cannot be reused", async () => {
      const run = await makeRun(
        "tampered-history",
        inventory.rules.filter((row) => row.fields.identity === "anonymous"),
      );
      await executeRun(lab.store, authorization(run));
      const history = (await lab.store.page("checks", { valueFilters: eq("run-reference", run.id) })).records[0];
      await lab.store.update("checks", history, { "source-revision": "unrelated-revision" });
      await lab.store.update("runs", await lab.store.get("runs", run.id), { status: "failed" });
      const count = api.requests.length;
      await assert.rejects(executeRun(lab.store, authorization(run, { resume: true })), /HISTORY/);
      assert.equal(api.requests.length, count);
    });

    await t.test("a retest must cover the original affected identity, rule and working positive baseline", async () => {
      const findings = (await lab.store.page("findings", { valueFilters: eq("run-reference", completedRun.id) }))
        .records;
      let affected;
      for (const finding of findings) {
        const check = await lab.store.get("checks", finding.fields["check-reference"]);
        const rule = await lab.store.get("rules", check.fields["rule-reference"]);
        if (rule.fields["record-key"].endsWith(":cross-b")) affected = finding;
      }
      assert.ok(affected, "The real initial violation supplies the original affected case");
      await lab.store.update("projects", await lab.store.get("projects", project.id), { "source-revision": "rev-b" });
      const next = await importInventory(lab.store, { projectId: project.id, document: inventoryFixture("rev-b") });
      const unrelated = await makeRun(
        "unrelated-retest",
        next.rules.filter((row) => row.fields["record-key"].endsWith(":public")),
        { "source-revision": "rev-b", "retest-finding-reference": affected.id },
      );
      affected = await lab.store.update("findings", affected, {
        "fixed-revision": "rev-b",
        "retest-run-reference": unrelated.id,
      });
      const count = api.requests.length;
      await assert.rejects(planRun(lab.store, authorization(unrelated, { revision: "rev-b" })), /ORIGINAL_RULE/);
      assert.equal(api.requests.length, count);
      assert.notEqual((await lab.store.get("findings", affected.id)).fields.remediation, "verified-fixed");

      const corresponding = next.rules.filter((row) =>
        ["cross-b", "own-b"].some((key) => row.fields["record-key"].endsWith(`:${key}`)),
      );
      const valid = await makeRun("corresponding-retest", corresponding, {
        "source-revision": "rev-b",
        "retest-finding-reference": affected.id,
      });
      await lab.store.update("findings", affected, { "retest-run-reference": valid.id });
      api.state.secure = true;
      const result = await executeRun(lab.store, authorization(valid, { revision: "rev-b" }));
      assert.equal(result.status, "completed");
      assert.ok(result.outcomes.every((outcome) => outcome.result === "satisfied"));
      assert.equal((await lab.store.get("findings", affected.id)).fields.remediation, "verified-fixed");
      assert.equal((await lab.store.get("runs", completedRun.id)).fields["source-revision"], "rev-a");
    });

    await t.test("a fresh OSS process retains actual investigation records and hashes", async () => {
      const before = await lab.store.page("evidence", { valueFilters: eq("run-reference", completedRun.id) });
      const reconnected = await lab.restart();
      const after = await reconnected.page("evidence", { valueFilters: eq("run-reference", completedRun.id) });
      assert.deepEqual(
        after.records.map((row) => [row.id, row.fields.sha256]),
        before.records.map((row) => [row.id, row.fields.sha256]),
      );
      assert.equal((await reconnected.get("runs", completedRun.id)).fields.status, "partial");
    });
  },
);
