import { parseJson } from "./validation.js";
const ref = (value) => (typeof value === "string" ? value : Array.isArray(value) ? value[0] || "" : "");
const text = (value, maximum = 1000) => String(value ?? "").slice(0, maximum);
export const describeRuleRequest = (rule, endpoint) => ({
  title: text(rule.fields.title),
  identity: text(rule.fields.identity, 100),
  expectation: text(rule.fields.expectation, 20),
  policyNote: text(rule.fields["policy-note"], 4000),
  endpointId: endpoint.id,
  endpointHeadCommitId: endpoint.headCommitId,
  method: text(endpoint.fields.method, 20),
  path: text(endpoint.fields.path),
});
export const ruleSnapshot = (rule, endpoint) => ({
  id: rule.id,
  headCommitId: rule.headCommitId,
  request: describeRuleRequest(rule, endpoint),
});
const snapshot = (run) => {
  try {
    const value = parseJson(run?.fields["rule-snapshot"], []);
    return Array.isArray(value) &&
      value.length <= 50 &&
      value.every((entry) => entry && typeof entry.id === "string" && typeof entry.headCommitId === "string") &&
      new Set(value.map((entry) => entry.id)).size === value.length
      ? value
      : null;
  } catch {
    return null;
  }
};
// Reconcile what was explicitly requested, rather than inferring coverage from
// the subset of attempts which happen to exist. Browser exports deliberately
// leave policy verification to the bounded local export.
/** @returns {boolean} */
const unverifiedPolicy = (_check, _rule, _endpoint) => false;
export const runCoverage = (
  run,
  rules,
  endpoints,
  checks,
  { paginationComplete = true, policyMatches = unverifiedPolicy } = {},
) => {
  const expected = snapshot(run);
  if (!expected)
    return {
      complete: false,
      expected: 0,
      conclusive: 0,
      unexecuted: 0,
      unresolved: 0,
      entries: [],
      warning: "任务规则快照无效，无法确认预期覆盖；不得当成已通过。",
    };
  const revision = run?.fields["source-revision"];
  const projectId = run?.fields["project-reference"];
  const entries = expected.map((entry) => {
    const rule = rules.find((row) => row.id === entry.id);
    const endpoint = rule ? endpoints.find((row) => row.id === ref(rule.fields.endpoint)) : null;
    const registered =
      entry.request && typeof entry.request === "object" && !Array.isArray(entry.request) ? entry.request : null;
    const description = registered
      ? {
          title: text(registered.title),
          identity: text(registered.identity, 100),
          expectation: text(registered.expectation, 20),
          policyNote: text(registered.policyNote, 4000),
          method: text(registered.method, 20),
          path: text(registered.path),
        }
      : rule && endpoint
        ? describeRuleRequest(rule, endpoint)
        : {
            title: `规则 ${text(entry.id, 160)}`,
            identity: "未加载",
            expectation: "未记录",
            policyNote: "原请求未保存可读描述，当前无法恢复。",
            method: "",
            path: "",
          };
    const base = {
      ruleId: entry.id,
      ...description,
      status: paginationComplete ? "unexecuted" : "unavailable",
      result: "unverified",
      attempt: 0,
      conclusive: false,
      reason: paginationComplete
        ? "未验证：没有该规则的执行记录。"
        : "未验证：当前只读取了部分记录，无法判断此规则是否执行。",
    };
    if (!rule || !endpoint)
      return {
        ...base,
        status: "unavailable",
        reason: "未验证：原规则或端点未加载、已删除或无法读取；保留请求快照，不推断通过。",
      };
    if (
      rule.fields["project-reference"] !== projectId ||
      ref(rule.fields.project) !== projectId ||
      rule.fields["source-revision"] !== revision ||
      endpoint.fields["project-reference"] !== projectId ||
      ref(endpoint.fields.project) !== projectId ||
      endpoint.fields["source-revision"] !== revision ||
      rule.fields["endpoint-reference"] !== endpoint.id
    )
      return { ...base, status: "scope-mismatch", reason: "规则/端点的项目、关系或版本与任务不一致，不能计入通过。" };
    if (
      rule.headCommitId !== entry.headCommitId ||
      (registered && JSON.stringify(registered) !== JSON.stringify(describeRuleRequest(rule, endpoint)))
    )
      return { ...base, status: "changed", reason: "规则或端点与原请求快照已变更，原结果不能计入当前覆盖。" };
    const attempts = checks
      .filter((row) => row.fields["rule-reference"] === entry.id && ref(row.fields.rule) === entry.id)
      .sort((a, b) => Number(b.fields.attempt) - Number(a.fields.attempt));
    const check = attempts[0];
    if (!check) return base;
    if (
      check.fields["project-reference"] !== projectId ||
      ref(check.fields.project) !== projectId ||
      check.fields["run-reference"] !== run.id ||
      ref(check.fields.run) !== run.id ||
      check.fields["source-revision"] !== revision ||
      check.fields["endpoint-reference"] !== endpoint.id ||
      ref(check.fields.endpoint) !== endpoint.id
    )
      return { ...base, status: "scope-mismatch", reason: "执行记录与任务、端点或版本不一致，不能计入通过。" };
    const result = {
      ...base,
      status: check.fields.status,
      result: check.fields.result,
      attempt: Number(check.fields.attempt) || 0,
      reason: text(check.fields.summary, 4000),
    };
    if (check.fields.status !== "completed")
      return {
        ...result,
        reason: `执行未完成（${text(check.fields.status, 40)}）；${result.reason || "不能推断通过。"}`,
      };
    if (!["satisfied", "violated"].includes(check.fields.result))
      return { ...result, reason: `证据不足或未验证；${result.reason || "不能推断通过。"}` };
    if (!paginationComplete)
      return {
        ...result,
        reason: `当前只读取了部分执行记录，无法排除后续失败 attempt；未计入已验证覆盖。${result.reason}`,
      };
    if (!policyMatches(check, rule, endpoint))
      return { ...result, reason: `已加载观察结果尚未核验原规则与端点指纹，不能计入已验证覆盖；${result.reason}` };
    return { ...result, conclusive: true };
  });
  const conclusive = entries.filter((entry) => entry.conclusive).length;
  return {
    complete:
      paginationComplete && run?.fields.status === "completed" && entries.length > 0 && conclusive === entries.length,
    expected: entries.length,
    conclusive,
    unresolved: entries.length - conclusive,
    unexecuted: entries.filter((entry) =>
      ["unexecuted", "unavailable", "changed", "scope-mismatch"].includes(entry.status),
    ).length,
    entries,
    warning: entries.length
      ? "覆盖只适用于显式规则、身份、受控对象、版本和断言；不等于整个应用没有漏洞。"
      : "任务没有登记动态规则快照，无法声称动态测试覆盖完整。",
  };
};
