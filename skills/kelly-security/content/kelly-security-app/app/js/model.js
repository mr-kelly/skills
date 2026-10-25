export const statusLabels = {
  pending: "未开始",
  requested: "等待本机 Agent",
  running: "执行中",
  completed: "采集完成",
  partial: "有覆盖缺口",
  failed: "检查失败",
  cancelled: "已取消",
  "permission-denied": "无权限",
  "not-applicable": "不适用",
  "missing-data": "数据缺失",
  unassessed: "待判断",
  "no-indicators": "本次未发现异常",
  suspicious: "发现可疑线索",
  "confirmed-malicious": "确认恶意",
  "explained-benign": "已解释为正常",
  "insufficient-evidence": "证据不足",
  "needs-review": "待复核",
  "needs-investigation": "仍需调查",
  high: "高",
  medium: "中",
  low: "低",
  critical: "紧急",
  informational: "信息",
};
export const label = (value) => statusLabels[value] || value || "—";
export const tone = (value) =>
  ["suspicious", "confirmed-malicious", "critical", "high", "failed"].includes(value)
    ? "danger"
    : [
          "insufficient-evidence",
          "permission-denied",
          "missing-data",
          "partial",
          "needs-review",
          "needs-investigation",
        ].includes(value)
      ? "warning"
      : ["no-indicators", "explained-benign"].includes(value)
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
export const latestChecks = (rows) => {
  const map = new Map();
  for (const row of rows) {
    const old = map.get(row.fields["check-id"]);
    if (!old || Number(old.fields.attempt) < Number(row.fields.attempt)) map.set(row.fields["check-id"], row);
  }
  return map;
};
export const editable = (host) => host.fields["is-example"] !== true;
export const validAlias = (value) => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value);
export const readiness = (settings) =>
  settings?.fields["onboarding-version"] === 1 &&
  settings.fields["onboarding-state"] === "complete" &&
  !!String(settings.fields.operator || "").trim() &&
  !!String(settings.fields["scope-note"] || "").trim() &&
  settings.fields["execution-mode"] === "local-agent" &&
  !!String(settings.fields["evidence-policy"] || "").trim();
export const runFilters = (id) => [{ fieldSlug: "run-reference", operator: "eq", value: id }];
export const snapshotReport = (input) => {
  const state = { ...input };
  const checks = state.checks.filter((row) => ref(row.fields.run) === state.runId);
  const ids = new Set(checks.map((row) => row.id));
  Object.assign(state, {
    ...state,
    checks,
    findings: state.findings.filter((row) => ref(row.fields.run) === state.runId),
    evidence: state.evidence.filter((row) => ids.has(ref(row.fields.check))),
  });
  const run = state.runs.find((row) => row.id === state.runId);
  const host = state.hosts.find((row) => row.id === ref(run?.fields.host));
  return `# Linux 入侵核查报告\n\n服务器：${host?.fields.title || "未加载"}\n调查范围：${run?.fields["window-start"] || "未记录"} — ${run?.fields["window-end"] || "未记录"}\n\n本报告仅包含当前已加载页面。${Object.values(state.cursors).some(Boolean) ? "仍有未加载记录，不能作为完整报告。" : "完整性还取决于采集范围与日志保留情况。"}\n采集完成不等于已排除入侵。\n\n## 检查与缺口\n\n${state.checks.map((row) => `- ${row.fields.title}：${label(row.fields.conclusion)}；${row.fields["coverage-note"] || "无已记录缺口"}`).join("\n")}\n\n## 发现\n\n${state.findings.map((row) => `- ${row.fields.title}：${label(row.fields.verdict)}\n  ${row.fields.reasoning || ""}\n  限制：${row.fields.limitations || "待补充"}`).join("\n")}\n\n## 证据\n\n${state.evidence.map((row) => `- ${row.fields.title}；来源 ${row.fields["source-locator"]}；${row.fields["event-time"] || row.fields["time-confidence"]}\n  SHA-256: ${row.fields.sha256}\n  ${row.fields["redacted-excerpt"] || ""}`).join("\n")}\n`;
};
