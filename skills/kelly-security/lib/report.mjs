import { redact } from "./analysis.mjs";
import { relationId } from "./store.mjs";

export const exportRun = async (store, runId, { maxRows = 2000, onProgress = (_progress) => {} } = {}) => {
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 10000) throw new Error("INVALID_EXPORT_BUDGET");
  const run = await store.get("runs", runId);
  const host = await store.get("hosts", relationId(run.fields.host));
  let complete = true;
  const scan = async (key, valueFilters, remaining) => {
    const rows = [];
    let cursor = null;
    do {
      const page = await store.page(key, { valueFilters, cursor, limit: Math.min(50, remaining - rows.length) });
      rows.push(...page.records);
      cursor = page.nextCursor;
      onProgress({ resource: key, loaded: rows.length, hasMore: !!cursor });
    } while (cursor && rows.length < remaining);
    if (cursor) complete = false;
    return rows;
  };
  const runFilter = [{ fieldSlug: "run-reference", operator: "eq", value: runId }];
  const [checks, findings] = await Promise.all([
    scan("checks", runFilter, maxRows),
    scan("findings", runFilter, maxRows),
  ]);
  if ([...checks, ...findings].some((row) => relationId(row.fields.run) !== runId))
    throw new Error("EXPORT_RUN_FILTER_NOT_HONORED");
  const evidence = [];
  for (let index = 0; index < checks.length && evidence.length < maxRows; index += 50) {
    const ids = checks.slice(index, index + 50).map((check) => check.id);
    const rows = await scan(
      "evidence",
      [{ any: ids.map((id) => ({ fieldSlug: "check-reference", operator: "eq", value: id })) }],
      maxRows - evidence.length,
    );
    if (rows.some((row) => !ids.includes(relationId(row.fields.check))))
      throw new Error("EXPORT_EVIDENCE_FILTER_NOT_HONORED");
    evidence.push(...rows);
    if (index + 50 < checks.length && evidence.length >= maxRows) complete = false;
  }
  return { run, host, checks, findings, evidence, complete, maxRows };
};

const plain = (value) =>
  redact(value)
    .replace(/[\r\n]/g, " ")
    .replace(/[<>&[\]()`#*_]/g, (character) => `\\${character}`);
const block = (value) => {
  const text = redact(value);
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(longest + 1);
  return `${fence}text\n${text}\n${fence}`;
};
export const reportMarkdown = (result) => {
  const { run, host, checks, evidence, findings } = result;
  const evidenceName = new Map(evidence.map((row, index) => [row.id, `证据 ${index + 1}`]));
  const parts = [
    "# Linux 入侵核查报告",
    `服务器：${plain(host.fields.title)}\n\n调查时间：${plain(run.fields["window-start"])} — ${plain(run.fields["window-end"])}`,
    `导出范围：${result.complete ? "本任务记录已按分页读取完毕" : "达到导出上限，记录不完整，必须继续补充"}。\n\n采集完成不等于已排除入侵；以下判断只适用于已覆盖的证据。主机失陷可能影响本机日志和工具的可信度。`,
    "## 检查与覆盖缺口",
  ];
  for (const row of checks)
    parts.push(
      `- ${plain(row.fields.title)}，尝试 ${plain(row.fields.attempt)}：${plain(row.fields.status)} / ${plain(row.fields.conclusion)}。\n  缺口：${plain(row.fields["coverage-note"] || "无已记录缺口；仍需核对采集范围")}。`,
    );
  parts.push("## 发现与人工复核");
  if (!findings.length) parts.push("本次没有已记录发现；不能据此排除入侵。");
  for (const row of findings) {
    const refs = Array.isArray(row.fields.evidence) ? row.fields.evidence : [row.fields.evidence];
    parts.push(
      `### ${plain(row.fields.title)}\n\n自动分析：${plain(row.fields.conclusion)}；人工复核：${plain(row.fields.verdict)}。\n\n依据：${refs.map((id) => evidenceName.get(id) || "证据未包含在本次导出中").join("、")}\n\n${block(row.fields.reasoning || "未记录")}\n\n限制：${plain(row.fields.limitations || "待补充")}\n\n复核理由：${plain(row.fields["review-note"] || "尚未复核")}\n\n下一步：${plain(row.fields["next-step"] || "补充独立证据与业务基线")}。`,
    );
  }
  parts.push("## 事件时间线与证据");
  for (const row of [...evidence].sort((a, b) =>
    String(a.fields["event-time"] || "z").localeCompare(String(b.fields["event-time"] || "z")),
  ))
    parts.push(
      `### ${evidenceName.get(row.id)} · ${plain(row.fields.title)}\n\n事件时间：${plain(row.fields["event-time"] || "不确定")}（${plain(row.fields["time-confidence"])}）\n\n来源：${plain(row.fields["source-locator"])}；采集时间：${plain(row.fields["collected-at"])}\n\n原始取证文件 SHA-256：${plain(row.fields.sha256)}\n\n${block(row.fields["redacted-excerpt"] || "无摘要")}\n\n${plain(row.fields["redaction-note"] || "原始敏感证据保留本机，不随本报告上传。")}`,
    );
  parts.push(
    "## 后续处置边界\n\n根据已确认的证据决定补证、隔离、可信重建或凭据轮换。处置动作应由事件负责人按具体范围授权，不能把本报告中的线索当作自动删除或重启的依据。",
  );
  return `${parts.join("\n\n")}\n`;
};
