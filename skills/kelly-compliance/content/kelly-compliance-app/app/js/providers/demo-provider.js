import { appConfig } from "../config.js";
import { CONTROL_TEMPLATES, FRAMEWORK } from "../domain.js";
const rows = Object.fromEntries(appConfig.bases.map((base) => [base.key, []]));
let sequence = 100;
const put = (key, id, fields) => {
  const row = { id, baseId: `demo-${key}`, headCommitId: `demo-commit-${sequence++}`, fields };
  rows[key].push(row);
  return row;
};
const p = put("programs", "demo-program", {
  title: "Orbit Cloud · SaaS 生产环境",
  "record-key": "demo-program",
  "service-description": "面向海外客户的 B2B SaaS；生产 API、客户数据与运维团队。",
  owner: "林可 · Security",
  accounts: "111111111111",
  regions: "us-east-1",
  "framework-version": FRAMEWORK,
  "assessment-type": "period",
  "period-start": "2026-07-01T00:00:00Z",
  "period-end": "2026-09-30T23:59:59Z",
  "scope-reference": "授权工单 SEC-2026-Q3",
  "scope-version": 1,
  "onboarding-state": "complete",
  "is-example": true,
});
const owned = { "program-reference": p.id, program: [p.id] };
const controls = CONTROL_TEMPLATES.map((t) =>
  put("controls", `demo-control-${t.key}`, {
    ...owned,
    title: t.title,
    "record-key": `demo-control-${t.key}`,
    "control-key": t.key,
    "framework-version": FRAMEWORK,
    "external-reference": t.reference,
    kind: t.kind,
    "mapped-checks": t.checks.join(","),
    "evidence-requirements": t.checks.join(","),
    owner: t.key === "backups" ? "陈晨 · SRE" : "林可 · Security",
    frequency: t.frequency,
    "coverage-mode": t.mode,
    description: t.description,
    "design-state": "designed",
  }),
);
const assessment = put("assessments", "demo-assessment", {
  ...owned,
  title: "Q3 AWS 基线 · 导入复核",
  "record-key": "demo-assessment",
  "scope-reference": p.fields["scope-reference"],
  "scope-version": 1,
  "framework-version": FRAMEWORK,
  "period-start": p.fields["period-start"],
  "period-end": p.fields["period-end"],
  "assessment-type": "period",
  "source-format": "normalized",
  status: "partial",
  "started-at": "2026-10-24T08:00:00Z",
  "finished-at": "2026-10-24T08:04:00Z",
  "coverage-note": "技术快照不覆盖整个 Q3。访问复核与恢复演练仍需独立证据。",
});
const add = (id, controlKey, check, title, result, mode, opts = {}) => {
  const e = put("evidence", id, {
    ...owned,
    title,
    "record-key": id,
    "assessment-reference": assessment.id,
    assessment: [assessment.id],
    "framework-version": FRAMEWORK,
    "scope-version": 1,
    "scope-reference": p.fields["scope-reference"],
    account: "111111111111",
    region: "us-east-1",
    "resource-key": opts.resourceKey || check,
    "check-id": check,
    "requirement-key": check,
    "source-kind": opts.sourceKind || "manual",
    "source-locator": `synthetic:orbit/${id}`,
    sha256: "a".repeat(64),
    "observed-at": "2026-09-30T23:59:59Z",
    "collected-at": "2026-10-24T08:00:00Z",
    "evidence-mode": mode,
    "technical-result": result,
    excerpt: opts.excerpt || "合成证据：已脱敏，只用于演示。",
    ...(mode === "period"
      ? { "coverage-start": p.fields["period-start"], "coverage-end": p.fields["period-end"] }
      : {}),
    ...(opts.expired ? { "retention-until": "2026-10-01T00:00:00Z" } : {}),
  });
  const control = controls.find((c) => c.fields["control-key"] === controlKey);
  put("evidence-links", `${id}-link`, {
    ...owned,
    title: `${control.fields.title} · ${title}`,
    "record-key": `${id}-link`,
    "control-reference": control.id,
    control: [control.id],
    "evidence-reference": e.id,
    evidence: [e.id],
    "review-state": opts.pending ? "pending" : "accepted",
    "review-note": opts.pending ? "" : "核对来源、账户、覆盖范围和实际运行记录；此映射仅适用于当前维度。",
    reviewer: opts.pending ? "" : "林可",
    "reviewed-at": "2026-10-24T09:00:00Z",
  });
  return e;
};
add("demo-public-ssh", "network", "network-public-admin", "生产安全组对全网开放 SSH", "fail", "snapshot", {
  resourceKey: "sg-orbit-prod",
  excerpt: "sg-orbit-prod：TCP 22 / 0.0.0.0/0，需要负责人确认与修复复测。",
});
add("demo-logging", "operations", "audit-logging", "Q3 历史审计日志索引", "manual", "period", {
  excerpt: "10 月晚收集的真实历史索引可支撑 Q3 覆盖；告警和事件处置仍需独立复核。",
});
add("demo-access-snapshot", "access", "identity-access", "IAM 当前身份快照", "pass", "snapshot", {
  pending: true,
  excerpt: "当前身份清单不能证明 Q3 的入离职与周期复核。",
});
add("demo-backup", "backups", "backup-recovery", "Q3 备份执行记录", "pass", "period", {
  excerpt: "仅有备份成功记录，仍缺实际恢复演练 restore-test。",
});
add("demo-policy-expired", "people", "people-policy", "已过期的培训确认清单", "manual", "period", { expired: true });
add("demo-vendors", "vendors", "vendor-risk", "关键供应商风险复核", "manual", "period");
for (const [i, key, title, reason, severity] of [
  [1, "network", "公开管理端口待复测", "生产安全组对全网开放 SSH；风险接受不会改变技术失败。", "high"],
  [2, "backups", "缺少实际恢复演练", "备份执行已覆盖 Q3，但尚无恢复演练记录。", "medium"],
  [3, "access", "期间访问复核不足", "身份快照不能替代入离职记录和周期权限复核。", "medium"],
]) {
  const c = controls.find((r) => r.fields["control-key"] === key);
  put("issues", `demo-issue-${i}`, {
    ...owned,
    title,
    "record-key": `demo-issue-${i}`,
    "control-reference": c.id,
    control: [c.id],
    severity,
    "issue-kind": i === 1 ? "technical" : "evidence",
    status: i === 1 ? "in-progress" : "open",
    owner: c.fields.owner,
    "due-at": i === 1 ? "2026-10-30T17:00:00Z" : "2026-11-05T17:00:00Z",
    reason,
    ...(i === 1
      ? {
          "verification-after": "2026-09-30T23:59:59Z",
          account: "111111111111",
          region: "us-east-1",
          "resource-key": "sg-orbit-prod",
          "check-id": "network-public-admin",
        }
      : {}),
  });
}
put("resources", "demo-resource-sg", {
  ...owned,
  title: "sg-orbit-prod · 生产管理安全组",
  "record-key": "demo-resource-sg",
  provider: "aws",
  account: "111111111111",
  region: "us-east-1",
  "resource-key": "sg-orbit-prod",
  "resource-type": "security-group",
  "check-id": "network-public-admin",
  status: "fail",
  "observed-at": "2026-09-30T23:59:59Z",
  summary: "TCP 22 对 0.0.0.0/0 开放；需业务确认并复测。",
});
put("resources", "demo-resource-db", {
  ...owned,
  title: "orbit-prod-db · 客户数据库",
  "record-key": "demo-resource-db",
  provider: "aws",
  account: "111111111111",
  region: "us-east-1",
  "resource-key": "arn:aws:rds:us-east-1:111111111111:db:orbit",
  "resource-type": "database",
  "check-id": "storage-encryption",
  status: "pass",
  "observed-at": "2026-09-30T23:59:59Z",
  summary: "读取的配置显示存储已加密；不代表数据库授权完整。",
});
put("exceptions", "demo-exception", {
  ...owned,
  title: "管理端口临时风险接受（已到期）",
  "record-key": "demo-exception",
  "control-reference": "demo-control-network",
  control: ["demo-control-network"],
  "issue-reference": "demo-issue-1",
  issue: ["demo-issue-1"],
  reason: "迁移窗口临时保留。",
  "compensating-controls": "监测和人工访问审批；不能替代网络隔离。",
  "accepted-by": "李楠 · CTO",
  "expires-at": "2026-10-20T00:00:00Z",
  status: "accepted",
});
export const demoProvider = {
  name: "demo",
  lastWrite: null,
  async ready() {
    return { ok: true, missing: [] };
  },
  async initialize() {
    return this.ready();
  },
  async pending() {
    return { count: 0, nextCursor: null };
  },
  async page(key, { cursor = null, valueFilters = [], limit = 50 } = {}) {
    const found = rows[key].filter((r) => valueFilters.every((f) => r.fields[f.fieldSlug] === f.value));
    const start = Number(cursor || 0);
    return {
      records: structuredClone(found.slice(start, start + limit)),
      nextCursor: start + limit < found.length ? String(start + limit) : null,
    };
  },
  async get(key, id) {
    const row = rows[key].find((r) => r.id === id);
    if (!row) throw new Error("RECORD_NOT_FOUND");
    return structuredClone(row);
  },
  async create(key, fields) {
    const row = put(key, `demo-new-${sequence++}`, fields);
    this.lastWrite = { status: "saved", recordId: row.id };
    return structuredClone(row);
  },
  async update(key, row, fields) {
    const original = rows[key].find((r) => r.id === row.id);
    if (!original || original.headCommitId !== row.headCommitId) throw new Error("CONFLICT_REFRESH_REQUIRED");
    original.fields = { ...original.fields, ...fields };
    original.headCommitId = `demo-commit-${sequence++}`;
    this.lastWrite = { status: "saved", recordId: row.id };
    return structuredClone(original);
  },
};
