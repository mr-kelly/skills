import { redact } from "./domain.mjs";
import { relationId } from "./store.mjs";
export const exportRun = async (store, runId, { maxRows = 2000, onProgress = (_value) => {} } = {}) => {
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 10000) throw new Error("INVALID_EXPORT_BUDGET");
  const run = await store.get("runs", runId);
  const project = await store.get("projects", relationId(run.fields.project));
  let complete = true;
  const rows = async (key) => {
    const result = [];
    let cursor = null;
    do {
      const page = await store.page(key, {
        cursor,
        limit: Math.min(50, maxRows - result.length),
        valueFilters: [{ fieldSlug: "run-reference", operator: "eq", value: runId }],
      });
      if (
        page.records.some(
          (row) => relationId(row.fields.run) !== runId || row.fields["project-reference"] !== project.id,
        )
      )
        throw new Error("EXPORT_RECORD_OUTSIDE_SCOPE");
      result.push(...page.records);
      cursor = page.nextCursor;
      onProgress({ resource: key, loaded: result.length, hasMore: !!cursor });
    } while (cursor && result.length < maxRows);
    if (cursor) complete = false;
    return result;
  };
  const [checks, findings, evidence] = await Promise.all([rows("checks"), rows("findings"), rows("evidence")]);
  return { run, project, checks, findings, evidence, complete };
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
export const reportMarkdown = ({ run, project, checks, findings, evidence, complete }) =>
  `${[
    "# 应用与 API 安全审计报告",
    `项目：${safe(project.fields.title)}\n\n版本：${safe(run.fields["source-revision"])}；环境：${safe(run.fields.environment)}\n\n方式：${safe(run.fields.mode)}；范围引用：${safe(run.fields["scope-reference"])}`,
    `导出${complete ? "已读取本任务全部记录" : "达到上限，尚不完整"}。结果仅适用于本次显式接口、身份、规则、版本和断言；采集完成不等于系统没有漏洞。`,
    "## 逐项结果",
    ...checks.map(
      (row) =>
        `- ${safe(row.fields.title)}：${safe(row.fields.status)} / ${safe(row.fields.result)}；${safe(row.fields.summary)}`,
    ),
    "## 发现与人工复核",
    ...findings.map(
      (row) =>
        `### ${safe(row.fields.title)}\n\n结论：${safe(row.fields.conclusion)}；复核：${safe(row.fields.verdict)}；修复：${safe(row.fields.remediation)}\n\n${code(row.fields.reasoning)}\n\n限制：${safe(row.fields.limitations)}\n\n建议：${safe(row.fields.recommendation)}\n\n复核理由：${safe(row.fields["review-note"] || "尚未复核")}`,
    ),
    "## 来源与证据",
    ...evidence.map(
      (row) =>
        `### ${safe(row.fields.title)}\n\n来源：${safe(row.fields["source-location"])}；版本：${safe(row.fields["source-revision"])}；采集：${safe(row.fields["observed-at"])}\n\nSHA-256：${safe(row.fields.sha256)}\n\n${code(row.fields["redacted-excerpt"])}\n\n${safe(row.fields["coverage-note"])}`,
    ),
  ].join("\n\n")}\n`;
