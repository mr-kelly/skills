import { runCoverage } from "./coverage.js";
import { statusLabels } from "./messages.js";
import { redact } from "./validation.js";
export const label = (value) => statusLabels[value] || value || "—";
export const tone = (value) =>
  ["violated", "policy-violation", "confirmed-vulnerability", "high", "failed", "reopened"].includes(value)
    ? "danger"
    : [
          "inconclusive",
          "insufficient-evidence",
          "needs-review",
          "needs-investigation",
          "partial",
          "candidate",
          "ready-for-retest",
          "missing-data",
        ].includes(value)
      ? "warning"
      : ["satisfied", "verified-fixed", "explained-benign"].includes(value)
        ? "positive"
        : "neutral";
export const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );
export const ref = (value) => (typeof value === "string" ? value : Array.isArray(value) ? value[0] || "" : "");
export const date = (value) =>
  value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "未记录";
export const parse = (value, fallback = null) => {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};
export const filter = (key, value) => [{ fieldSlug: `${key}-reference`, operator: "eq", value }];
export const href = (state, view, item = "", runId = state.runId) =>
  `#/${view}?project=${encodeURIComponent(state.projectId)}&run=${encodeURIComponent(runId || "")}${item ? `&item=${encodeURIComponent(item)}` : ""}`;
export const latest = (rows) => {
  const map = new Map();
  for (const row of rows) {
    const old = map.get(row.fields["rule-reference"]);
    if (!old || Number(old.fields.attempt) < Number(row.fields.attempt)) map.set(row.fields["rule-reference"], row);
  }
  return map;
};
export const inventoryExample = (revision = "demo-rev-a") => ({
  schemaVersion: 1,
  sourceRevision: revision,
  endpoints: [
    { key: "own-order", method: "GET", path: "/orders/test-a", flow: "订单", location: "OpenAPI 或已审查源码" },
    { key: "other-order", method: "GET", path: "/orders/test-b", flow: "订单", location: "OpenAPI 或已审查源码" },
  ],
  rules: [
    {
      key: "own-a",
      endpointKey: "own-order",
      identity: "user-a",
      expectation: "allow",
      expectedStatuses: [200],
      assertions: [{ path: "id", equals: "test-a" }],
      objectId: "test-a",
      policyNote: "测试账号 A 可以读取自己的受控订单",
      confirmed: true,
    },
    {
      key: "cross-a",
      endpointKey: "other-order",
      identity: "user-a",
      expectation: "deny",
      expectedStatuses: [403, 404],
      forbiddenAssertions: [{ path: "id", equals: "test-b" }],
      objectId: "test-b",
      baselineRuleKey: "own-a",
      policyNote: "测试账号 A 不得读取 B 的受控订单",
      confirmed: true,
    },
  ],
});
const reportText = (value) =>
  redact(value)
    .replace(/[\r\n]/g, " ")
    .replace(/[<>&[\]()`#*_]/g, (character) => `\\${character}`);
export const snapshotReport = (state) => {
  const run = state.run;
  const coverage = runCoverage(run, state.rules, state.endpoints, state.checks, { paginationComplete: false });
  return `${[
    "# 应用与 API 安全审计 · 已加载记录",
    `项目：${reportText(state.project?.fields.title || "未加载")}\n版本：${reportText(state.revision)}\n环境：${reportText(run?.fields.environment || state.project?.fields.environment || "未记录")}`,
    `任务状态：${reportText(label(run?.fields.status))}（${reportText(run?.fields.status || "未选择任务")}）\n任务说明：${reportText(run?.fields.summary || "未记录任务完成说明；不能推断通过。")}`,
    `数据范围：只包含当前页面已加载、属于所选任务的记录。${Object.values(state.cursors).some(Boolean) ? "仍有未加载页面。" : "没有显示分页不等于测试全部完成。"}\n测试覆盖：不能由已存在的成功记录推断完整；请求 ${coverage.expected} 条，未执行或未加载/变更 ${coverage.unexecuted} 条。浏览器未核验原件与策略指纹；需要本机完整导出继续核对。\n${coverage.warning}`,
    "## 原请求规则与覆盖缺口（仅核对已加载元数据）",
    ...coverage.entries.map(
      (entry) =>
        `- ${reportText(entry.title)}：${reportText(entry.method)} ${reportText(entry.path)}；身份 ${reportText(entry.identity)}；预期 ${reportText(label(entry.expectation))}\n  业务规则：${reportText(entry.policyNote)}\n  执行 ${reportText(label(entry.status))}；观察 ${reportText(label(entry.result))}；${reportText(entry.reason)}`,
    ),
    "## 已加载执行记录",
    ...state.checks.map(
      (row) =>
        `- ${reportText(row.fields.title)}：${reportText(label(row.fields.status))} / ${reportText(label(row.fields.result))}；${reportText(row.fields.summary || "")}`,
    ),
    "## 发现与复核",
    ...state.findings.map(
      (row) =>
        `- ${reportText(row.fields.title)}：${reportText(label(row.fields.verdict))} / ${reportText(label(row.fields.remediation))}\n  ${reportText(row.fields.reasoning || "")}\n  限制：${reportText(row.fields.limitations || "未记录")}`,
    ),
    "## 证据",
    ...state.evidence.map(
      (row) =>
        `- ${reportText(row.fields.title)}；${reportText(row.fields["source-location"])}；版本 ${reportText(row.fields["source-revision"])}；SHA-256 ${reportText(row.fields.sha256)}\n  ${reportText(row.fields["redacted-excerpt"] || "")}`,
    ),
  ].join("\n\n")}\n`;
};
