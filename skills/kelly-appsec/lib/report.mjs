import { runCoverage } from "../content/kelly-appsec-app/app/js/coverage.js";
import { label } from "../content/kelly-appsec-app/app/js/model.js";
import { parseJson, redact } from "./domain.mjs";
import { policyFingerprint } from "./runner.mjs";
import { relationId } from "./store.mjs";
export const exportRun = async (store, runId, { maxRows = 2000, onProgress = (_value) => {} } = {}) => {
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 10000) throw new Error("INVALID_EXPORT_BUDGET");
  const run = await store.get("runs", runId);
  const project = await store.get("projects", relationId(run.fields.project));
  if (run.fields["project-reference"] !== project.id) throw new Error("EXPORT_RUN_OUTSIDE_PROJECT");
  let paginationComplete = true;
  const rows = async (key) => {
    const result = [];
    let cursor = null;
    do {
      const limit = Math.min(50, maxRows - result.length);
      const page = await store.page(key, {
        cursor,
        limit,
        valueFilters: [{ fieldSlug: "run-reference", operator: "eq", value: runId }],
      });
      if (
        page.records.length > limit ||
        page.records.some(
          (row) =>
            relationId(row.fields.run) !== runId ||
            row.fields["run-reference"] !== runId ||
            relationId(row.fields.project) !== project.id ||
            row.fields["project-reference"] !== project.id ||
            row.fields["source-revision"] !== run.fields["source-revision"],
        )
      )
        throw new Error("EXPORT_RECORD_OUTSIDE_SCOPE");
      result.push(...page.records);
      cursor = page.nextCursor;
      onProgress({ resource: key, loaded: result.length, hasMore: !!cursor });
    } while (cursor && result.length < maxRows);
    if (cursor) paginationComplete = false;
    return result;
  };
  const [checks, findings, evidence] = await Promise.all([rows("checks"), rows("findings"), rows("evidence")]);
  const rules = [];
  const endpoints = [];
  let expected = [];
  try {
    const value = parseJson(run.fields["rule-snapshot"], []);
    if (Array.isArray(value) && value.length <= 50) expected = value;
  } catch {
    /* Invalid snapshot is reported explicitly by reconciliation. */
  }
  for (const entry of expected) {
    if (!entry || typeof entry.id !== "string" || typeof entry.headCommitId !== "string") continue;
    let rule;
    try {
      rule = await store.get("rules", entry.id);
    } catch {
      continue;
    }
    if (
      rule.fields["project-reference"] !== project.id ||
      relationId(rule.fields.project) !== project.id ||
      rule.fields["source-revision"] !== run.fields["source-revision"]
    )
      throw new Error("EXPORT_RULE_OUTSIDE_SCOPE");
    rules.push(rule);
    const endpointId = relationId(rule.fields.endpoint);
    if (!endpoints.some((row) => row.id === endpointId)) {
      let endpoint;
      try {
        endpoint = await store.get("endpoints", endpointId);
      } catch {
        continue;
      }
      if (
        endpoint.fields["project-reference"] !== project.id ||
        relationId(endpoint.fields.project) !== project.id ||
        endpoint.fields["source-revision"] !== run.fields["source-revision"]
      )
        throw new Error("EXPORT_ENDPOINT_OUTSIDE_SCOPE");
      endpoints.push(endpoint);
    }
  }
  const coverage = runCoverage(run, rules, endpoints, checks, {
    paginationComplete,
    policyMatches: (check, rule, endpoint) => {
      try {
        return (
          check.fields["policy-hash"] ===
          policyFingerprint(project.id, run.id, run.fields["source-revision"], rule, endpoint)
        );
      } catch {
        return false;
      }
    },
  });
  return {
    run,
    project,
    checks,
    findings,
    evidence,
    rules,
    endpoints,
    coverage,
    paginationComplete,
    complete: paginationComplete && coverage.complete,
  };
};
const safe = (value) =>
  redact(value)
    .replace(/[\r\n]/g, " ")
    .replace(/[<>&[\]()`#*_]/g, (character) => `\\${character}`);
const code = (value) => {
  const text = redact(value);
  const fence = "`".repeat(Math.max(2, ...[...text.matchAll(/`+/g)].map((match) => match[0].length)) + 1);
  return `${fence}text\n${text}\n${fence}`;
};
export const reportMarkdown = ({ run, project, checks, findings, evidence, coverage, paginationComplete, complete }) =>
  `${[
    "# 应用与 API 安全审计报告",
    `项目：${safe(project.fields.title)}\n\n版本：${safe(run.fields["source-revision"])}；环境：${safe(run.fields.environment)}\n\n方式：${safe(label(run.fields.mode))}；范围引用：${safe(run.fields["scope-reference"])}`,
    `任务状态：${safe(label(run.fields.status))}（${safe(run.fields.status)}）\n\n任务说明：${safe(run.fields.summary || "未记录任务完成说明；不能据此推断通过。")}`,
    `数据分页：${(paginationComplete ?? complete) ? "已读取本任务全部已存在记录" : "达到导出上限，仍有记录未导出"}。分页导出完整与测试覆盖完整分别判断。`,
    `测试覆盖：${coverage?.complete ? "本次显式规则已得到完整、可归属的观察" : "不完整 / 尚未全部验证"}；预期 ${coverage?.expected ?? "未知"} 条，已核验 ${coverage?.conclusive ?? 0} 条，未执行或无法验证 ${coverage?.unresolved ?? "未知"} 条。\n\n${safe(coverage?.warning || "缺少预期规则对账，不能声称已完成全部测试。")}`,
    "## 原请求规则与覆盖缺口",
    ...(coverage?.entries || []).map(
      (entry) =>
        `### ${safe(entry.title)}\n\n${safe(entry.method)} ${safe(entry.path)}；身份：${safe(entry.identity)}；预期：${safe(label(entry.expectation))}\n\n业务规则：${safe(entry.policyNote)}\n\n执行：${safe(label(entry.status))}；结果：${safe(label(entry.result))}；attempt ${entry.attempt}；${entry.conclusive ? "已核验该条观察" : "未计入已验证覆盖"}\n\n${safe(entry.reason)}`,
    ),
    "## 已存在的执行记录（保留历史 attempt）",
    ...checks.map(
      (row) =>
        `- ${safe(row.fields.title)}：${safe(label(row.fields.status))} / ${safe(label(row.fields.result))}；${safe(row.fields.summary)}`,
    ),
    "## 发现与人工复核",
    ...findings.map(
      (row) =>
        `### ${safe(row.fields.title)}\n\n结论：${safe(label(row.fields.conclusion))}；复核：${safe(label(row.fields.verdict))}；修复：${safe(label(row.fields.remediation))}\n\n${code(row.fields.reasoning)}\n\n限制：${safe(row.fields.limitations)}\n\n建议：${safe(row.fields.recommendation)}\n\n复核理由：${safe(row.fields["review-note"] || "尚未复核")}`,
    ),
    "## 来源与证据",
    ...evidence.map(
      (row) =>
        `### ${safe(row.fields.title)}\n\n来源：${safe(row.fields["source-location"])}；版本：${safe(row.fields["source-revision"])}；采集：${safe(row.fields["observed-at"])}\n\nSHA-256：${safe(row.fields.sha256)}\n\n${code(row.fields["redacted-excerpt"])}\n\n${safe(row.fields["coverage-note"])}`,
    ),
  ].join("\n\n")}\n`;
