export const appConfig = {
  appId: "kelly-security",
  appName: "Kelly Security",
  schemaVersion: 2,
  binding: "runtime",
  readOnly: false,
  locale: "zh-CN",
  folder: {
    name: "Kelly Security",
    slug: "kelly-security",
    description: "由本机 Agent 经 SSH 核查 Linux 入侵证据，在 Busabase 中复核多服务器检查清单、证据和时间线。",
  },
  airApp: {
    slug: "kelly-security-app",
    name: "Linux 入侵核查台",
    description: "由本机 Agent 经 SSH 核查 Linux 入侵证据，在 Busabase 中复核多服务器检查清单、证据和时间线。",
    resourceKey: "kelly-security-app",
  },
  bases: [
    {
      key: "hosts",
      name: "服务器",
      slug: "kelly-security-hosts",
      description: "服务器：仅保存本工作台的数据。",
      fields: [
        {
          slug: "title",
          name: "名称",
          type: "text",
          required: true,
        },
        {
          slug: "ssh-alias",
          name: "本机 SSH 别名",
          type: "text",
          required: true,
        },
        {
          slug: "role",
          name: "业务角色",
          type: "text",
          required: false,
        },
        {
          slug: "environment",
          name: "环境",
          type: "select",
          required: false,
          options: {
            choices: [
              {
                id: "production",
                name: "生产",
              },
              {
                id: "staging",
                name: "预发布",
              },
              {
                id: "lab",
                name: "实验室",
              },
            ],
          },
        },
        {
          slug: "scope-note",
          name: "授权说明",
          type: "longtext",
          required: false,
        },
        {
          slug: "expected-fingerprint",
          name: "已独立核实的 SSH 指纹",
          type: "text",
          required: false,
        },
        {
          slug: "last-checked-at",
          name: "最近检查时间",
          type: "date",
          required: false,
        },
        {
          slug: "summary",
          name: "最近结论",
          type: "select",
          required: false,
          options: {
            choices: [
              {
                id: "unassessed",
                name: "未评估",
              },
              {
                id: "no-indicators",
                name: "未发现异常",
              },
              {
                id: "suspicious",
                name: "可疑",
              },
              {
                id: "confirmed-malicious",
                name: "确认恶意",
              },
              {
                id: "explained-benign",
                name: "已解释为正常",
              },
              {
                id: "insufficient-evidence",
                name: "证据不足",
              },
            ],
          },
        },
        {
          slug: "is-example",
          name: "示例记录",
          type: "checkbox",
          required: false,
        },
      ],
      agentPrompts: [
        {
          key: "scenario-1",
          label: "加入我指定的 SSH 别名，不连接其他机器。",
          body: "阅读此文件夹中的 kelly-security skill 并遵循其流程。加入我指定的 SSH 别名，不连接其他机器。",
          intent: "change",
        },
        {
          key: "scenario-2",
          label: "比较这些服务器还有哪些证据没有查清。",
          body: "阅读此文件夹中的 kelly-security skill 并遵循其流程。比较这些服务器还有哪些证据没有查清。",
          intent: "read-only",
        },
      ],
      readLimit: 50,
      views: [
        {
          key: "hosts-main",
          name: "服务器",
          type: "table",
          config: {},
        },
      ],
    },
    {
      key: "runs",
      name: "检查任务",
      slug: "kelly-security-runs",
      description: "检查任务：仅保存本工作台的数据。",
      fields: [
        {
          slug: "title",
          name: "名称",
          type: "text",
          required: true,
        },
        {
          slug: "scope-reference",
          name: "当前会话授权引用",
          type: "text",
          required: true,
        },
        {
          slug: "window-start",
          name: "调查开始时间",
          type: "date",
          required: true,
        },
        {
          slug: "window-end",
          name: "调查结束时间",
          type: "date",
          required: true,
        },
        {
          slug: "check-profile",
          name: "检查包",
          type: "text",
          required: true,
        },
        {
          slug: "status",
          name: "执行状态",
          type: "select",
          required: true,
          options: {
            choices: [
              {
                id: "requested",
                name: "等待本机 Agent",
              },
              {
                id: "running",
                name: "执行中",
              },
              {
                id: "completed",
                name: "已完成",
              },
              {
                id: "partial",
                name: "部分完成",
              },
              {
                id: "failed",
                name: "失败",
              },
              {
                id: "cancelled",
                name: "已取消",
              },
            ],
          },
        },
        {
          slug: "requested-at",
          name: "请求时间",
          type: "date",
          required: false,
        },
        {
          slug: "started-at",
          name: "开始时间",
          type: "date",
          required: false,
        },
        {
          slug: "finished-at",
          name: "结束时间",
          type: "date",
          required: false,
        },
        {
          slug: "runner-id",
          name: "本机 Agent 标识",
          type: "text",
          required: false,
        },
        {
          slug: "heartbeat-at",
          name: "最近心跳",
          type: "date",
          required: false,
        },
        {
          slug: "claim-reference",
          name: "领取与幂等引用",
          type: "text",
          required: false,
        },
        {
          slug: "coverage-summary",
          name: "覆盖和缺口",
          type: "longtext",
          required: false,
        },
        {
          slug: "analyst-summary",
          name: "调查摘要",
          type: "longtext",
          required: false,
        },
        {
          slug: "is-example",
          name: "示例记录",
          type: "checkbox",
          required: false,
        },
        {
          slug: "batch-reference",
          name: "本次多服务器批次",
          type: "text",
          required: false,
        },
        {
          slug: "host",
          name: "服务器",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-security-hosts",
            allowMultiple: false,
          },
        },
      ],
      agentPrompts: [
        {
          key: "scenario-1",
          label: "核查当前授权的这台服务器是否有入侵证据。",
          body: "阅读此文件夹中的 kelly-security skill 并遵循其流程。核查当前授权的这台服务器是否有入侵证据。",
          intent: "change",
        },
        {
          key: "scenario-2",
          label: "解释这次检查为什么中断或仍在等待本机 Agent。",
          body: "阅读此文件夹中的 kelly-security skill 并遵循其流程。解释这次检查为什么中断或仍在等待本机 Agent。",
          intent: "read-only",
        },
      ],
      readLimit: 50,
      views: [
        {
          key: "runs-main",
          name: "检查任务",
          type: "table",
          config: {},
        },
      ],
    },
    {
      key: "checks",
      name: "检查项",
      slug: "kelly-security-checks",
      description: "检查项：仅保存本工作台的数据。",
      fields: [
        {
          slug: "title",
          name: "名称",
          type: "text",
          required: true,
        },
        {
          slug: "check-id",
          name: "固定检查配方标识",
          type: "text",
          required: true,
        },
        {
          slug: "attempt",
          name: "尝试序号",
          type: "number",
          required: true,
        },
        {
          slug: "status",
          name: "采集状态",
          type: "select",
          required: true,
          options: {
            choices: [
              {
                id: "pending",
                name: "未开始",
              },
              {
                id: "running",
                name: "执行中",
              },
              {
                id: "completed",
                name: "完成",
              },
              {
                id: "permission-denied",
                name: "无权限",
              },
              {
                id: "not-applicable",
                name: "不适用",
              },
              {
                id: "missing-data",
                name: "数据缺失",
              },
              {
                id: "failed",
                name: "失败",
              },
              {
                id: "cancelled",
                name: "已取消",
              },
            ],
          },
        },
        {
          slug: "conclusion",
          name: "分析结论",
          type: "select",
          required: true,
          options: {
            choices: [
              {
                id: "unassessed",
                name: "未评估",
              },
              {
                id: "no-indicators",
                name: "未发现异常",
              },
              {
                id: "suspicious",
                name: "可疑",
              },
              {
                id: "confirmed-malicious",
                name: "确认恶意",
              },
              {
                id: "explained-benign",
                name: "已解释为正常",
              },
              {
                id: "insufficient-evidence",
                name: "证据不足",
              },
            ],
          },
        },
        {
          slug: "observed-at",
          name: "采集时间",
          type: "date",
          required: false,
        },
        {
          slug: "coverage-start",
          name: "证据起始时间",
          type: "date",
          required: false,
        },
        {
          slug: "coverage-end",
          name: "证据结束时间",
          type: "date",
          required: false,
        },
        {
          slug: "coverage-note",
          name: "范围、截断和权限缺口",
          type: "longtext",
          required: false,
        },
        {
          slug: "command-reference",
          name: "已审核配方与版本",
          type: "text",
          required: false,
        },
        {
          slug: "exit-code",
          name: "退出状态",
          type: "number",
          required: false,
        },
        {
          slug: "summary",
          name: "脱敏摘要",
          type: "longtext",
          required: false,
        },
        {
          slug: "is-example",
          name: "示例记录",
          type: "checkbox",
          required: false,
        },
        {
          slug: "record-key",
          name: "幂等业务键",
          type: "text",
          required: true,
        },
        {
          slug: "run-reference",
          name: "检查任务精确索引",
          type: "text",
          required: true,
        },
        {
          slug: "run",
          name: "检查任务",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-security-runs",
            allowMultiple: false,
          },
        },
      ],
      agentPrompts: [
        {
          key: "scenario-1",
          label: "解释这项检查查到了什么、还有什么没有覆盖。",
          body: "阅读此文件夹中的 kelly-security skill 并遵循其流程。解释这项检查查到了什么、还有什么没有覆盖。",
          intent: "change",
        },
        {
          key: "scenario-2",
          label: "为这项无权限或缺失日志的检查列出补证方式。",
          body: "阅读此文件夹中的 kelly-security skill 并遵循其流程。为这项无权限或缺失日志的检查列出补证方式。",
          intent: "read-only",
        },
      ],
      readLimit: 50,
      views: [
        {
          key: "checks-main",
          name: "检查项",
          type: "table",
          config: {},
        },
      ],
    },
    {
      key: "evidence",
      name: "证据",
      slug: "kelly-security-evidence",
      description: "证据：仅保存本工作台的数据。",
      fields: [
        {
          slug: "title",
          name: "名称",
          type: "text",
          required: true,
        },
        {
          slug: "source-kind",
          name: "来源类型",
          type: "text",
          required: true,
        },
        {
          slug: "source-locator",
          name: "来源路径、行号或事件编号",
          type: "text",
          required: true,
        },
        {
          slug: "original-time",
          name: "来源原始时间",
          type: "text",
          required: false,
        },
        {
          slug: "event-time",
          name: "标准化事件时间",
          type: "date",
          required: false,
        },
        {
          slug: "time-confidence",
          name: "时区或年份不确定性",
          type: "text",
          required: false,
        },
        {
          slug: "collected-at",
          name: "采集时间",
          type: "date",
          required: true,
        },
        {
          slug: "sha256",
          name: "本机取证产物 SHA-256",
          type: "text",
          required: true,
        },
        {
          slug: "artifact-reference",
          name: "本机受限证据引用",
          type: "text",
          required: false,
        },
        {
          slug: "redacted-excerpt",
          name: "脱敏证据摘要",
          type: "longtext",
          required: false,
        },
        {
          slug: "redaction-note",
          name: "脱敏与完整性说明",
          type: "longtext",
          required: false,
        },
        {
          slug: "is-example",
          name: "示例记录",
          type: "checkbox",
          required: false,
        },
        {
          slug: "record-key",
          name: "幂等业务键",
          type: "text",
          required: true,
        },
        {
          slug: "check-reference",
          name: "检查项精确索引",
          type: "text",
          required: true,
        },
        {
          slug: "check",
          name: "来源检查项",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-security-checks",
            allowMultiple: false,
          },
        },
      ],
      agentPrompts: [
        {
          key: "scenario-1",
          label: "把此次核查的相关证据按时间排列，保留不确定性。",
          body: "阅读此文件夹中的 kelly-security skill 并遵循其流程。把此次核查的相关证据按时间排列，保留不确定性。",
          intent: "change",
        },
        {
          key: "scenario-2",
          label: "检查指定取证产物的来源和哈希是否完整。",
          body: "阅读此文件夹中的 kelly-security skill 并遵循其流程。检查指定取证产物的来源和哈希是否完整。",
          intent: "read-only",
        },
      ],
      readLimit: 50,
      views: [
        {
          key: "evidence-main",
          name: "证据",
          type: "table",
          config: {},
        },
      ],
    },
    {
      key: "findings",
      name: "发现与复核",
      slug: "kelly-security-findings",
      description: "发现与复核：仅保存本工作台的数据。",
      fields: [
        {
          slug: "title",
          name: "名称",
          type: "text",
          required: true,
        },
        {
          slug: "severity",
          name: "优先级",
          type: "select",
          required: true,
          options: {
            choices: [
              {
                id: "critical",
                name: "紧急",
              },
              {
                id: "high",
                name: "高",
              },
              {
                id: "medium",
                name: "中",
              },
              {
                id: "low",
                name: "低",
              },
              {
                id: "informational",
                name: "信息",
              },
            ],
          },
        },
        {
          slug: "conclusion",
          name: "分析结论",
          type: "select",
          required: true,
          options: {
            choices: [
              {
                id: "unassessed",
                name: "未评估",
              },
              {
                id: "no-indicators",
                name: "未发现异常",
              },
              {
                id: "suspicious",
                name: "可疑",
              },
              {
                id: "confirmed-malicious",
                name: "确认恶意",
              },
              {
                id: "explained-benign",
                name: "已解释为正常",
              },
              {
                id: "insufficient-evidence",
                name: "证据不足",
              },
            ],
          },
        },
        {
          slug: "reasoning",
          name: "判断依据与其他解释",
          type: "longtext",
          required: true,
        },
        {
          slug: "limitations",
          name: "信任限制与证据缺口",
          type: "longtext",
          required: false,
        },
        {
          slug: "next-step",
          name: "补证或处置建议",
          type: "longtext",
          required: false,
        },
        {
          slug: "verdict",
          name: "人工复核",
          type: "select",
          required: true,
          options: {
            choices: [
              {
                id: "needs-review",
                name: "待复核",
              },
              {
                id: "confirmed-malicious",
                name: "确认恶意",
              },
              {
                id: "explained-benign",
                name: "已解释为正常",
              },
              {
                id: "needs-investigation",
                name: "仍需调查",
              },
            ],
          },
        },
        {
          slug: "review-note",
          name: "复核理由",
          type: "longtext",
          required: false,
        },
        {
          slug: "reviewed-at",
          name: "复核时间",
          type: "date",
          required: false,
        },
        {
          slug: "is-example",
          name: "示例记录",
          type: "checkbox",
          required: false,
        },
        {
          slug: "record-key",
          name: "幂等业务键",
          type: "text",
          required: true,
        },
        {
          slug: "run-reference",
          name: "检查任务精确索引",
          type: "text",
          required: true,
        },
        {
          slug: "run",
          name: "检查任务",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-security-runs",
            allowMultiple: false,
          },
        },
        {
          slug: "evidence",
          name: "证据引用",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-security-evidence",
            allowMultiple: true,
          },
        },
      ],
      agentPrompts: [
        {
          key: "scenario-1",
          label: "判断此发现是否足以支持入侵结论，并给出证据。",
          body: "阅读此文件夹中的 kelly-security skill 并遵循其流程。判断此发现是否足以支持入侵结论，并给出证据。",
          intent: "change",
        },
        {
          key: "scenario-2",
          label: "根据新证据修订结论，保留原来的判断与复核理由。",
          body: "阅读此文件夹中的 kelly-security skill 并遵循其流程。根据新证据修订结论，保留原来的判断与复核理由。",
          intent: "read-only",
        },
      ],
      readLimit: 50,
      views: [
        {
          key: "findings-main",
          name: "发现与复核",
          type: "table",
          config: {},
        },
      ],
    },
    {
      key: "settings",
      name: "工作台设置",
      slug: "kelly-security-settings",
      description: "工作台设置：仅保存本工作台的数据。",
      fields: [
        {
          slug: "title",
          name: "名称",
          type: "text",
          required: true,
        },
        {
          slug: "onboarding-version",
          name: "配置版本",
          type: "number",
          required: true,
        },
        {
          slug: "onboarding-state",
          name: "配置状态",
          type: "select",
          required: true,
          options: {
            choices: [
              {
                id: "incomplete",
                name: "未完成",
              },
              {
                id: "needs-review",
                name: "需复核",
              },
              {
                id: "complete",
                name: "完成",
              },
            ],
          },
        },
        {
          slug: "onboarding-completed-at",
          name: "配置完成时间",
          type: "date",
          required: false,
        },
        {
          slug: "operator",
          name: "调查负责人",
          type: "text",
          required: false,
        },
        {
          slug: "scope-note",
          name: "调查授权说明",
          type: "longtext",
          required: false,
        },
        {
          slug: "execution-mode",
          name: "执行方式：本机 Agent",
          type: "text",
          required: false,
        },
        {
          slug: "evidence-policy",
          name: "证据存储与上传策略",
          type: "longtext",
          required: false,
        },
        {
          slug: "is-example",
          name: "示例记录",
          type: "checkbox",
          required: false,
        },
      ],
      agentPrompts: [
        {
          key: "scenario-1",
          label: "确认这次核查的授权、执行方式和证据存储边界。",
          body: "阅读此文件夹中的 kelly-security skill 并遵循其流程。确认这次核查的授权、执行方式和证据存储边界。",
          intent: "change",
        },
        {
          key: "scenario-2",
          label: "解释本机 SSH 身份与 Busabase 数据的职责。",
          body: "阅读此文件夹中的 kelly-security skill 并遵循其流程。解释本机 SSH 身份与 Busabase 数据的职责。",
          intent: "read-only",
        },
      ],
      readLimit: 50,
      views: [
        {
          key: "settings-main",
          name: "工作台设置",
          type: "table",
          config: {},
        },
      ],
    },
  ],
  drive: {
    slug: "kelly-security-files",
    name: "脱敏核查报告",
  },
  onboarding: {
    version: 1,
    required_fields: [
      {
        key: "investigation-owner",
        resource: "settings",
        validation: "调查负责人和当前授权说明非空；示例主机不能作为可执行目标。",
        unlocks: ["request-investigation"],
      },
      {
        key: "ssh-target-scope",
        resource: "hosts",
        validation: "当前会话明确允许的 SSH 别名；不能以数据库记录代替授权；连接时使用可信 known_hosts。",
        unlocks: ["local-ssh-collection"],
      },
      {
        key: "investigation-window",
        resource: "runs",
        validation: "有明确时区的开始和结束时间，开始早于结束；覆盖不足显式列出。",
        unlocks: ["log-analysis"],
      },
      {
        key: "evidence-handling",
        resource: "settings",
        validation: "本机受限原始证据和 Busabase 脱敏索引的规则已确认；不自动上传原始日志。",
        unlocks: ["evidence-publication"],
      },
    ],
    completion_resource: "settings",
  },
  permissions: {
    read_procedures: [
      "nodes.get",
      "nodes.list",
      "bases.listViews",
      "records.list",
      "records.listPage",
      "records.get",
      "records.count",
      "records.groupBy",
      "changeRequests.list",
    ],
    change_request_procedures: ["records.changeRequest", "bases.createChangeRequest"],
  },
  checks: [
    {
      id: "collection-context",
      name: "主机与采集上下文",
      kind: "context",
    },
    {
      id: "live-processes",
      name: "运行进程与执行文件",
      kind: "process",
    },
    {
      id: "live-connections",
      name: "监听端口与当前连接",
      kind: "network",
    },
    {
      id: "ssh-authentication",
      name: "SSH 登录与认证",
      kind: "authentication",
    },
    {
      id: "web-access-and-errors",
      name: "Web 访问与错误日志",
      kind: "web",
    },
    {
      id: "existing-audit-events",
      name: "既有审计与命令执行记录",
      kind: "audit",
    },
    {
      id: "accounts-and-privileges",
      name: "账号与权限变更",
      kind: "accounts",
    },
    {
      id: "cron-and-at",
      name: "cron / at 持久化",
      kind: "persistence",
    },
    {
      id: "systemd-services-and-timers",
      name: "systemd 服务与定时器",
      kind: "persistence",
    },
    {
      id: "ssh-profile-pam-preload",
      name: "SSH、公钥与认证持久化",
      kind: "persistence",
    },
    {
      id: "suspicious-files-and-existing-integrity",
      name: "可疑文件与完整性线索",
      kind: "files",
    },
    {
      id: "coverage-and-timeline",
      name: "日志覆盖与系统时间线",
      kind: "coverage",
    },
  ],
};
