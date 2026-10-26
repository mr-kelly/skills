import { appConfig } from "../content/kelly-compliance-app/app/js/config.js";
import { controlReadiness, exceptionState } from "../content/kelly-compliance-app/app/js/domain.js";
import { redact } from "./imports.mjs";
import { programFilter, requireOwned } from "./service.mjs";
export const exportPreparation = async (
  store,
  programId,
  { maxRows = 500, onProgress = (_progress) => {}, signal = undefined, now = new Date().toISOString() } = {},
) => {
  if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 2000) throw new Error("EXPORT_BUDGET_1_TO_2000");
  const program = await store.get("programs", programId);
  const records = {};
  let total = 0;
  const truncated = [];
  for (const base of appConfig.bases.filter((b) => b.key !== "programs")) {
    records[base.key] = [];
    let cursor;
    do {
      if (signal?.aborted) throw new Error("EXPORT_CANCELLED");
      if (total >= maxRows) {
        truncated.push(base.key);
        break;
      }
      const page = await store.page(base.key, {
        valueFilters: programFilter(programId),
        limit: Math.min(50, maxRows - total),
        ...(cursor ? { cursor } : {}),
      });
      records[base.key].push(...page.records.map((row) => requireOwned(row, programId)));
      total += page.records.length;
      cursor = page.nextCursor;
      onProgress?.({ resource: base.key, loaded: total, maxRows });
    } while (cursor);
  }
  const p = program.fields;
  const line = (v) => redact(v).replaceAll("\n", " ");
  const doc = [
    `# ${line(p.title)} — 云安全与 SOC 2 准备材料`,
    `生成：${now}`,
    "这是准备材料，不是审计意见或认证。仅描述登记材料与明确限制，独立审计师决定其充分性。",
    `服务：${line(p["service-description"])}`,
    `负责人：${line(p.owner)}`,
    `授权：${line(p["scope-reference"])} / 范围 v${p["scope-version"]}`,
    `账户：${line(p.accounts)}；区域：${line(p.regions)}`,
    `框架：${line(p["framework-version"])}`,
    `声明期间：${p["period-start"]} → ${p["period-end"]} (${p["assessment-type"]})`,
    `导出 ${total}/${maxRows} 条预算；截断资源：${truncated.join(",") || "无"}。未提供材料、权限不足、未覆盖资产与期间仍是缺口。`,
    "## 控制与证据维度",
  ];
  for (const c of records.controls) {
    const result = controlReadiness(program, c, records.evidence, records["evidence-links"], now);
    doc.push(
      `- ${line(c.fields.title)}：${result.state}；负责人 ${line(c.fields.owner)}；频率 ${line(c.fields.frequency)}；${result.reason}`,
      `  维度：${result.dimensions.map((d) => `${d.key}=${d.state}`).join("；")}`,
    );
  }
  doc.push("## 证据来源、完整性与真实期间");
  for (const e of records.evidence) {
    const f = e.fields;
    doc.push(
      `- ${line(f.title)} (${e.id})：${line(f.account)}/${line(f.region)}/${line(f["resource-key"])}；检查 ${line(f["check-id"])}；维度 ${line(f["requirement-key"])}；结果 ${f["technical-result"]}`,
      `  来源 ${line(f["source-locator"])}；sha256 ${f.sha256}；观察 ${f["observed-at"]}；采集 ${f["collected-at"]}；覆盖 ${f["coverage-start"] || "时点"} → ${f["coverage-end"] || f["observed-at"]}；范围 v${f["scope-version"]}`,
    );
  }
  doc.push("## 独立映射复核");
  for (const l of records["evidence-links"])
    doc.push(
      `- ${line(l.fields.title)}：${l.fields["review-state"]}；复核人 ${line(l.fields.reviewer)}；理由 ${line(l.fields["review-note"])}；控制 ${l.fields["control-reference"]} / 证据 ${l.fields["evidence-reference"]}`,
    );
  doc.push("## 缺口、责任与复测");
  for (const i of records.issues)
    doc.push(
      `- ${line(i.fields.title)}：${i.fields.status} / ${i.fields.severity}；${line(i.fields.owner)}；到期 ${i.fields["due-at"] || "未设"}；${line(i.fields.reason)}；验证证据 ${i.fields["verified-evidence-reference"] || "尚无"}；${line(i.fields["resolution-note"])}`,
    );
  doc.push("## 风险接受（不改变技术结果）");
  for (const e of records.exceptions)
    doc.push(
      `- ${line(e.fields.title)}：${exceptionState(e, now)}；理由 ${line(e.fields.reason)}；补偿 ${line(e.fields["compensating-controls"])}；接受人 ${line(e.fields["accepted-by"])}；截止 ${e.fields["expires-at"]}`,
    );
  doc.push("## 评估覆盖限制");
  for (const a of records.assessments)
    doc.push(`- ${line(a.fields.title)}：${a.fields.status}；${line(a.fields["coverage-note"])}`);
  return { program, records, total, truncated, complete: truncated.length === 0, markdown: `${doc.join("\n\n")}\n` };
};
