export const FRAMEWORK = "kelly-soc2-readiness@1";
export const CONTROL_TEMPLATES = [
  {
    key: "scope",
    title: "服务边界与资产责任",
    reference: "TSC CC2 / CC3 — illustrative mapping",
    kind: "organizational",
    mode: "period",
    frequency: "范围变化时及声明的周期复核",
    checks: ["asset-inventory"],
    description: "记录 SaaS 服务、客户承诺、环境、云账户区域、资产负责人和外包责任；证据必须覆盖声明范围。",
  },
  {
    key: "access",
    title: "身份与访问复核",
    reference: "TSC CC6 — illustrative mapping",
    kind: "technical",
    mode: "period",
    frequency: "按已批准的访问复核频率",
    checks: ["identity-access", "root-mfa", "offboarding", "access-review"],
    description: "核对管理身份、联邦强认证、授权、入离职和周期访问复核；只列 IAM 用户不能证明全部身份已覆盖。",
  },
  {
    key: "network",
    title: "网络与存储访问边界",
    reference: "TSC CC6 — illustrative mapping",
    kind: "technical",
    mode: "snapshot",
    frequency: "配置变更后及声明的复核周期",
    checks: ["network-public-admin", "storage-public", "storage-encryption"],
    description: "核对管理端口、数据库和存储公开策略与业务需要；记录例外，不把加密等同于正确授权。",
  },
  {
    key: "changes",
    title: "生产变更可追溯",
    reference: "TSC CC8 — illustrative mapping",
    kind: "organizational",
    mode: "period",
    frequency: "每次生产变更",
    checks: ["change-review"],
    description: "核对变更提交、合并前有效审核、当时的测试结果和部署；保留紧急变更的授权与后续复核。",
  },
  {
    key: "operations",
    title: "日志、事件与漏洞处理",
    reference: "TSC CC7 — illustrative mapping",
    kind: "technical",
    mode: "period",
    frequency: "按监测、事件与漏洞处理制度",
    checks: ["audit-logging", "vulnerability-review", "incident-response"],
    description: "保留日志范围、告警与事件处理、漏洞整改和复测记录；今天启用日志不能证明过去一直启用。",
  },
  {
    key: "backups",
    title: "备份与恢复验证",
    reference: "TSC CC7 / CC9 — illustrative mapping",
    kind: "technical",
    mode: "period",
    frequency: "按恢复目标和演练计划",
    checks: ["backup-recovery", "restore-test"],
    description: "核对备份执行和实际恢复演练；备份成功不能自动证明业务可恢复。",
  },
  {
    key: "people",
    title: "制度、人员与实际执行",
    reference: "TSC CC1 / CC2 / CC5 — illustrative mapping",
    kind: "organizational",
    mode: "period",
    frequency: "按适用人员和制度周期",
    checks: ["people-policy"],
    description: "记录制度版本、批准、人员适用范围、培训/确认和实际执行；仅有模板文件不能证明有效运行。",
  },
  {
    key: "vendors",
    title: "供应商与风险处理",
    reference: "TSC CC3 / CC4 / CC9 — illustrative mapping",
    kind: "organizational",
    mode: "period",
    frequency: "采购/重大变化及声明的复核周期",
    checks: ["vendor-risk"],
    description: "评估关键供应商、报告范围、客户责任和残余风险；供应商 SOC 报告不能代替本系统的控制证据。",
  },
];
export const ref = (value) =>
  typeof value === "string" ? value : Array.isArray(value) && value.length === 1 ? value[0] || "" : "";
export const lines = (value) => [
  ...new Set(
    String(value || "")
      .split(/[\n,]/)
      .map((v) => v.trim())
      .filter(Boolean),
  ),
];
export const iso = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
  Number.isFinite(Date.parse(value));
export const programReady = (program) => {
  const f = program?.fields || program || {};
  return (
    !!f.title &&
    !!String(f.owner || "").trim() &&
    !!String(f["service-description"] || "").trim() &&
    lines(f.accounts).length > 0 &&
    lines(f.regions).length > 0 &&
    f["framework-version"] === FRAMEWORK &&
    !!f["scope-reference"] &&
    Number.isSafeInteger(f["scope-version"]) &&
    f["scope-version"] > 0 &&
    iso(f["period-start"]) &&
    iso(f["period-end"]) &&
    Date.parse(f["period-start"]) <= Date.parse(f["period-end"]) &&
    ["point", "period"].includes(f["assessment-type"]) &&
    (f["assessment-type"] !== "period" || Date.parse(f["period-start"]) < Date.parse(f["period-end"])) &&
    f["onboarding-state"] === "complete"
  );
};
export const exceptionState = (exception, now = new Date().toISOString()) =>
  exception.fields.status === "revoked"
    ? "revoked"
    : !iso(exception.fields["expires-at"]) || Date.parse(exception.fields["expires-at"]) <= Date.parse(now)
      ? "expired"
      : "accepted";

export const evaluateEvidence = (program, control, evidence, link, now = new Date().toISOString()) => {
  const p = program.fields;
  const c = control.fields;
  const e = evidence.fields;
  const l = link?.fields;
  const result = (state, reason) => ({ state, reason });
  if (
    ref(c.program) !== program.id ||
    ref(e.program) !== program.id ||
    c["program-reference"] !== program.id ||
    e["program-reference"] !== program.id
  )
    return result("mismatch", "证据或控制项不属于所选项目。");
  if (
    l &&
    (ref(l.program) !== program.id ||
      ref(l.control) !== control.id ||
      ref(l.evidence) !== evidence.id ||
      l["program-reference"] !== program.id ||
      l["control-reference"] !== control.id ||
      l["evidence-reference"] !== evidence.id)
  )
    return result("mismatch", "证据映射的真实关系与精确索引不一致。");
  if (
    c["framework-version"] !== p["framework-version"] ||
    e["framework-version"] !== p["framework-version"] ||
    Number(e["scope-version"]) !== Number(p["scope-version"])
  )
    return result("mismatch", "框架或范围版本不匹配，需重新确认适用性。");
  if (
    e["scope-reference"] !== p["scope-reference"] ||
    !lines(p.accounts).includes(e.account) ||
    !lines(p.regions).includes(e.region) ||
    !e["resource-key"] ||
    !e["check-id"] ||
    !e["requirement-key"]
  )
    return result("mismatch", "证据账户、区域、资源维度或授权范围与项目不匹配。");
  const requirements = lines(c["evidence-requirements"] || c["mapped-checks"]);
  if (!requirements.includes(e["requirement-key"])) return result("mismatch", "此证据未声明控制所需的有效支撑维度。");
  if (e["technical-result"] === "fail") return result("fail", "来源仍记录技术失败；风险接受不能改变原结果。");
  if (e["retention-until"] && (!iso(e["retention-until"]) || Date.parse(e["retention-until"]) <= Date.parse(now)))
    return result("expired", "证据已到复核/有效截止时间。");
  if (
    !iso(e["observed-at"]) ||
    !iso(e["collected-at"]) ||
    !/^[a-f0-9]{64}$/.test(e.sha256 || "") ||
    !e["source-locator"]
  )
    return result("insufficient", "缺少可靠来源、时间或完整性信息。");
  if (Date.parse(e["collected-at"]) < Date.parse(e["observed-at"]) || Date.parse(e["collected-at"]) > Date.parse(now))
    return result("insufficient", "采集时间须晚于观察且不得在未来。");
  if (Date.parse(e["observed-at"]) > Date.parse(now))
    return result("insufficient", "证据观察时间在未来，需核对时钟和来源。");
  if (l?.["review-state"] === "rejected") return result("rejected", "此映射已被人工拒绝。");
  if (e["technical-result"] === "unknown") return result("insufficient", "技术结果未知，尚不能支撑控制有效。");
  if (p["assessment-type"] === "period" && c["coverage-mode"] === "period") {
    if (e["evidence-mode"] !== "period") return result("insufficient", "当前快照不能证明期间持续运行。");
    if (
      !iso(e["coverage-start"]) ||
      !iso(e["coverage-end"]) ||
      Date.parse(e["coverage-start"]) > Date.parse(e["coverage-end"])
    )
      return result("insufficient", "期间证据缺少可靠覆盖区间。");
    if (Date.parse(e["coverage-end"]) > Date.parse(e["observed-at"]))
      return result("insufficient", "覆盖结束不得晚于来源观察时间。");
    if (Date.parse(e["coverage-end"]) > Date.parse(now))
      return result("insufficient", "证据宣称覆盖未来期间，不能接受。");
    if (
      Date.parse(e["coverage-start"]) > Date.parse(p["period-end"]) ||
      Date.parse(e["coverage-end"]) < Date.parse(p["period-start"])
    )
      return result("mismatch", "证据与所选期间没有交集。");
  } else if (Date.parse(e["observed-at"]) > Date.parse(p["period-end"]))
    return result("mismatch", "观察发生于声明时点之后，不能倒推历史状态。");
  if (
    !l ||
    l["review-state"] !== "accepted" ||
    !String(l["review-note"] || "").trim() ||
    !String(l.reviewer || "").trim()
  )
    return result("pending", "来源已保留，等待此控制对应的人工适用性复核。");
  if (
    p["assessment-type"] === "period" &&
    c["coverage-mode"] === "period" &&
    (Date.parse(e["coverage-start"]) > Date.parse(p["period-start"]) ||
      Date.parse(e["coverage-end"]) < Date.parse(p["period-end"]))
  )
    return result("partial", "此映射只覆盖部分期间；可与其他真实期间证据合并核对。");
  return result("supported", "在所声明范围内已获人工复核的证据；这不是审计意见。");
};

export const controlReadiness = (program, control, evidenceRows, links, now = new Date().toISOString()) => {
  if (!programReady(program)) return { state: "insufficient", reason: "项目范围尚未确认。", dimensions: [] };
  const related = links.filter(
    (link) => ref(link.fields.control) === control.id && link.fields["control-reference"] === control.id,
  );
  const evaluated = related.flatMap((link) => {
    const evidence = evidenceRows.find((row) => row.id === ref(link.fields.evidence));
    return evidence ? [{ evidence, ...evaluateEvidence(program, control, evidence, link, now) }] : [];
  });
  const scopeKey = (e) =>
    [e.account, e.region, e["resource-key"], e["check-id"], e["requirement-key"], e["scope-version"]].join("|");
  const activeFailures = evaluated.filter(
    (row) =>
      row.state === "fail" &&
      !evaluated.some(
        (later) =>
          later.state === "supported" &&
          row.evidence.fields["evidence-mode"] === "snapshot" &&
          later.evidence.fields["evidence-mode"] === "snapshot" &&
          later.evidence.fields["technical-result"] === "pass" &&
          scopeKey(later.evidence.fields) === scopeKey(row.evidence.fields) &&
          Date.parse(later.evidence.fields["observed-at"]) > Date.parse(row.evidence.fields["observed-at"]),
      ),
  );
  const requirements = lines(control.fields["evidence-requirements"] || control.fields["mapped-checks"]);
  const dimensions = requirements.map((key) => {
    const subset = evaluated.filter((row) => row.evidence.fields["requirement-key"] === key);
    if (activeFailures.some((row) => row.evidence.fields["requirement-key"] === key)) return { key, state: "fail" };
    if (subset.some((row) => row.state === "supported")) return { key, state: "supported" };
    const intervalScopes = new Map();
    for (const row of subset.filter((candidate) => candidate.state === "partial")) {
      const scope = scopeKey(row.evidence.fields);
      const intervals = intervalScopes.get(scope) || [];
      intervals.push([
        Date.parse(row.evidence.fields["coverage-start"]),
        Date.parse(row.evidence.fields["coverage-end"]),
      ]);
      intervalScopes.set(scope, intervals);
    }
    for (const periods of intervalScopes.values()) {
      periods.sort((a, b) => a[0] - b[0]);
      let end = Date.parse(program.fields["period-start"]);
      for (const [start, finish] of periods) {
        if (start > end) break;
        end = Math.max(end, finish);
      }
      if (periods.length && end >= Date.parse(program.fields["period-end"])) return { key, state: "supported" };
    }
    return {
      key,
      state:
        ["expired", "mismatch", "rejected", "partial", "pending", "insufficient"].find((state) =>
          subset.some((row) => row.state === state),
        ) || "missing",
    };
  });
  if (activeFailures.length)
    return { state: "fail", reason: "存在未被同资源、同检查的新复核证据取代的技术失败。", dimensions };
  if (control.fields["design-state"] !== "designed")
    return { state: "insufficient", reason: "控制实施方法尚未说明。", dimensions };
  if (dimensions.length && dimensions.every((row) => row.state === "supported"))
    return { state: "supported", reason: "每个已声明证据维度均有独立复核支撑；不构成审计意见。", dimensions };
  const missing = dimensions.filter((row) => row.state !== "supported");
  return {
    state: missing[0]?.state || "missing",
    reason: `仍需逐项补齐：${missing.map((row) => row.key).join("、") || "证据要求"}。单份快照或备份成功不代表完整控制就绪。`,
    dimensions,
  };
};

export const validateResolution = (program, control, issue, evidence, link, note, now) => {
  if (!String(note || "").trim()) throw new Error("RESOLUTION_REASON_REQUIRED");
  if (
    ref(issue.fields.program) !== program.id ||
    issue.fields["program-reference"] !== program.id ||
    ref(issue.fields.control) !== control.id
  )
    throw new Error("ISSUE_OUTSIDE_PROGRAM_CONTROL");
  for (const field of ["account", "region", "resource-key", "check-id"])
    if (issue.fields[field] && issue.fields[field] !== evidence.fields[field])
      throw new Error("VERIFICATION_RESOURCE_CHECK_SCOPE_MISMATCH");
  const result = evaluateEvidence(program, control, evidence, link, now);
  if (result.state !== "supported") throw new Error(`EVIDENCE_NOT_SUPPORTING: ${result.reason}`);
  if (
    issue.fields["verification-after"] &&
    Date.parse(evidence.fields["observed-at"]) <= Date.parse(issue.fields["verification-after"])
  )
    throw new Error("VERIFICATION_REQUIRES_NEWER_EVIDENCE");
  return result;
};
