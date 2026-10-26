export const appConfig = {
  appId: "kelly-appsec",
  appName: "Kelly AppSec",
  schemaVersion: 1,
  binding: "runtime",
  readOnly: false,
  locale: "zh-CN",
  folder: {
    name: "Kelly AppSec",
    slug: "kelly-appsec",
    description: "按项目、角色和业务规则审计应用与 API，并追踪证据及精确版本复测。",
  },
  airApp: {
    slug: "kelly-appsec-app",
    name: "应用与 API 安全审计台",
    description: "接口权限矩阵、业务规则、发现与修复复测。",
    resourceKey: "kelly-appsec-app",
  },
  drive: {
    slug: "kelly-appsec-files",
    name: "AppSec 报告与证据",
  },
  bases: [
    {
      key: "projects",
      name: "项目",
      slug: "kelly-appsec-projects",
      description: "项目，仅属于当前 AppSec 工作台。",
      readLimit: 50,
      fields: [
        {
          slug: "title",
          name: "名称",
          type: "text",
          required: true,
        },
        {
          slug: "owner",
          name: "负责人",
          type: "text",
          required: false,
        },
        {
          slug: "repository-reference",
          name: "仓库引用",
          type: "text",
          required: false,
        },
        {
          slug: "source-revision",
          name: "源码/部署版本",
          type: "text",
          required: true,
        },
        {
          slug: "environment",
          name: "声明环境",
          type: "text",
          required: true,
        },
        {
          slug: "origin",
          name: "测试 Origin",
          type: "url",
          required: false,
        },
        {
          slug: "scope-note",
          name: "授权与业务边界",
          type: "longtext",
          required: false,
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
                name: "待配置",
              },
              {
                id: "complete",
                name: "已配置",
              },
            ],
          },
        },
        {
          slug: "is-example",
          name: "示例项目",
          type: "checkbox",
          required: false,
        },
      ],
      views: [
        {
          key: "projects-main",
          name: "项目",
          type: "table",
          config: {},
        },
      ],
      agentPrompts: [
        {
          key: "scenario-1",
          label: "登记我指定的应用项目和审计范围。",
          body: "阅读此文件夹中的 kelly-appsec skill。登记我指定的应用项目和审计范围。",
          intent: "change",
        },
        {
          key: "scenario-2",
          label: "说明当前项目哪些身份、流程和版本还没有覆盖。",
          body: "阅读此文件夹中的 kelly-appsec skill。说明当前项目哪些身份、流程和版本还没有覆盖。",
          intent: "read-only",
        },
      ],
    },
    {
      key: "endpoints",
      name: "接口清单",
      slug: "kelly-appsec-endpoints",
      description: "接口清单，仅属于当前 AppSec 工作台。",
      readLimit: 50,
      fields: [
        {
          slug: "title",
          name: "名称",
          type: "text",
          required: true,
        },
        {
          slug: "record-key",
          name: "幂等接口键",
          type: "text",
          required: true,
        },
        {
          slug: "project-reference",
          name: "项目精确索引",
          type: "text",
          required: true,
        },
        {
          slug: "source-revision",
          name: "来源版本",
          type: "text",
          required: true,
        },
        {
          slug: "method",
          name: "HTTP 方法",
          type: "text",
          required: true,
        },
        {
          slug: "path",
          name: "接口路径",
          type: "text",
          required: true,
        },
        {
          slug: "operation-id",
          name: "操作标识",
          type: "text",
          required: false,
        },
        {
          slug: "business-flow",
          name: "业务流程",
          type: "text",
          required: false,
        },
        {
          slug: "source-location",
          name: "文档/源码定位",
          type: "text",
          required: false,
        },
        {
          slug: "discovery",
          name: "来源状态",
          type: "select",
          required: true,
          options: {
            choices: [
              {
                id: "documented",
                name: "已提供文档",
              },
              {
                id: "source",
                name: "已审查源码",
              },
              {
                id: "manual",
                name: "手工登记",
              },
            ],
          },
        },
        {
          slug: "project",
          name: "项目",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-appsec-projects",
            allowMultiple: false,
          },
        },
      ],
      views: [
        {
          key: "endpoints-main",
          name: "接口清单",
          type: "table",
          config: {},
        },
      ],
      agentPrompts: [
        {
          key: "scenario-1",
          label: "导入指定版本的 OpenAPI 接口，保留来源和未覆盖入口。",
          body: "阅读此文件夹中的 kelly-appsec skill。导入指定版本的 OpenAPI 接口，保留来源和未覆盖入口。",
          intent: "change",
        },
        {
          key: "scenario-2",
          label: "按业务流程解释当前接口盘点的覆盖范围。",
          body: "阅读此文件夹中的 kelly-appsec skill。按业务流程解释当前接口盘点的覆盖范围。",
          intent: "read-only",
        },
      ],
    },
    {
      key: "rules",
      name: "业务与权限规则",
      slug: "kelly-appsec-rules",
      description: "业务与权限规则，仅属于当前 AppSec 工作台。",
      readLimit: 50,
      fields: [
        {
          slug: "title",
          name: "名称",
          type: "text",
          required: true,
        },
        {
          slug: "record-key",
          name: "幂等规则键",
          type: "text",
          required: true,
        },
        {
          slug: "project-reference",
          name: "项目精确索引",
          type: "text",
          required: true,
        },
        {
          slug: "endpoint-reference",
          name: "接口精确索引",
          type: "text",
          required: true,
        },
        {
          slug: "source-revision",
          name: "规则适用版本",
          type: "text",
          required: true,
        },
        {
          slug: "identity",
          name: "本机身份引用",
          type: "text",
          required: true,
        },
        {
          slug: "expectation",
          name: "预期访问",
          type: "select",
          required: true,
          options: {
            choices: [
              {
                id: "allow",
                name: "应允许",
              },
              {
                id: "deny",
                name: "应拒绝",
              },
            ],
          },
        },
        {
          slug: "expected-statuses",
          name: "允许状态码",
          type: "longtext",
          required: true,
        },
        {
          slug: "assertions",
          name: "允许时的数据断言",
          type: "longtext",
          required: false,
        },
        {
          slug: "forbidden-assertions",
          name: "拒绝时不得泄露的数据断言",
          type: "longtext",
          required: false,
        },
        {
          slug: "object-id",
          name: "受控测试对象",
          type: "text",
          required: false,
        },
        {
          slug: "request-body",
          name: "受控请求体",
          type: "longtext",
          required: false,
        },
        {
          slug: "baseline-rule-key",
          name: "正向基线规则键",
          type: "text",
          required: false,
        },
        {
          slug: "mutating",
          name: "动作可能改变状态",
          type: "checkbox",
          required: false,
        },
        {
          slug: "policy-note",
          name: "业务规则与确认依据",
          type: "longtext",
          required: true,
        },
        {
          slug: "confirmed",
          name: "规则已经业务确认",
          type: "checkbox",
          required: false,
        },
        {
          slug: "project",
          name: "项目",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-appsec-projects",
            allowMultiple: false,
          },
        },
        {
          slug: "endpoint",
          name: "接口",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-appsec-endpoints",
            allowMultiple: false,
          },
        },
      ],
      views: [
        {
          key: "rules-main",
          name: "业务与权限规则",
          type: "table",
          config: {},
        },
      ],
      agentPrompts: [
        {
          key: "scenario-1",
          label: "为指定接口明确不同角色和租户的预期权限。",
          body: "阅读此文件夹中的 kelly-appsec skill。为指定接口明确不同角色和租户的预期权限。",
          intent: "change",
        },
        {
          key: "scenario-2",
          label: "检查公开分享、对象归属和字段规则是否已确认。",
          body: "阅读此文件夹中的 kelly-appsec skill。检查公开分享、对象归属和字段规则是否已确认。",
          intent: "read-only",
        },
      ],
    },
    {
      key: "runs",
      name: "审计与复测任务",
      slug: "kelly-appsec-runs",
      description: "审计与复测任务，仅属于当前 AppSec 工作台。",
      readLimit: 50,
      fields: [
        {
          slug: "title",
          name: "名称",
          type: "text",
          required: true,
        },
        {
          slug: "project-reference",
          name: "项目精确索引",
          type: "text",
          required: true,
        },
        {
          slug: "source-revision",
          name: "指定测试版本",
          type: "text",
          required: true,
        },
        {
          slug: "environment",
          name: "测试环境",
          type: "text",
          required: true,
        },
        {
          slug: "origin",
          name: "已授权 Origin",
          type: "url",
          required: true,
        },
        {
          slug: "scope-reference",
          name: "当前会话授权引用",
          type: "text",
          required: true,
        },
        {
          slug: "rule-snapshot",
          name: "显式规则与版本快照",
          type: "longtext",
          required: true,
        },
        {
          slug: "mode",
          name: "审计方式",
          type: "select",
          required: true,
          options: {
            choices: [
              {
                id: "dynamic",
                name: "受控 API 验证",
              },
              {
                id: "offline",
                name: "源码/离线复核",
              },
            ],
          },
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
                name: "有覆盖缺口",
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
          name: "完成时间",
          type: "date",
          required: false,
        },
        {
          slug: "runner-id",
          name: "执行器标识",
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
          name: "任务领取引用",
          type: "text",
          required: false,
        },
        {
          slug: "request-count",
          name: "实际请求数",
          type: "number",
          required: false,
        },
        {
          slug: "summary",
          name: "结果与缺口",
          type: "longtext",
          required: false,
        },
        {
          slug: "retest-finding-reference",
          name: "待复测发现引用",
          type: "text",
          required: false,
        },
        {
          slug: "project",
          name: "项目",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-appsec-projects",
            allowMultiple: false,
          },
        },
      ],
      views: [
        {
          key: "runs-main",
          name: "审计与复测任务",
          type: "table",
          config: {},
        },
      ],
      agentPrompts: [
        {
          key: "scenario-1",
          label: "在当前明确授权下验证选中的规则，记录结果和缺口。",
          body: "阅读此文件夹中的 kelly-appsec skill。在当前明确授权下验证选中的规则，记录结果和缺口。",
          intent: "change",
        },
        {
          key: "scenario-2",
          label: "说明中断任务如何恢复，或核对复测版本是否正确。",
          body: "阅读此文件夹中的 kelly-appsec skill。说明中断任务如何恢复，或核对复测版本是否正确。",
          intent: "read-only",
        },
      ],
    },
    {
      key: "checks",
      name: "逐项验证",
      slug: "kelly-appsec-checks",
      description: "逐项验证，仅属于当前 AppSec 工作台。",
      readLimit: 50,
      fields: [
        {
          slug: "title",
          name: "名称",
          type: "text",
          required: true,
        },
        {
          slug: "record-key",
          name: "幂等验证键",
          type: "text",
          required: true,
        },
        {
          slug: "project-reference",
          name: "项目精确索引",
          type: "text",
          required: true,
        },
        {
          slug: "run-reference",
          name: "任务精确索引",
          type: "text",
          required: true,
        },
        {
          slug: "endpoint-reference",
          name: "接口精确索引",
          type: "text",
          required: true,
        },
        {
          slug: "rule-reference",
          name: "规则精确索引",
          type: "text",
          required: true,
        },
        {
          slug: "source-revision",
          name: "测试版本",
          type: "text",
          required: true,
        },
        {
          slug: "identity",
          name: "测试身份引用",
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
                id: "running",
                name: "执行中",
              },
              {
                id: "completed",
                name: "完成",
              },
              {
                id: "failed",
                name: "失败",
              },
              {
                id: "cancelled",
                name: "取消",
              },
              {
                id: "missing-data",
                name: "缺前提",
              },
            ],
          },
        },
        {
          slug: "result",
          name: "规则结果",
          type: "select",
          required: true,
          options: {
            choices: [
              {
                id: "satisfied",
                name: "符合预期",
              },
              {
                id: "violated",
                name: "观察到规则违反",
              },
              {
                id: "inconclusive",
                name: "证据不足",
              },
              {
                id: "unverified",
                name: "未验证",
              },
            ],
          },
        },
        {
          slug: "http-status",
          name: "HTTP 状态",
          type: "number",
          required: false,
        },
        {
          slug: "observed-at",
          name: "采集时间",
          type: "date",
          required: false,
        },
        {
          slug: "summary",
          name: "判断与缺口",
          type: "longtext",
          required: false,
        },
        {
          slug: "policy-hash",
          name: "本次规则与端点指纹",
          type: "text",
          required: false,
        },
        {
          slug: "project",
          name: "项目",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-appsec-projects",
            allowMultiple: false,
          },
        },
        {
          slug: "run",
          name: "任务",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-appsec-runs",
            allowMultiple: false,
          },
        },
        {
          slug: "endpoint",
          name: "接口",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-appsec-endpoints",
            allowMultiple: false,
          },
        },
        {
          slug: "rule",
          name: "规则",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-appsec-rules",
            allowMultiple: false,
          },
        },
      ],
      views: [
        {
          key: "checks-main",
          name: "逐项验证",
          type: "table",
          config: {},
        },
      ],
      agentPrompts: [
        {
          key: "scenario-1",
          label: "解释此格验证了什么、没有验证什么。",
          body: "阅读此文件夹中的 kelly-appsec skill。解释此格验证了什么、没有验证什么。",
          intent: "change",
        },
        {
          key: "scenario-2",
          label: "关联正向基线、返回数据和对象归属复核结果。",
          body: "阅读此文件夹中的 kelly-appsec skill。关联正向基线、返回数据和对象归属复核结果。",
          intent: "read-only",
        },
      ],
    },
    {
      key: "findings",
      name: "发现与修复",
      slug: "kelly-appsec-findings",
      description: "发现与修复，仅属于当前 AppSec 工作台。",
      readLimit: 50,
      fields: [
        {
          slug: "title",
          name: "名称",
          type: "text",
          required: true,
        },
        {
          slug: "record-key",
          name: "幂等发现键",
          type: "text",
          required: true,
        },
        {
          slug: "project-reference",
          name: "项目精确索引",
          type: "text",
          required: true,
        },
        {
          slug: "run-reference",
          name: "任务精确索引",
          type: "text",
          required: true,
        },
        {
          slug: "check-reference",
          name: "验证精确索引",
          type: "text",
          required: true,
        },
        {
          slug: "source-revision",
          name: "发现版本",
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
                id: "policy-violation",
                name: "已观察到规则违反",
              },
              {
                id: "candidate",
                name: "源码/离线候选",
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
          name: "依据与影响",
          type: "longtext",
          required: true,
        },
        {
          slug: "limitations",
          name: "替代解释与限制",
          type: "longtext",
          required: false,
        },
        {
          slug: "recommendation",
          name: "修复建议",
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
                id: "confirmed-vulnerability",
                name: "确认缺陷",
              },
              {
                id: "explained-benign",
                name: "正常解释",
              },
              {
                id: "needs-investigation",
                name: "继续调查",
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
          slug: "owner",
          name: "修复负责人",
          type: "text",
          required: false,
        },
        {
          slug: "remediation",
          name: "修复状态",
          type: "select",
          required: true,
          options: {
            choices: [
              {
                id: "open",
                name: "待修复",
              },
              {
                id: "ready-for-retest",
                name: "待复测",
              },
              {
                id: "verified-fixed",
                name: "复测已验证修复",
              },
              {
                id: "reopened",
                name: "复测仍失败",
              },
            ],
          },
        },
        {
          slug: "fixed-revision",
          name: "拟修复版本",
          type: "text",
          required: false,
        },
        {
          slug: "retest-run-reference",
          name: "复测任务引用",
          type: "text",
          required: false,
        },
        {
          slug: "project",
          name: "项目",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-appsec-projects",
            allowMultiple: false,
          },
        },
        {
          slug: "run",
          name: "任务",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-appsec-runs",
            allowMultiple: false,
          },
        },
        {
          slug: "check",
          name: "验证",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-appsec-checks",
            allowMultiple: false,
          },
        },
      ],
      views: [
        {
          key: "findings-main",
          name: "发现与修复",
          type: "table",
          config: {},
        },
      ],
      agentPrompts: [
        {
          key: "scenario-1",
          label: "结合已记录的证据复核此问题并保存理由。",
          body: "阅读此文件夹中的 kelly-appsec skill。结合已记录的证据复核此问题并保存理由。",
          intent: "change",
        },
        {
          key: "scenario-2",
          label: "为指定修复版本请求复测，保留原有发现历史。",
          body: "阅读此文件夹中的 kelly-appsec skill。为指定修复版本请求复测，保留原有发现历史。",
          intent: "read-only",
        },
      ],
    },
    {
      key: "evidence",
      name: "证据",
      slug: "kelly-appsec-evidence",
      description: "证据，仅属于当前 AppSec 工作台。",
      readLimit: 50,
      fields: [
        {
          slug: "title",
          name: "名称",
          type: "text",
          required: true,
        },
        {
          slug: "record-key",
          name: "幂等证据键",
          type: "text",
          required: true,
        },
        {
          slug: "project-reference",
          name: "项目精确索引",
          type: "text",
          required: true,
        },
        {
          slug: "run-reference",
          name: "任务精确索引",
          type: "text",
          required: true,
        },
        {
          slug: "check-reference",
          name: "验证精确索引",
          type: "text",
          required: true,
        },
        {
          slug: "source-kind",
          name: "证据类型",
          type: "text",
          required: true,
        },
        {
          slug: "source-location",
          name: "来源定位",
          type: "text",
          required: true,
        },
        {
          slug: "source-revision",
          name: "对应版本",
          type: "text",
          required: true,
        },
        {
          slug: "observed-at",
          name: "采集时间",
          type: "date",
          required: true,
        },
        {
          slug: "sha256",
          name: "本机原始产物 SHA-256",
          type: "text",
          required: true,
        },
        {
          slug: "artifact-reference",
          name: "本机受限原件引用",
          type: "text",
          required: false,
        },
        {
          slug: "redacted-excerpt",
          name: "脱敏摘要",
          type: "longtext",
          required: false,
        },
        {
          slug: "coverage-note",
          name: "覆盖与脱敏说明",
          type: "longtext",
          required: false,
        },
        {
          slug: "policy-hash",
          name: "本次规则与端点指纹",
          type: "text",
          required: false,
        },
        {
          slug: "project",
          name: "项目",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-appsec-projects",
            allowMultiple: false,
          },
        },
        {
          slug: "run",
          name: "任务",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-appsec-runs",
            allowMultiple: false,
          },
        },
        {
          slug: "check",
          name: "验证",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-appsec-checks",
            allowMultiple: false,
          },
        },
      ],
      views: [
        {
          key: "evidence-main",
          name: "证据",
          type: "table",
          config: {},
        },
      ],
      agentPrompts: [
        {
          key: "scenario-1",
          label: "核对指定发现的来源、版本和原件完整性。",
          body: "阅读此文件夹中的 kelly-appsec skill。核对指定发现的来源、版本和原件完整性。",
          intent: "change",
        },
        {
          key: "scenario-2",
          label: "将当前审计证据整理为明确范围的脱敏报告。",
          body: "阅读此文件夹中的 kelly-appsec skill。将当前审计证据整理为明确范围的脱敏报告。",
          intent: "read-only",
        },
      ],
    },
  ],
  onboarding: {
    version: 1,
    required_fields: [
      {
        key: "owner-and-scope",
        resource: "projects",
        validation: "负责人、业务规则和当前会话授权范围明确",
        unlocks: ["request-run"],
      },
      {
        key: "target-version",
        resource: "projects",
        validation: "固定项目、测试环境、版本和 Origin",
        unlocks: ["dynamic-api-test"],
      },
    ],
    completion_resource: "projects",
  },
  permissions: {
    read_procedures: [
      "nodes.get",
      "nodes.list",
      "bases.listViews",
      "records.list",
      "records.get",
      "records.count",
      "records.groupBy",
      "changeRequests.list",
    ],
    change_request_procedures: ["records.changeRequest", "bases.createChangeRequest"],
  },
};
