import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inventoryExample } from "../content/kelly-appsec-app/app/js/model.js";
import { importInventory } from "../lib/inventory.mjs";
import { executeRun, planRun } from "../lib/runner.mjs";
const memory = () => {
  const data = Object.fromEntries(
    ["projects", "endpoints", "rules", "runs", "checks", "findings", "evidence"].map((key) => [key, []]),
  );
  let next = 0;
  return {
    data,
    get: async (key, id) => {
      const row = data[key].find((row) => row.id === id);
      if (!row) throw new Error("NOT_FOUND");
      return structuredClone(row);
    },
    page: async (key, { valueFilters = [], cursor = null, limit = 50 } = {}) => {
      const rows = data[key].filter((row) =>
        valueFilters.every((filter) => row.fields[filter.fieldSlug] === filter.value),
      );
      const offset = Number(cursor || 0);
      return {
        records: structuredClone(rows.slice(offset, offset + limit)),
        nextCursor: rows.length > offset + limit ? String(offset + limit) : null,
      };
    },
    create: async (key, fields) => {
      const row = {
        id: `rec${++next}`,
        baseId: `base-${key}`,
        headCommitId: `head${next}`,
        fields: structuredClone(fields),
      };
      data[key].push(row);
      return structuredClone(row);
    },
    update: async (key, row, fields) => {
      const record = data[key].find((item) => item.id === row.id);
      if (record.headCommitId !== row.headCommitId) throw new Error("CONFLICT");
      record.fields = { ...record.fields, ...structuredClone(fields) };
      record.headCommitId = `head${++next}`;
      return structuredClone(record);
    },
  };
};
const fixture = async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "appsec-unit-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = memory();
  const project = await store.create("projects", {
    title: "Synthetic",
    owner: "Reviewer",
    "source-revision": "rev-a",
    environment: "staging",
    origin: "http://127.0.0.1:19223",
    "scope-note": "synthetic test",
    "onboarding-version": 1,
    "onboarding-state": "complete",
    "is-example": false,
  });
  const inventory = await importInventory(store, { projectId: project.id, document: inventoryExample("rev-a") });
  const run = await store.create("runs", {
    title: "API review",
    project: project.id,
    "project-reference": project.id,
    "source-revision": "rev-a",
    environment: "staging",
    origin: project.fields.origin,
    "scope-reference": "unit-scope",
    "rule-snapshot": inventory.rules.map((row) => ({ id: row.id, headCommitId: row.headCommitId })),
    mode: "dynamic",
    status: "requested",
    "request-count": 0,
  });
  const authorization = {
    directory,
    runId: run.id,
    projectId: project.id,
    origin: project.fields.origin,
    environment: "staging",
    revision: "rev-a",
    scope: "unit-scope",
    allowedMethods: ["GET"],
    allowedPaths: ["/orders/test-a", "/orders/test-b"],
    allowedObjectIds: ["test-a", "test-b"],
    credentials: { "user-a": "synthetic-token" },
    requestLimit: 10,
  };
  return { store, project, run, inventory, authorization };
};
const request = async (url) => ({
  status: 200,
  body: { id: url.endsWith("test-a") ? "test-a" : "test-b", password: "synthetic-private" },
});
test("run preserves attributable redacted evidence and separate human judgment", async (t) => {
  const f = await fixture(t);
  const result = await executeRun(f.store, f.authorization, { request, wait: async () => {} });
  assert.deepEqual(
    result.outcomes.map((item) => item.result),
    ["satisfied", "violated"],
  );
  assert.equal(f.store.data.findings[0].fields.verdict, "needs-review");
  assert.ok(!f.store.data.evidence[0].fields["redacted-excerpt"].includes("synthetic-private"));
  const raw = await readFile(
    path.join(f.authorization.directory, f.store.data.evidence[0].fields["artifact-reference"]),
    "utf8",
  );
  assert.ok(raw.includes("policyHash"));
  assert.ok(!raw.includes("synthetic-token"));
});
test("negative stored budgets fail before claim or HTTP", async (t) => {
  const f = await fixture(t);
  f.store.data.runs[0].fields["request-count"] = -10;
  let requests = 0;
  await assert.rejects(
    executeRun(
      f.store,
      { ...f.authorization, requestLimit: 1 },
      {
        request: async () => {
          requests++;
          return { status: 200, body: {} };
        },
      },
    ),
    /INVALID_STORED_REQUEST_COUNT/,
  );
  assert.equal(requests, 0);
  assert.equal(f.store.data.runs[0].fields.status, "requested");
});
test("local allowlist, rule snapshots and private directory cannot be expanded by task data", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    planRun(f.store, { ...f.authorization, allowedPaths: ["/orders/test-a"] }),
    /OUTSIDE_LOCAL_ALLOWLIST/,
  );
  f.store.data.rules[0].headCommitId = "changed";
  await assert.rejects(planRun(f.store, f.authorization), /RULE_CHANGED/);
  f.store.data.rules[0].headCommitId = f.inventory.rules[0].headCommitId;
  const linked = `${f.authorization.directory}-link`;
  await symlink(f.authorization.directory, linked);
  t.after(() => rm(linked, { force: true }));
  await assert.rejects(
    executeRun(f.store, { ...f.authorization, directory: linked }, { request }),
    /MUST_NOT_BE_SYMLINK/,
  );
});
test("resume verifies local evidence and detects tampered completed verdicts", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    executeRun(f.store, { ...f.authorization, requestLimit: 1 }, { request, wait: async () => {} }),
    /REQUEST_BUDGET_REACHED/,
  );
  assert.equal(f.store.data.checks.length, 1);
  f.store.data.checks[0].fields.result = "violated";
  await assert.rejects(
    executeRun(f.store, { ...f.authorization, resume: true }, { request, wait: async () => {} }),
    /EVIDENCE_INTEGRITY_MISMATCH/,
  );
});
test("resume requests only remaining explicit rules and keeps request history", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    executeRun(f.store, { ...f.authorization, requestLimit: 1 }, { request, wait: async () => {} }),
    /REQUEST_BUDGET_REACHED/,
  );
  let requests = 0;
  const result = await executeRun(
    f.store,
    { ...f.authorization, resume: true },
    {
      request: async (url) => {
        requests++;
        return request(url);
      },
      wait: async () => {},
    },
  );
  assert.equal(requests, 1);
  assert.equal(result.requestCount, 2);
  assert.equal(result.outcomes[0].reused, true);
});
test("unrelated passing rule cannot close original finding on another version", async (t) => {
  const f = await fixture(t);
  await executeRun(f.store, f.authorization, { request, wait: async () => {} });
  const finding = f.store.data.findings[0];
  const current = await f.store.get("projects", f.project.id);
  await f.store.update("projects", current, { "source-revision": "rev-b" });
  const inventory = inventoryExample("rev-b");
  inventory.rules = inventory.rules.slice(0, 1);
  const imported = await importInventory(f.store, { projectId: f.project.id, document: inventory });
  const run = await f.store.create("runs", {
    ...f.run.fields,
    "source-revision": "rev-b",
    "rule-snapshot": imported.rules.map((row) => ({ id: row.id, headCommitId: row.headCommitId })),
    "retest-finding-reference": finding.id,
  });
  await f.store.update("findings", finding, { "fixed-revision": "rev-b", "retest-run-reference": run.id });
  await assert.rejects(
    planRun(f.store, { ...f.authorization, runId: run.id, revision: "rev-b" }),
    /COVER_ORIGINAL_RULE_AND_POLICY/,
  );
  assert.equal(f.store.data.findings[0].fields.remediation, "open");
});

test("matching original rule and baseline on a new version can verify the fix", async (t) => {
  const f = await fixture(t);
  await executeRun(f.store, f.authorization, { request, wait: async () => {} });
  const finding = f.store.data.findings[0];
  await f.store.update("projects", await f.store.get("projects", f.project.id), { "source-revision": "rev-b" });
  const imported = await importInventory(f.store, { projectId: f.project.id, document: inventoryExample("rev-b") });
  const run = await f.store.create("runs", {
    ...f.run.fields,
    "source-revision": "rev-b",
    "rule-snapshot": imported.rules.map((row) => ({ id: row.id, headCommitId: row.headCommitId })),
    "retest-finding-reference": finding.id,
  });
  await f.store.update("findings", finding, { "fixed-revision": "rev-b", "retest-run-reference": run.id });
  await executeRun(
    f.store,
    { ...f.authorization, runId: run.id, revision: "rev-b" },
    {
      request: async (url) => (url.endsWith("test-b") ? { status: 403, body: { error: "forbidden" } } : request(url)),
      wait: async () => {},
    },
  );
  assert.equal(f.store.data.findings[0].fields.remediation, "verified-fixed");
});
test("source review prevalidates all rows and never labels static evidence dynamically satisfied", async (t) => {
  const { importReview } = await import("../lib/offline.mjs");
  const f = await fixture(t);
  const run = await f.store.get("runs", f.run.id);
  await f.store.update("runs", run, { mode: "offline" });
  const review = {
    ruleId: f.inventory.rules[0].id,
    assessment: "candidate",
    location: "src/orders.ts:42",
    excerpt: 'query({id}); // password="synthetic-secret"',
    reasoning: "需要追踪全局权限与可信租户条件",
  };
  await assert.rejects(
    importReview(f.store, {
      projectId: f.project.id,
      runId: f.run.id,
      document: { schemaVersion: 1, sourceRevision: "rev-a", reviews: [review, { ...review, ruleId: "foreign" }] },
    }),
    /NOT_FOUND/,
  );
  assert.equal(f.store.data.checks.length, 0);
  const result = await importReview(f.store, {
    projectId: f.project.id,
    runId: f.run.id,
    document: { schemaVersion: 1, sourceRevision: "rev-a", reviews: [review] },
  });
  assert.equal(result.dynamicVerified, false);
  assert.equal(f.store.data.checks[0].fields.result, "inconclusive");
  assert.equal(f.store.data.findings[0].fields.conclusion, "candidate");
  assert.ok(!f.store.data.evidence[0].fields["redacted-excerpt"].includes("synthetic-secret"));
  assert.ok(f.store.data.checks[0].fields["policy-hash"]);
});

test("budget interruption exports every requested rule and separates pages from coverage", async (t) => {
  const { exportRun, reportMarkdown } = await import("../lib/report.mjs");
  const { snapshotReport } = await import("../content/kelly-appsec-app/app/js/model.js");
  const f = await fixture(t);
  await assert.rejects(
    executeRun(f.store, { ...f.authorization, requestLimit: 1 }, { request, wait: async () => {} }),
    /REQUEST_BUDGET_REACHED/,
  );
  const exported = await exportRun(f.store, f.run.id);
  assert.equal(exported.paginationComplete, true);
  assert.equal(exported.complete, false);
  assert.equal(exported.coverage.complete, false);
  assert.equal(exported.coverage.expected, 2);
  assert.equal(exported.coverage.conclusive, 1);
  assert.equal(exported.coverage.unexecuted, 1);
  assert.equal(exported.coverage.entries[1].status, "unexecuted");
  const markdown = reportMarkdown(exported);
  assert.ok(markdown.includes("failed"));
  assert.ok(markdown.includes("任务中断"));
  assert.ok(markdown.includes("/orders/test-b"));
  assert.ok(markdown.includes("测试账号 A 不得读取 B 的受控订单"));
  assert.ok(markdown.includes("没有该规则"));
  const loaded = snapshotReport({
    run: exported.run,
    project: exported.project,
    revision: "rev-a",
    rules: exported.rules,
    endpoints: exported.endpoints,
    checks: exported.checks,
    findings: exported.findings,
    evidence: exported.evidence,
    cursors: {},
  });
  assert.ok(loaded.includes("failed"));
  assert.ok(loaded.includes("任务中断"));
  assert.ok(loaded.includes("/orders/test-b"));
  assert.ok(loaded.includes("未执行"));
});
test("registered request descriptions survive deletion and changed rule heads never count passing", async (t) => {
  const { exportRun, reportMarkdown } = await import("../lib/report.mjs");
  const { ruleSnapshot } = await import("../content/kelly-appsec-app/app/js/coverage.js");
  const f = await fixture(t);
  const run = await f.store.get("runs", f.run.id);
  await f.store.update("runs", run, {
    "rule-snapshot": f.inventory.rules.map((row) =>
      ruleSnapshot(
        row,
        f.inventory.endpoints.find((endpoint) => endpoint.id === row.fields["endpoint-reference"]),
      ),
    ),
  });
  await executeRun(f.store, f.authorization, { request, wait: async () => {} });
  const complete = await exportRun(f.store, f.run.id);
  assert.equal(complete.coverage.complete, true);
  f.store.data.rules[0].headCommitId = "changed-after-execution";
  f.store.data.rules.splice(1, 1);
  const changed = await exportRun(f.store, f.run.id);
  assert.equal(changed.coverage.complete, false);
  assert.equal(changed.coverage.conclusive, 0);
  assert.deepEqual(
    changed.coverage.entries.map((entry) => entry.status),
    ["changed", "unavailable"],
  );
  const markdown = reportMarkdown(changed);
  assert.ok(markdown.includes("/orders/test-b"));
  assert.ok(markdown.includes("测试账号 A 不得读取 B 的受控订单"));
  assert.ok(markdown.includes("原规则或端点"));
});
test("failed latest attempt and an edited endpoint invalidate earlier conclusive coverage", async (t) => {
  const { exportRun } = await import("../lib/report.mjs");
  const f = await fixture(t);
  await executeRun(f.store, f.authorization, { request, wait: async () => {} });
  const truncated = await exportRun(f.store, f.run.id, { maxRows: 1 });
  assert.equal(truncated.paginationComplete, false);
  assert.equal(truncated.coverage.complete, false);
  assert.equal(truncated.coverage.conclusive, 0);
  const first = f.store.data.checks[0];
  await f.store.create("checks", {
    ...first.fields,
    "record-key": "failed-retry",
    attempt: 2,
    status: "failed",
    result: "inconclusive",
    summary: "重试超时，不能沿用上一次成功",
  });
  const interrupted = await exportRun(f.store, f.run.id);
  assert.equal(interrupted.coverage.complete, false);
  assert.equal(interrupted.coverage.entries[0].status, "failed");
  assert.equal(interrupted.coverage.entries[0].attempt, 2);
  f.store.data.endpoints[1].headCommitId = "endpoint-edited";
  const edited = await exportRun(f.store, f.run.id);
  assert.equal(edited.coverage.conclusive, 0);
  assert.ok(edited.coverage.entries[1].reason.includes("尚未核验"));
});
