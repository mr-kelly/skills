import { statusLabels } from "./messages.js";
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
export const snapshotReport = (state) =>
  `# 应用与 API 安全审计 · 已加载记录\n\n项目：${state.project?.fields.title || "未加载"}\n版本：${state.revision}\n环境：${state.project?.fields.environment || "未记录"}\n\n本报告仅包括当前页面已加载、属于所选任务的记录。${Object.values(state.cursors).some(Boolean) ? "仍有未加载页面。" : "采集覆盖仍需按每项证据核对。"}\n采集完成不等于系统没有漏洞。\n\n## 规则验证\n${state.checks.map((row) => `- ${row.fields.title}：${label(row.fields.result)}；${row.fields.summary || ""}`).join("\n")}\n\n## 发现与复核\n${state.findings.map((row) => `- ${row.fields.title}：${label(row.fields.verdict)} / ${label(row.fields.remediation)}\n  ${row.fields.reasoning || ""}\n  限制：${row.fields.limitations || "未记录"}`).join("\n")}\n\n## 证据\n${state.evidence.map((row) => `- ${row.fields.title}；${row.fields["source-location"]}；版本 ${row.fields["source-revision"]}；SHA-256 ${row.fields.sha256}\n  ${row.fields["redacted-excerpt"] || ""}`).join("\n")}\n`;
