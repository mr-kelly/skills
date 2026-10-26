import { appConfig } from "../config.js";
const row = (key, suffix, fields) => ({
  id: `rec${key}${suffix}000000000000`,
  baseId: `bse${key}00000000000000`,
  headCommitId: `cmtdemo${suffix}0000000000`,
  baseKey: key,
  fields,
});
const project = row("projects", "shop", {
  title: "Northstar 客户门户",
  owner: "应用负责人",
  "repository-reference": "example/northstar",
  "source-revision": "demo-rev-a",
  environment: "isolated-test",
  origin: "https://api.example.test",
  "scope-note": "合成演示：双租户订单与管理动作",
  "onboarding-version": 1,
  "onboarding-state": "complete",
  "is-example": true,
});
const projects = [
  project,
  row("projects", "billing", {
    title: "Billing 管理服务",
    owner: "账务服务负责人",
    "repository-reference": "example/billing",
    "source-revision": "billing-rev-1",
    environment: "isolated-test",
    origin: "https://billing.example.test",
    "scope-note": "合成演示：未配置动态验证",
    "onboarding-version": 1,
    "onboarding-state": "incomplete",
    "is-example": true,
  }),
];
const endpointData = [
  ["get-a", "GET", "/orders/test-a", "订单读取"],
  ["get-b", "GET", "/orders/test-b", "订单读取"],
  ["public", "GET", "/shared/public-a", "公开分享"],
  ["members", "PATCH", "/admin/members/test-a", "成员权限"],
  ["export", "POST", "/reports/export", "数据导出"],
];
const endpoints = endpointData.map(([key, method, path, flow], i) =>
  row("endpoints", String(i), {
    title: `${method} ${path}`,
    "record-key": `${project.id}:demo-rev-a:${key}`,
    "project-reference": project.id,
    "source-revision": "demo-rev-a",
    method,
    path,
    "operation-id": key,
    "business-flow": flow,
    "source-location": `openapi.json#/paths/${path}`,
    discovery: "documented",
    project: project.id,
  }),
);
const ruleData = [
  ["own-a", 0, "user-a", "allow", [200], [{ path: "id", equals: "test-a" }], [], "", "测试账号 A 读取自己的受控订单"],
  [
    "cross-a",
    1,
    "user-a",
    "deny",
    [403, 404],
    [],
    [{ path: "id", equals: "test-b" }],
    "own-a",
    "测试账号 A 不得读取租户 B 的订单",
  ],
  ["own-b", 1, "user-b", "allow", [200], [{ path: "id", equals: "test-b" }], [], "", "测试账号 B 可读取自己的订单"],
  [
    "public-link",
    2,
    "anonymous",
    "allow",
    [200],
    [{ path: "public", equals: true }],
    [],
    "",
    "明确公开的分享资源允许匿名读取",
  ],
  [
    "member-role",
    3,
    "user-a",
    "deny",
    [403],
    [],
    [{ path: "role", equals: "admin" }],
    "own-a",
    "普通用户不得直接修改管理员角色",
  ],
  [
    "export-scope",
    4,
    "admin",
    "allow",
    [200],
    [{ path: "scope", equals: "tenant-a" }],
    [],
    "",
    "导出只包含当前租户数据",
  ],
];
const rules = ruleData.map(([key, index, identity, expectation, statuses, assertions, forbidden, baseline, note], i) =>
  row("rules", String(i), {
    title: `${identity} · ${endpoints[index].fields.title} · ${expectation === "allow" ? "应允许" : "应拒绝"}`,
    "record-key": `${project.id}:demo-rev-a:${key}`,
    "project-reference": project.id,
    "endpoint-reference": endpoints[index].id,
    "source-revision": "demo-rev-a",
    identity,
    expectation,
    "expected-statuses": statuses,
    assertions,
    "forbidden-assertions": forbidden,
    "baseline-rule-key": baseline,
    "policy-note": note,
    confirmed: true,
    mutating: !["GET", "HEAD"].includes(endpoints[index].fields.method),
    "object-id": index === 1 ? "test-b" : "test-a",
    project: project.id,
    endpoint: endpoints[index].id,
  }),
);
const run = row("runs", "primary", {
  title: "双租户授权核查 · demo-rev-a",
  "project-reference": project.id,
  "source-revision": "demo-rev-a",
  environment: "isolated-test",
  origin: project.fields.origin,
  "scope-reference": "合成演示范围",
  "rule-snapshot": rules.map((rule) => ({ id: rule.id, headCommitId: rule.headCommitId })),
  mode: "dynamic",
  status: "partial",
  "requested-at": "2026-10-26T06:00:00Z",
  "finished-at": "2026-10-26T06:03:00Z",
  "request-count": 5,
  summary: "跨租户返回内容需要复核；导出缺少隔离测试前提。",
  project: project.id,
});
const runs = [
  run,
  row("runs", "queued", {
    ...run.fields,
    title: "等待本机 Agent 的核查任务",
    status: "requested",
    "requested-at": "2026-10-26T05:00:00Z",
    "rule-snapshot": rules.slice(0, 2).map((rule) => ({ id: rule.id, headCommitId: rule.headCommitId })),
  }),
];
const checks = rules.map((rule, i) =>
  row("checks", String(i), {
    title: rule.fields.title,
    "record-key": `${run.id}:${rule.id}:1`,
    "project-reference": project.id,
    "run-reference": run.id,
    "endpoint-reference": rule.fields["endpoint-reference"],
    "rule-reference": rule.id,
    "source-revision": "demo-rev-a",
    identity: rule.fields.identity,
    attempt: 1,
    status: i === 5 ? "missing-data" : "completed",
    result: i === 1 ? "violated" : i === 5 ? "inconclusive" : "satisfied",
    "http-status": i === 1 ? 200 : i === 4 ? 403 : 200,
    "observed-at": "2026-10-26T06:02:00Z",
    summary:
      i === 1
        ? "实际返回了 test-b 对象，违反已确认的跨租户规则。"
        : i === 5
          ? "导出沙盒未配置，未发送写入请求。"
          : "正向基线或拒绝断言符合预期。",
    project: project.id,
    run: run.id,
    endpoint: rule.fields["endpoint-reference"],
    rule: rule.id,
  }),
);
const evidence = checks.slice(0, 5).map((check, i) =>
  row("evidence", String(i), {
    title: `${check.fields.title} · 脱敏证据`,
    "record-key": `${check.id}:evidence`,
    "project-reference": project.id,
    "run-reference": run.id,
    "check-reference": check.id,
    "source-kind": "controlled-api",
    "source-location": endpoints.find((item) => item.id === check.fields["endpoint-reference"]).fields.title,
    "source-revision": "demo-rev-a",
    "observed-at": "2026-10-26T06:02:00Z",
    sha256: "f".repeat(64),
    "redacted-excerpt":
      i === 1
        ? '身份：租户 A 用户\nGET /orders/test-b\nHTTP 200\n{"id":"test-b","tenant":"tenant-b","amount":120}\n规则：用户 A 不得读取租户 B 对象。'
        : "合成案例：返回字段与声明的受控对象断言一致。",
    "coverage-note": "演示样本；IP、身份、哈希和业务数据均为合成。只验证该版本下的显式断言。",
    project: project.id,
    run: run.id,
    check: check.id,
  }),
);
const findings = [
  row("findings", "tenant", {
    title: "订单接口跨租户返回对象内容",
    "record-key": `${checks[1].id}:finding`,
    "project-reference": project.id,
    "run-reference": run.id,
    "check-reference": checks[1].id,
    "source-revision": "demo-rev-a",
    severity: "high",
    conclusion: "policy-violation",
    reasoning:
      "正向基线确认用户 A 能读取 test-a；同一身份请求 test-b 后返回 tenant-b 的订单对象，命中明确禁止的数据断言。",
    limitations: "需要业务负责人复核分享/委托策略和实际影响。不能据此推断服务器已失陷。",
    recommendation: "在服务层把受信任租户身份与订单归属同时用于授权查询，并对修复版本重跑双租户正向与负向案例。",
    verdict: "needs-review",
    remediation: "open",
    owner: "订单服务负责人",
    project: project.id,
    run: run.id,
    check: checks[1].id,
  }),
];
const data = { projects, endpoints, rules, runs, checks, findings, evidence };
let sequence = 0;
const intents = new Map();
const matches = (record, filters = []) =>
  filters.every((filter) =>
    filter.any
      ? filter.any.some((item) => matches(record, [item]))
      : filter.operator === "eq" && record.fields[filter.fieldSlug] === filter.value,
  );
export const demoProvider = {
  name: "demo",
  ready: async () => ({ ok: true }),
  initialize: async () => ({ ok: true }),
  page: async (key, { cursor = null, valueFilters, sort } = {}) => {
    const rows = data[key].filter((record) => matches(record, valueFilters));
    if (sort)
      rows.sort(
        (a, b) =>
          String(a.fields[sort.fieldSlug] || "").localeCompare(String(b.fields[sort.fieldSlug] || "")) *
          (sort.direction === "desc" ? -1 : 1),
      );
    const offset = Number(cursor || 0);
    return structuredClone({
      records: rows.slice(offset, offset + 50),
      nextCursor: rows.length > offset + 50 ? String(offset + 50) : null,
    });
  },
  get: async (key, id) => {
    const found = data[key].find((row) => row.id === id);
    if (!found) throw new Error("RECORD_NOT_FOUND");
    return structuredClone(found);
  },
  summary: async (projectId, revision) => ({
    projects: data.projects.length,
    endpoints: data.endpoints.filter(
      (row) =>
        (!projectId || row.fields["project-reference"] === projectId) &&
        (!revision || row.fields["source-revision"] === revision),
    ).length,
    rules: data.rules.filter(
      (row) =>
        (!projectId || row.fields["project-reference"] === projectId) &&
        (!revision || row.fields["source-revision"] === revision),
    ).length,
    attention: data.findings.filter(
      (row) => (!projectId || row.fields["project-reference"] === projectId) && row.fields.verdict === "needs-review",
    ).length,
  }),
  pending: async () => ({ count: 0, nextCursor: null }),
  create: async (key, fields, idempotencyKey) => {
    if (intents.has(idempotencyKey)) return { status: "saved", recordId: intents.get(idempotencyKey) };
    const record = row(key, `new${sequence++}`, fields);
    data[key].unshift(record);
    intents.set(idempotencyKey, record.id);
    return { status: "saved", recordId: record.id };
  },
  update: async (key, record, fields) => {
    const found = data[key].find((item) => item.id === record.id);
    if (!found || found.headCommitId !== record.headCommitId) throw new Error("RECORD_CONFLICT");
    found.fields = { ...found.fields, ...fields };
    found.headCommitId = `cmtchanged${sequence++}`;
    return { status: "saved", recordId: found.id };
  },
};
