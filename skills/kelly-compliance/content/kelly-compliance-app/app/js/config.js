export const appConfig = {
  appId: "kelly-compliance",
  appName: "Kelly Compliance",
  description: "云安全基线、SOC 2 就绪、证据期间与负责人闭环。",
  schemaVersion: 1,
  binding: "runtime",
  readOnly: false,
  locale: "zh-CN",
  folder: {
    name: "Kelly Compliance",
    slug: "kelly-compliance",
    description: "云安全与合规准备工作台",
  },
  airApp: {
    slug: "kelly-compliance-app",
    name: "云安全与合规准备台",
    description: "技术基线、控制矩阵和周期证据",
    resourceKey: "kelly-compliance-app",
  },
  bases: [
    {
      key: "programs",
      name: "合规项目",
      slug: "kelly-compliance-programs",
      description: "SaaS 服务边界、账户、期间与责任人。",
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
          name: "幂等业务键",
          type: "text",
          required: true,
        },
        {
          slug: "service-description",
          name: "服务与系统范围",
          type: "longtext",
          required: true,
        },
        {
          slug: "owner",
          name: "负责人",
          type: "text",
          required: true,
        },
        {
          slug: "accounts",
          name: "授权账户（逐行）",
          type: "longtext",
          required: true,
        },
        {
          slug: "regions",
          name: "授权区域（逐行）",
          type: "longtext",
          required: true,
        },
        {
          slug: "framework-version",
          name: "控制包版本",
          type: "text",
          required: true,
        },
        {
          slug: "assessment-type",
          name: "评估类型",
          type: "select",
          required: true,
          options: {
            choices: [
              {
                id: "point",
                name: "时点准备",
              },
              {
                id: "period",
                name: "期间准备",
              },
            ],
          },
        },
        {
          slug: "period-start",
          name: "开始时间",
          type: "date",
          required: true,
        },
        {
          slug: "period-end",
          name: "结束时间",
          type: "date",
          required: true,
        },
        {
          slug: "scope-reference",
          name: "授权范围引用",
          type: "text",
          required: true,
        },
        {
          slug: "scope-version",
          name: "范围版本",
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
                id: "complete",
                name: "已确认范围",
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
          key: "programs-table",
          name: "合规项目",
          type: "table",
          config: {},
        },
      ],
      agentPrompts: [
        {
          key: "scenario-1",
          label: "建立我指定服务的云安全与 SOC 2 准备范围。",
          body: "阅读此文件夹中的 kelly-compliance skill，遵循其流程。建立我指定服务的云安全与 SOC 2 准备范围。",
          intent: "change",
        },
        {
          key: "scenario-2",
          label: "解释这个服务还有哪些账户、期间或责任没有确认。",
          body: "阅读此文件夹中的 kelly-compliance skill，遵循其流程。解释这个服务还有哪些账户、期间或责任没有确认。",
          intent: "read-only",
        },
      ],
    },
    {
      key: "resources",
      name: "云资产与检查",
      slug: "kelly-compliance-resources",
      description: "资产归属、现有技术检查结果及覆盖。",
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
          name: "幂等业务键",
          type: "text",
          required: true,
        },
        {
          slug: "program-reference",
          name: "合规项目精确索引",
          type: "text",
          required: true,
        },
        {
          slug: "assessment-reference",
          name: "评估精确索引",
          type: "text",
          required: false,
        },
        {
          slug: "provider",
          name: "来源云",
          type: "text",
          required: false,
        },
        {
          slug: "account",
          name: "账户",
          type: "text",
          required: true,
        },
        {
          slug: "region",
          name: "区域",
          type: "text",
          required: true,
        },
        {
          slug: "resource-key",
          name: "来源资源标识",
          type: "text",
          required: true,
        },
        {
          slug: "resource-type",
          name: "资产类型",
          type: "text",
          required: false,
        },
        {
          slug: "check-id",
          name: "技术检查键",
          type: "text",
          required: true,
        },
        {
          slug: "status",
          name: "技术结果",
          type: "select",
          required: true,
          options: {
            choices: [
              {
                id: "pass",
                name: "符合声明规则",
              },
              {
                id: "fail",
                name: "违反声明规则",
              },
              {
                id: "unknown",
                name: "未知",
              },
              {
                id: "manual",
                name: "需人工核对",
              },
            ],
          },
        },
        {
          slug: "observed-at",
          name: "观察时间",
          type: "date",
          required: true,
        },
        {
          slug: "summary",
          name: "脱敏结论",
          type: "longtext",
          required: false,
        },
        {
          slug: "source-locator",
          name: "原始来源",
          type: "text",
          required: false,
        },
        {
          slug: "program",
          name: "合规项目",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-compliance-programs",
            allowMultiple: false,
          },
        },
        {
          slug: "assessment",
          name: "来源评估",
          type: "relation",
          required: false,
          options: {
            targetBaseSlug: "kelly-compliance-assessments",
            allowMultiple: false,
          },
        },
      ],
      views: [
        {
          key: "resources-table",
          name: "云资产与检查",
          type: "table",
          config: {},
        },
      ],
      agentPrompts: [
        {
          key: "scenario-1",
          label: "导入已授权账户的现有云安全检查结果。",
          body: "阅读此文件夹中的 kelly-compliance skill，遵循其流程。导入已授权账户的现有云安全检查结果。",
          intent: "change",
        },
        {
          key: "scenario-2",
          label: "找出无权限、未知或范围没有覆盖的资产。",
          body: "阅读此文件夹中的 kelly-compliance skill，遵循其流程。找出无权限、未知或范围没有覆盖的资产。",
          intent: "read-only",
        },
      ],
    },
    {
      key: "controls",
      name: "控制项",
      slug: "kelly-compliance-controls",
      description: "自有控制模板、负责人及所需证据。",
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
          name: "幂等业务键",
          type: "text",
          required: true,
        },
        {
          slug: "program-reference",
          name: "合规项目精确索引",
          type: "text",
          required: true,
        },
        {
          slug: "control-key",
          name: "控制键",
          type: "text",
          required: true,
        },
        {
          slug: "framework-version",
          name: "控制包版本",
          type: "text",
          required: true,
        },
        {
          slug: "external-reference",
          name: "外部要求引用",
          type: "text",
          required: false,
        },
        {
          slug: "kind",
          name: "类型",
          type: "select",
          required: true,
          options: {
            choices: [
              {
                id: "technical",
                name: "技术与运行",
              },
              {
                id: "organizational",
                name: "组织与流程",
              },
            ],
          },
        },
        {
          slug: "mapped-checks",
          name: "技术检查映射",
          type: "text",
          required: false,
        },
        {
          slug: "owner",
          name: "负责人",
          type: "text",
          required: false,
        },
        {
          slug: "frequency",
          name: "执行频率",
          type: "text",
          required: false,
        },
        {
          slug: "coverage-mode",
          name: "证据需求",
          type: "select",
          required: true,
          options: {
            choices: [
              {
                id: "snapshot",
                name: "时点证据",
              },
              {
                id: "period",
                name: "期间运行证据",
              },
            ],
          },
        },
        {
          slug: "description",
          name: "目的与方法",
          type: "longtext",
          required: true,
        },
        {
          slug: "design-state",
          name: "设计状态",
          type: "select",
          required: true,
          options: {
            choices: [
              {
                id: "not-designed",
                name: "待设计",
              },
              {
                id: "designed",
                name: "已说明方法",
              },
            ],
          },
        },
        {
          slug: "evidence-requirements",
          name: "证据维度",
          type: "longtext",
          required: false,
        },
        {
          slug: "program",
          name: "合规项目",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-compliance-programs",
            allowMultiple: false,
          },
        },
      ],
      views: [
        {
          key: "controls-table",
          name: "控制项",
          type: "table",
          config: {},
        },
      ],
      agentPrompts: [
        {
          key: "scenario-1",
          label: "为这个服务初始化可解释的控制模板并指定负责人。",
          body: "阅读此文件夹中的 kelly-compliance skill，遵循其流程。为这个服务初始化可解释的控制模板并指定负责人。",
          intent: "change",
        },
        {
          key: "scenario-2",
          label: "解释控制项需要什么技术和组织证据。",
          body: "阅读此文件夹中的 kelly-compliance skill，遵循其流程。解释控制项需要什么技术和组织证据。",
          intent: "read-only",
        },
      ],
    },
    {
      key: "assessments",
      name: "评估任务",
      slug: "kelly-compliance-assessments",
      description: "固定范围和版本的采集、导入与复核任务。",
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
          name: "幂等业务键",
          type: "text",
          required: true,
        },
        {
          slug: "program-reference",
          name: "合规项目精确索引",
          type: "text",
          required: true,
        },
        {
          slug: "scope-reference",
          name: "授权引用",
          type: "text",
          required: true,
        },
        {
          slug: "scope-version",
          name: "范围版本",
          type: "number",
          required: true,
        },
        {
          slug: "framework-version",
          name: "控制包版本",
          type: "text",
          required: true,
        },
        {
          slug: "period-start",
          name: "期间开始",
          type: "date",
          required: true,
        },
        {
          slug: "period-end",
          name: "期间结束",
          type: "date",
          required: true,
        },
        {
          slug: "assessment-type",
          name: "评估类型",
          type: "select",
          required: true,
          options: {
            choices: [
              {
                id: "point",
                name: "时点准备",
              },
              {
                id: "period",
                name: "期间准备",
              },
            ],
          },
        },
        {
          slug: "source-format",
          name: "来源格式",
          type: "text",
          required: false,
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
                name: "采集完成",
              },
              {
                id: "partial",
                name: "覆盖不足",
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
          slug: "heartbeat-at",
          name: "最近心跳",
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
          slug: "coverage-note",
          name: "缺口与限制",
          type: "longtext",
          required: false,
        },
        {
          slug: "source-sha256",
          name: "来源 SHA-256",
          type: "text",
          required: false,
        },
        {
          slug: "program",
          name: "合规项目",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-compliance-programs",
            allowMultiple: false,
          },
        },
      ],
      views: [
        {
          key: "assessments-table",
          name: "评估任务",
          type: "table",
          config: {},
        },
      ],
      agentPrompts: [
        {
          key: "scenario-1",
          label: "在当前明确授权内读取现有云配置或导入报告。",
          body: "阅读此文件夹中的 kelly-compliance skill，遵循其流程。在当前明确授权内读取现有云配置或导入报告。",
          intent: "change",
        },
        {
          key: "scenario-2",
          label: "解释评估结果覆盖哪些账户、区域和期间。",
          body: "阅读此文件夹中的 kelly-compliance skill，遵循其流程。解释评估结果覆盖哪些账户、区域和期间。",
          intent: "read-only",
        },
      ],
    },
    {
      key: "evidence",
      name: "证据中心",
      slug: "kelly-compliance-evidence",
      description: "来源、哈希、实际期间与脱敏内容。",
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
          name: "幂等业务键",
          type: "text",
          required: true,
        },
        {
          slug: "program-reference",
          name: "合规项目精确索引",
          type: "text",
          required: true,
        },
        {
          slug: "assessment-reference",
          name: "评估精确索引",
          type: "text",
          required: false,
        },
        {
          slug: "framework-version",
          name: "控制包版本",
          type: "text",
          required: true,
        },
        {
          slug: "scope-version",
          name: "范围版本",
          type: "number",
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
          name: "来源定位",
          type: "text",
          required: true,
        },
        {
          slug: "sha256",
          name: "原始产物 SHA-256",
          type: "text",
          required: true,
        },
        {
          slug: "observed-at",
          name: "观察时间",
          type: "date",
          required: true,
        },
        {
          slug: "collected-at",
          name: "采集时间",
          type: "date",
          required: true,
        },
        {
          slug: "coverage-start",
          name: "实际覆盖开始",
          type: "date",
          required: false,
        },
        {
          slug: "coverage-end",
          name: "实际覆盖结束",
          type: "date",
          required: false,
        },
        {
          slug: "evidence-mode",
          name: "证据形态",
          type: "select",
          required: true,
          options: {
            choices: [
              {
                id: "snapshot",
                name: "当前快照",
              },
              {
                id: "period",
                name: "真实期间记录",
              },
            ],
          },
        },
        {
          slug: "technical-result",
          name: "技术结果",
          type: "select",
          required: true,
          options: {
            choices: [
              {
                id: "pass",
                name: "符合声明规则",
              },
              {
                id: "fail",
                name: "违反声明规则",
              },
              {
                id: "unknown",
                name: "未知",
              },
              {
                id: "manual",
                name: "需人工核对",
              },
            ],
          },
        },
        {
          slug: "excerpt",
          name: "脱敏摘要",
          type: "longtext",
          required: false,
        },
        {
          slug: "retention-until",
          name: "复核/有效截止",
          type: "date",
          required: false,
        },
        {
          slug: "scope-reference",
          name: "授权范围依据",
          type: "text",
          required: false,
        },
        {
          slug: "account",
          name: "账户/组织",
          type: "text",
          required: false,
        },
        {
          slug: "region",
          name: "区域",
          type: "text",
          required: false,
        },
        {
          slug: "resource-key",
          name: "资源或人员范围",
          type: "text",
          required: false,
        },
        {
          slug: "check-id",
          name: "检查维度",
          type: "text",
          required: false,
        },
        {
          slug: "requirement-key",
          name: "支撑维度",
          type: "text",
          required: false,
        },
        {
          slug: "program",
          name: "合规项目",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-compliance-programs",
            allowMultiple: false,
          },
        },
        {
          slug: "assessment",
          name: "评估任务",
          type: "relation",
          required: false,
          options: {
            targetBaseSlug: "kelly-compliance-assessments",
            allowMultiple: false,
          },
        },
      ],
      views: [
        {
          key: "evidence-table",
          name: "证据中心",
          type: "table",
          config: {},
        },
      ],
      agentPrompts: [
        {
          key: "scenario-1",
          label: "登记真实证据并保留来源、哈希和实际覆盖期间。",
          body: "阅读此文件夹中的 kelly-compliance skill，遵循其流程。登记真实证据并保留来源、哈希和实际覆盖期间。",
          intent: "change",
        },
        {
          key: "scenario-2",
          label: "检查某份材料能否支撑指定控制和期间。",
          body: "阅读此文件夹中的 kelly-compliance skill，遵循其流程。检查某份材料能否支撑指定控制和期间。",
          intent: "read-only",
        },
      ],
    },
    {
      key: "evidence-links",
      name: "证据适用与复核",
      slug: "kelly-compliance-evidence-links",
      description: "每个控制/证据映射独立判断。",
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
          name: "幂等业务键",
          type: "text",
          required: true,
        },
        {
          slug: "program-reference",
          name: "合规项目精确索引",
          type: "text",
          required: true,
        },
        {
          slug: "assessment-reference",
          name: "评估精确索引",
          type: "text",
          required: false,
        },
        {
          slug: "control-reference",
          name: "控制项精确索引",
          type: "text",
          required: true,
        },
        {
          slug: "evidence-reference",
          name: "证据精确索引",
          type: "text",
          required: true,
        },
        {
          slug: "review-state",
          name: "人工审核",
          type: "select",
          required: true,
          options: {
            choices: [
              {
                id: "pending",
                name: "待审核",
              },
              {
                id: "accepted",
                name: "接受此映射",
              },
              {
                id: "rejected",
                name: "拒绝此映射",
              },
            ],
          },
        },
        {
          slug: "review-note",
          name: "审核理由",
          type: "longtext",
          required: false,
        },
        {
          slug: "reviewer",
          name: "审核人",
          type: "text",
          required: false,
        },
        {
          slug: "reviewed-at",
          name: "审核时间",
          type: "date",
          required: false,
        },
        {
          slug: "program",
          name: "合规项目",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-compliance-programs",
            allowMultiple: false,
          },
        },
        {
          slug: "assessment",
          name: "评估任务",
          type: "relation",
          required: false,
          options: {
            targetBaseSlug: "kelly-compliance-assessments",
            allowMultiple: false,
          },
        },
        {
          slug: "control",
          name: "控制项",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-compliance-controls",
            allowMultiple: false,
          },
        },
        {
          slug: "evidence",
          name: "证据",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-compliance-evidence",
            allowMultiple: false,
          },
        },
      ],
      views: [
        {
          key: "evidence-links-table",
          name: "证据适用与复核",
          type: "table",
          config: {},
        },
      ],
      agentPrompts: [
        {
          key: "scenario-1",
          label: "复核这份证据对指定控制的适用性并说明理由。",
          body: "阅读此文件夹中的 kelly-compliance skill，遵循其流程。复核这份证据对指定控制的适用性并说明理由。",
          intent: "change",
        },
        {
          key: "scenario-2",
          label: "找出范围不匹配、期间不足或已经过期的映射。",
          body: "阅读此文件夹中的 kelly-compliance skill，遵循其流程。找出范围不匹配、期间不足或已经过期的映射。",
          intent: "read-only",
        },
      ],
    },
    {
      key: "issues",
      name: "缺口与整改",
      slug: "kelly-compliance-issues",
      description: "责任、期限、补证与实际验证。",
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
          name: "幂等业务键",
          type: "text",
          required: true,
        },
        {
          slug: "program-reference",
          name: "合规项目精确索引",
          type: "text",
          required: true,
        },
        {
          slug: "assessment-reference",
          name: "评估精确索引",
          type: "text",
          required: false,
        },
        {
          slug: "control-reference",
          name: "控制项精确索引",
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
          slug: "issue-kind",
          name: "缺口类型",
          type: "select",
          required: true,
          options: {
            choices: [
              {
                id: "technical",
                name: "技术问题",
              },
              {
                id: "evidence",
                name: "证据不足",
              },
            ],
          },
        },
        {
          slug: "status",
          name: "处理状态",
          type: "select",
          required: true,
          options: {
            choices: [
              {
                id: "open",
                name: "待分派",
              },
              {
                id: "in-progress",
                name: "处理中",
              },
              {
                id: "needs-verification",
                name: "待验证",
              },
              {
                id: "closed",
                name: "已验证关闭",
              },
              {
                id: "reopened",
                name: "重开",
              },
            ],
          },
        },
        {
          slug: "owner",
          name: "负责人",
          type: "text",
          required: false,
        },
        {
          slug: "due-at",
          name: "截止时间",
          type: "date",
          required: false,
        },
        {
          slug: "reason",
          name: "缺口依据",
          type: "longtext",
          required: true,
        },
        {
          slug: "resolution-note",
          name: "处理与验证理由",
          type: "longtext",
          required: false,
        },
        {
          slug: "verified-evidence-reference",
          name: "验证证据索引",
          type: "text",
          required: false,
        },
        {
          slug: "verification-after",
          name: "验证证据须晚于",
          type: "date",
          required: false,
        },
        {
          slug: "resource-key",
          name: "待复测资源",
          type: "text",
          required: false,
        },
        {
          slug: "check-id",
          name: "待复测检查",
          type: "text",
          required: false,
        },
        {
          slug: "account",
          name: "账户",
          type: "text",
          required: false,
        },
        {
          slug: "region",
          name: "区域",
          type: "text",
          required: false,
        },
        {
          slug: "program",
          name: "合规项目",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-compliance-programs",
            allowMultiple: false,
          },
        },
        {
          slug: "assessment",
          name: "评估任务",
          type: "relation",
          required: false,
          options: {
            targetBaseSlug: "kelly-compliance-assessments",
            allowMultiple: false,
          },
        },
        {
          slug: "control",
          name: "控制项",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-compliance-controls",
            allowMultiple: false,
          },
        },
        {
          slug: "verified-evidence",
          name: "验证证据",
          type: "relation",
          required: false,
          options: {
            targetBaseSlug: "kelly-compliance-evidence",
            allowMultiple: false,
          },
        },
      ],
      views: [
        {
          key: "issues-table",
          name: "缺口与整改",
          type: "table",
          config: {},
        },
      ],
      agentPrompts: [
        {
          key: "scenario-1",
          label: "为缺口分配负责人和期限，补证后验证关闭。",
          body: "阅读此文件夹中的 kelly-compliance skill，遵循其流程。为缺口分配负责人和期限，补证后验证关闭。",
          intent: "change",
        },
        {
          key: "scenario-2",
          label: "解释哪些问题仍然开放或需要重新验证。",
          body: "阅读此文件夹中的 kelly-compliance skill，遵循其流程。解释哪些问题仍然开放或需要重新验证。",
          intent: "read-only",
        },
      ],
    },
    {
      key: "exceptions",
      name: "风险例外",
      slug: "kelly-compliance-exceptions",
      description: "接受人、补偿措施、明确期限与撤销。",
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
          name: "幂等业务键",
          type: "text",
          required: true,
        },
        {
          slug: "program-reference",
          name: "合规项目精确索引",
          type: "text",
          required: true,
        },
        {
          slug: "control-reference",
          name: "控制项精确索引",
          type: "text",
          required: true,
        },
        {
          slug: "issue-reference",
          name: "缺口精确索引",
          type: "text",
          required: false,
        },
        {
          slug: "reason",
          name: "接受理由",
          type: "longtext",
          required: true,
        },
        {
          slug: "compensating-controls",
          name: "补偿措施",
          type: "longtext",
          required: true,
        },
        {
          slug: "accepted-by",
          name: "接受人",
          type: "text",
          required: true,
        },
        {
          slug: "expires-at",
          name: "有效截止",
          type: "date",
          required: true,
        },
        {
          slug: "status",
          name: "状态",
          type: "select",
          required: true,
          options: {
            choices: [
              {
                id: "accepted",
                name: "已记录风险接受",
              },
              {
                id: "revoked",
                name: "已撤销",
              },
            ],
          },
        },
        {
          slug: "program",
          name: "合规项目",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-compliance-programs",
            allowMultiple: false,
          },
        },
        {
          slug: "control",
          name: "控制项",
          type: "relation",
          required: true,
          options: {
            targetBaseSlug: "kelly-compliance-controls",
            allowMultiple: false,
          },
        },
        {
          slug: "issue",
          name: "缺口",
          type: "relation",
          required: false,
          options: {
            targetBaseSlug: "kelly-compliance-issues",
            allowMultiple: false,
          },
        },
      ],
      views: [
        {
          key: "exceptions-table",
          name: "风险例外",
          type: "table",
          config: {},
        },
      ],
      agentPrompts: [
        {
          key: "scenario-1",
          label: "记录已经决定的风险接受、补偿措施和到期时间。",
          body: "阅读此文件夹中的 kelly-compliance skill，遵循其流程。记录已经决定的风险接受、补偿措施和到期时间。",
          intent: "change",
        },
        {
          key: "scenario-2",
          label: "检查哪些例外已到期或仍保留技术风险。",
          body: "阅读此文件夹中的 kelly-compliance skill，遵循其流程。检查哪些例外已到期或仍保留技术风险。",
          intent: "read-only",
        },
      ],
    },
  ],
  drive: {
    name: "私有证据与准备包",
    slug: "kelly-compliance-files",
    description: "私有证据索引与审计准备包；不上传原始秘密。",
  },
  onboarding: {
    version: 1,
    completion_resource: "programs",
    required_fields: [
      {
        key: "service-scope",
        resource: "programs",
        validation: "服务、负责人、授权账户区域、时区明确的期间、框架和范围版本完整",
        unlocks: ["initialize-controls", "import-report", "request-assessment"],
      },
    ],
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
