import { appConfig } from "../config.js";

const row = (key, suffix, fields) => ({
  id: `rec${key}${suffix}00000000000`,
  baseId: `bse${key}000000000000`,
  headCommitId: `cmtdemo${suffix}000000000`,
  baseKey: key,
  fields,
});
const hosts = [
  row("hosts", "web", {
    title: "生产 Web · Singapore",
    "ssh-alias": "prod-web-sg",
    role: "Nginx / 客户门户",
    environment: "production",
    summary: "suspicious",
    "last-checked-at": "2026-10-26T06:25:00Z",
    "is-example": true,
  }),
  row("hosts", "api", {
    title: "生产 API · Tokyo",
    "ssh-alias": "prod-api-jp",
    role: "应用服务 / Ubuntu",
    environment: "production",
    summary: "insufficient-evidence",
    "last-checked-at": "2026-10-26T06:21:00Z",
    "is-example": true,
  }),
  row("hosts", "db", {
    title: "数据服务 · Taipei",
    "ssh-alias": "prod-db-tw",
    role: "PostgreSQL / 内网",
    environment: "production",
    summary: "unassessed",
    "is-example": true,
  }),
];
const runs = hosts.map((host, index) =>
  row("runs", String(index), {
    title: `${host.fields.title} · 10/26 核查`,
    host: host.id,
    "scope-reference": "演示调查范围",
    "window-start": "2026-10-19T00:00:00Z",
    "window-end": "2026-10-26T07:00:00Z",
    "check-profile": "intrusion-triage",
    "batch-reference": "demo-batch",
    status: index === 2 ? "requested" : "partial",
    "requested-at": "2026-10-26T06:00:00Z",
    "heartbeat-at": "2026-10-26T06:25:00Z",
    "coverage-summary":
      index === 0 ? "既有 audit 日志缺失；部分文件日志为尾部样本。" : "当前账号不能读取完整系统 journal。",
    "is-example": true,
  }),
);
const checks = runs.slice(0, 2).flatMap((run, hostIndex) =>
  appConfig.checks.map((check, index) =>
    row("checks", `${hostIndex}x${index}`, {
      title: check.name,
      run: run.id,
      "check-id": check.id,
      attempt: 1,
      status: index === 5 ? "missing-data" : hostIndex === 1 && index === 3 ? "permission-denied" : "completed",
      conclusion:
        index === 5 || (hostIndex === 1 && index === 3)
          ? "insufficient-evidence"
          : hostIndex === 0 && [1, 3, 4, 8].includes(index)
            ? "suspicious"
            : "no-indicators",
      "observed-at": "2026-10-26T06:25:00Z",
      "coverage-note":
        index === 5
          ? "auditd 历史日志不存在，无法追溯旧命令。"
          : hostIndex === 1 && index === 3
            ? "当前账号无权限读取完整 journal。"
            : "",
      summary:
        index === 8 && !hostIndex
          ? "发现自定义服务从 /tmp/.cache 执行，需要业务确认与后续取证。"
          : "检查结果只适用于本次已覆盖数据，不能据此排除入侵。",
    }),
  ),
);
const webChecks = checks.filter((check) => check.fields.run === runs[0].id);
const evidence = [
  [
    3,
    "新的来源成功登录 root",
    "2026-10-25T02:14:08Z",
    "/var/log/auth.log:842",
    "sshd[8201]: Accepted publickey for root from 203.0.113.42 port 41822 ssh2",
  ],
  [
    4,
    "Web 攻击请求命中",
    "2026-10-25T02:15:10Z",
    "/var/log/nginx/access.log:1280",
    '203.0.113.42 - - [25/Oct/2026:02:15:10 +0000] "GET /api/search?q=[REDACTED] HTTP/1.1" 200 426',
  ],
  [
    1,
    "进程执行文件位于临时目录",
    "2026-10-26T06:20:00Z",
    "process-snapshot:24",
    "/proc/9312/exe -> /tmp/.cache/update-agent",
  ],
  [
    8,
    "自定义服务指向临时目录",
    "2026-10-26T06:25:00Z",
    "/etc/systemd/system/update-agent.service:7",
    "ExecStart=/tmp/.cache/update-agent --watch",
  ],
].map(([index, title, time, source, excerpt], i) =>
  row("evidence", String(i), {
    title,
    check: webChecks[index].id,
    "source-kind": "investigation",
    "source-locator": source,
    "event-time": time,
    "original-time": time,
    "time-confidence": "explicit-offset",
    "collected-at": "2026-10-26T06:25:00Z",
    sha256: "f".repeat(64),
    "redacted-excerpt": excerpt,
    "redaction-note": "演示样本；哈希与 IP 均为合成数据。",
  }),
);
const findings = [
  row("findings", "service", {
    title: "systemd 服务从临时目录执行",
    run: runs[0].id,
    evidence: [evidence[2].id, evidence[3].id],
    severity: "high",
    conclusion: "suspicious",
    verdict: "needs-review",
    reasoning: "当前进程路径与自定义服务的 ExecStart 均指向 /tmp/.cache/update-agent。",
    limitations: "尚未核实是否为已授权的部署任务；本机痕迹可能被篡改。",
    "next-step": "请业务负责人核对服务用途，保全执行文件并与可信发布产物比较。",
  }),
  row("findings", "access", {
    title: "核对异常来源登录与 Web 请求",
    run: runs[0].id,
    evidence: [evidence[0].id, evidence[1].id],
    severity: "medium",
    conclusion: "suspicious",
    verdict: "needs-review",
    reasoning: "同一来源出现成功 SSH 登录和攻击样式请求，时间接近。",
    limitations: "相近时间不是因果证明；HTTP 200 不代表漏洞利用成功。",
    "next-step": "核对 SSH 公钥和操作人，结合应用审计及独立网络记录补证。",
  }),
];
const settings = [
  row("settings", "config", {
    title: "核查配置",
    operator: "值班响应人",
    "scope-note": "演示调查范围",
    "onboarding-version": 1,
    "onboarding-state": "complete",
    "execution-mode": "local-agent",
    "evidence-policy": "原始证据留在本机受限目录；Busabase 只保存脱敏摘要和索引。",
  }),
];
const data = { hosts, runs, checks, evidence, findings, settings };
for (const row of [...checks, ...findings]) row.fields["run-reference"] = row.fields.run;
for (const row of evidence) row.fields["check-reference"] = row.fields.check;
const matches = (record, filters = []) =>
  filters.every((filter) =>
    filter.any
      ? filter.any.some((item) => matches(record, [item]))
      : filter.operator === "eq" &&
        (Array.isArray(record.fields[filter.fieldSlug])
          ? record.fields[filter.fieldSlug].includes(filter.value)
          : record.fields[filter.fieldSlug] === filter.value),
  );
let sequence = 0;

export const demoProvider = {
  name: "demo",
  ready: async () => ({ ok: true }),
  page: async (key, { cursor = null, valueFilters } = {}) => {
    const rows = data[key].filter((record) => matches(record, valueFilters));
    const offset = Number(cursor || 0);
    return structuredClone({
      records: rows.slice(offset, offset + 50),
      nextCursor: rows.length > offset + 50 ? String(offset + 50) : null,
    });
  },
  get: async (key, id) => {
    const found = data[key].find((record) => record.id === id);
    if (!found) throw new Error("RECORD_NOT_FOUND");
    return structuredClone(found);
  },
  summary: async () => ({
    hosts: data.hosts.length,
    evidence: data.evidence.length,
    running: data.runs.filter((record) => record.fields.status === "running").length,
    gaps: data.checks.filter((record) => record.fields.conclusion === "insufficient-evidence").length,
    attention: data.findings.filter((record) => record.fields.verdict === "needs-review").length,
  }),
  pending: async () => ({ count: 0, nextCursor: null }),
  async create(key, fields) {
    const record = row(key, `new${sequence++}`, { ...fields, ...(key === "hosts" ? { "is-example": true } : {}) });
    data[key].unshift(record);
    return { status: "saved", recordId: record.id };
  },
  async update(key, record, fields) {
    const found = data[key].find((item) => item.id === record.id);
    if (!found || found.headCommitId !== record.headCommitId) throw new Error("RECORD_CONFLICT");
    found.fields = { ...found.fields, ...fields };
    found.headCommitId = `cmtdemochange${sequence++}`;
    return { status: "saved", recordId: found.id };
  },
};
