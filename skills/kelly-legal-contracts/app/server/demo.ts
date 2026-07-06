// Deterministic legal-contract demo scenes for documentation and screenshots.
// Demo mode never reads or writes app/.data/. Risk checks are computed by the
// shared rules engine from the actual mock issue content, so the blocked DPA
// issue really fails the playbook / hard-stop checks.
import { computeMetrics, evaluateDraft, ruleCatalog, scoreChecks } from "./rules.ts";
import type { Check, DemoQuery, Draft } from "./types.ts";

const now = "2026-07-03T08:30:00.000Z";
export const FEATURED_DRAFT_ID = "d-msa-liability-us";

export function isDemoQuery(query: DemoQuery = {}) {
  return Boolean(query.demo);
}

export function demoStatePayload(query: DemoQuery = {}) {
  const scenario = String(query.demo || "overview");
  const zh = String(query.lang || "")
    .toLowerCase()
    .startsWith("zh");
  const lang = zh ? "zh" : "en";
  const claims = demoPlaybook(zh);
  const snapshot = demoSnapshot(scenario, zh, lang, claims);
  return {
    demo: true,
    demo_scenario: scenario,
    app: "kelly-legal-contracts",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: "2026-06-20T02:00:00.000Z", config_version: "demo" },
    lock: null,
    config_summary: demoConfigSummary(zh),
    decisions: demoDecisions(zh),
    agent_tasks: demoAgentTasks(zh),
    execution_report: demoExecutionReport(zh),
    claims,
    snapshot,
  };
}

function L(zh) {
  return (en, zhText) => (zh ? zhText : en);
}

function demoPlaybook(zh) {
  const l = L(zh);
  const updated = "2026-06-28T00:00:00.000Z";
  return {
    updated_at: updated,
    claims: [
      {
        claim_id: "clause-mutual-nda",
        text: "Mutual confidentiality with purpose-limited use",
        status: "approved",
        category: l("Confidentiality", "保密"),
        substantiation: l(
          "Company fallback playbook v3.2; acceptable for vendor and partner NDAs.",
          "公司 fallback playbook v3.2；适用于供应商和合作伙伴 NDA。",
        ),
        evidence: ["playbooks/nda-v3.2.md"],
        approved_by: "legal",
        approved_at: updated,
        notes: "",
        created_at: updated,
        updated_at: updated,
      },
      {
        claim_id: "clause-liability-cap",
        text: "Liability cap at fees paid in the preceding 12 months",
        status: "approved",
        category: l("Liability", "责任限制"),
        substantiation: l(
          "Commercial fallback approved by GC for SaaS MSAs below USD 250k ARR.",
          "GC 已批准：适用于 ARR 低于 25 万美元的 SaaS MSA。",
        ),
        evidence: ["playbooks/msa-risk-matrix.xlsx"],
        approved_by: "GC",
        approved_at: updated,
        notes: "",
        created_at: updated,
        updated_at: updated,
      },
      {
        claim_id: "clause-open-ended-indemnity",
        text: "uncapped indemnity for any and all claims",
        status: "rejected",
        category: l("Indemnity", "赔偿"),
        substantiation: "",
        evidence: [],
        approved_by: "",
        approved_at: "",
        notes: l(
          "Rejected by legal policy: too broad, no nexus to breach or IP infringement.",
          "法务政策已拒绝：范围过宽，未限定违约或知识产权侵权。",
        ),
        created_at: updated,
        updated_at: updated,
      },
    ],
    rules: [
      {
        rule_id: "claimrule-uncapped-liability",
        phrase: "uncapped liability",
        type: "banned_word",
        severity: "error",
        reason: l("Requires GC escalation and cannot be approved in the desk.", "需要升级 GC，不能在工作台直接批准。"),
        alternative: l("cap liability at fees paid in the preceding 12 months", "责任上限为过去 12 个月已支付费用"),
        created_at: updated,
      },
      {
        rule_id: "claimrule-perpetual-data-retention",
        phrase: "perpetual data retention",
        type: "restricted_phrase",
        severity: "error",
        reason: l("Conflicts with deletion and privacy commitments.", "与删除义务和隐私承诺冲突。"),
        alternative: l(
          "retain only as required by law or for documented security logs",
          "仅按法律要求或安全日志需要保留",
        ),
        created_at: updated,
      },
    ],
  };
}

function demoConfig() {
  return {
    banned_words: ["uncapped liability", "perpetual data retention", "exclusive remedy", "sole discretion"],
    competitor_brands: ["competitor standard terms", "customer standard paper"],
    keyword_stuffing: { max_repeats: 4 },
    allowed_all_caps: ["DPA", "NDA", "MSA", "SOW", "SLA", "IP", "GDPR", "CCPA", "SOC"],
    platforms: [
      {
        platform: "nda",
        enabled: true,
        locales: ["US", "UK"],
        rules: {
          title_max_chars: 160,
          bullets_exact: 5,
          search_terms_max_bytes: 600,
          required_fields: ["title", "bullets", "description", "search_terms"],
        },
      },
      {
        platform: "msa",
        enabled: true,
        locales: ["US"],
        rules: {
          title_max_chars: 120,
          seo_title_max_chars: 80,
          seo_description_max_chars: 240,
          required_fields: ["title", "description", "seo_title", "seo_description"],
        },
      },
      {
        platform: "dpa",
        enabled: true,
        locales: ["EU", "UK"],
        rules: { title_max_chars: 140, min_selling_points: 3, required_fields: ["title", "selling_points"] },
      },
      {
        platform: "sow",
        enabled: true,
        locales: ["US"],
        rules: { title_max_chars: 120, required_fields: ["title", "description"] },
      },
    ],
    export: { format: "markdown+docx-ready", out_dir: "exports" },
  };
}

function demoConfigSummary(zh) {
  const l = L(zh);
  const config = demoConfig();
  return {
    config_path: "demo://kelly-legal-contracts/config.json",
    is_example: false,
    seller: {
      brand: l("Nimbus Legal Ops", "Nimbus 法务运营"),
      entity: l("Nimbus Home Trading Co., Ltd. (Shenzhen)", "深圳临风家居贸易有限公司"),
      tone: l("Practical, risk-ranked, business-friendly", "实用、按风险分级、兼顾业务推进"),
    },
    locales: ["US", "UK", "EU"],
    platforms: config.platforms,
    banned_words_count: config.banned_words.length,
    competitor_brands_count: config.competitor_brands.length,
    keyword_stuffing: { max_repeats: 4 },
    export: { format: "markdown+docx-ready", out_dir: "exports" },
    publish: {
      handoff_to_agent: true,
      requires_approval: true,
      secret_envs: [],
      secrets_ready: true,
    },
  };
}

function demoProducts(zh) {
  const l = L(zh);
  return [
    {
      product_id: "ct-acme-nda",
      ref: 1,
      name: l("Acme Mutual NDA", "Acme 双向 NDA"),
      sku: "Acme Robotics",
      category: l("Vendor evaluation", "供应商评估"),
      source: "manual",
      platforms: ["nda"],
      locales: ["US"],
      specs: [
        { name: l("Counterparty", "相对方"), value: "Acme Robotics, Inc." },
        { name: l("Our entity", "我方主体"), value: l("Nimbus Home Trading Co., Ltd.", "深圳临风家居贸易有限公司") },
        { name: l("Governing law", "适用法律"), value: "California" },
        { name: l("Deal owner", "业务负责人"), value: "Mira Chen" },
        { name: l("Target signature", "目标签署时间"), value: "2026-07-10" },
      ],
      features: [
        l("Mutual confidentiality", "双向保密"),
        l("Two-year confidentiality term", "两年保密期"),
        l("Residuals clause added by counterparty", "相对方加入 residuals 条款"),
      ],
      keywords: ["residuals", "purpose limitation", "return or destroy", "injunctive relief"],
      images: [
        { name: l("NDA PDF received", "已收到 NDA PDF"), status: "ready" },
        { name: l("Business purpose note", "业务目的说明"), status: "ready" },
        { name: l("Counterparty redline", "相对方红线稿"), status: "ready" },
      ],
      notes: l("Inbound NDA for robotics supplier evaluation.", "机器人供应商评估相关入站 NDA。"),
      created_at: "2026-06-30T03:10:00.000Z",
      updated_at: "2026-07-02T09:40:00.000Z",
    },
    {
      product_id: "ct-zenith-msa",
      ref: 2,
      name: l("Zenith SaaS MSA", "Zenith SaaS MSA"),
      sku: "Zenith Analytics",
      category: l("Customer sale", "客户销售"),
      source: "kelly_picks",
      platforms: ["msa"],
      locales: ["US"],
      specs: [
        { name: l("Contract value", "合同金额"), value: "USD 180k ARR" },
        { name: l("Term", "期限"), value: "24 months" },
        { name: l("Payment", "付款"), value: "Annual prepaid" },
        { name: l("Governing law", "适用法律"), value: "Delaware" },
      ],
      features: [
        l("Customer asks for uncapped indemnity", "客户要求无限额赔偿"),
        l("SLA credits added in exhibit", "附件加入 SLA credits"),
        l("Auto-renewal with 60-day notice", "自动续期，需提前 60 天通知"),
      ],
      keywords: ["liability cap", "indemnity", "SLA credits", "termination for convenience"],
      images: [
        { name: l("MSA draft", "MSA 草稿"), status: "ready" },
        { name: l("Order form", "订单表"), status: "ready" },
        { name: l("Security exhibit", "安全附件"), status: "ready" },
      ],
      notes: l(
        "Business wants signature before quarter close; legal review cannot waive liability cap.",
        "业务希望季度末前签署；法务审查不能放弃责任上限。",
      ),
      created_at: "2026-06-26T06:00:00.000Z",
      updated_at: "2026-07-02T07:20:00.000Z",
    },
    {
      product_id: "ct-orbit-dpa",
      ref: 3,
      name: l("Orbit Processor DPA", "Orbit 处理者 DPA"),
      sku: "Orbit Cloud",
      category: l("Vendor privacy", "供应商隐私"),
      source: "manual",
      platforms: ["dpa"],
      locales: ["EU", "UK"],
      specs: [
        { name: l("Data role", "数据角色"), value: l("Vendor acts as processor", "供应商作为处理者") },
        { name: l("Data subjects", "数据主体"), value: l("End customers and support users", "终端客户和支持用户") },
        { name: l("Incident notice", "事故通知"), value: "72 hours requested" },
      ],
      features: [
        l("Subprocessor list attached", "已附 subprocessors 清单"),
        l("Cross-border transfer section references SCCs", "跨境传输章节引用 SCC"),
        l("Deletion language conflicts with retention appendix", "删除条款与保留附件冲突"),
      ],
      keywords: ["SCC", "subprocessors", "deletion", "incident notice", "retention"],
      images: [
        { name: l("DPA draft", "DPA 草稿"), status: "ready" },
        { name: l("Subprocessor exhibit", "Subprocessor 附件"), status: "ready" },
        { name: l("Security questionnaire", "安全问卷"), status: "needs_edit" },
      ],
      notes: l("Privacy review for EU/UK customer data processing.", "EU/UK 客户数据处理隐私审查。"),
      created_at: "2026-06-24T03:10:00.000Z",
      updated_at: "2026-07-01T10:00:00.000Z",
    },
    {
      product_id: "ct-luma-sow",
      ref: 4,
      name: l("Luma Implementation SOW", "Luma 实施 SOW"),
      sku: "Luma Retail",
      category: l("Services delivery", "服务交付"),
      source: "manual",
      platforms: ["sow"],
      locales: ["US"],
      specs: [
        { name: l("Fees", "费用"), value: "USD 42k fixed fee" },
        { name: l("Milestones", "里程碑"), value: "3 milestones" },
        { name: l("Acceptance", "验收"), value: "5 business days" },
      ],
      features: [
        l("Scope depends on customer data migration files", "范围依赖客户数据迁移文件"),
        l("Acceptance deemed approved after 5 business days", "5 个工作日后视为验收"),
        l("Change-order process missing hourly rate", "变更流程缺少小时费率"),
      ],
      keywords: ["acceptance", "change order", "dependencies", "milestone payment"],
      images: [
        { name: l("SOW draft", "SOW 草稿"), status: "ready" },
        { name: l("Implementation timeline", "实施时间表"), status: "ready" },
      ],
      notes: "",
      created_at: "2026-06-27T08:00:00.000Z",
      updated_at: "2026-07-02T02:15:00.000Z",
    },
  ];
}

function demoDrafts(zh): Draft[] {
  const l = L(zh);
  return [
    {
      draft_id: "d-nda-residuals-us",
      ref: 1,
      product_id: "ct-acme-nda",
      platform: "nda",
      locale: "US",
      variant_group: "nda-residuals",
      status: "needs_review",
      keyword_strategy: l(
        "Residuals language is broader than company playbook. Recommend deleting it or limiting it to unaided memory with no use of confidential materials.",
        "Residuals 条款宽于公司 playbook。建议删除，或限定为未借助资料的记忆且不得使用保密材料。",
      ),
      fields: {
        title: "Residuals clause allows personnel to use retained ideas after the NDA ends",
        bullets: [
          "Risk: counterparty language permits use of retained ideas, concepts, and know-how.",
          "Business impact: weakens purpose-limited confidentiality for robotics roadmap discussions.",
          "Fallback: delete residuals clause in full.",
          "Compromise: allow unaided memory only, excluding source code, technical specs, pricing, product roadmaps, and customer data.",
          "Escalation: required if counterparty insists residuals survive confidentiality obligations.",
        ],
        description:
          "Delete Section 7 (Residuals). If counterparty requires a residuals concept, replace with: Neither party may use the other party's Confidential Information except for the Purpose. General knowledge retained in unaided memory is not restricted, provided the receiving party does not intentionally memorize, copy, retain, or use Confidential Information, source materials, technical specifications, pricing, product roadmaps, or customer data.",
        search_terms:
          "Ask counterparty to remove residuals. If they resist, narrow to unaided memory and expressly exclude source code, specs, pricing, roadmaps, customer data, and trade secrets.",
        aplus_outline: [
          "Memo: residuals clause exceeds NDA playbook",
          "Redline: delete Section 7",
          "Fallback: unaided-memory carveout only",
        ],
      },
      created_at: "2026-06-30T06:00:00.000Z",
      updated_at: "2026-07-02T09:40:00.000Z",
    },
    {
      draft_id: "d-msa-liability-us",
      ref: 2,
      product_id: "ct-zenith-msa",
      platform: "msa",
      locale: "US",
      variant_group: "msa-liability",
      status: "needs_review",
      keyword_strategy: l(
        "The MSA asks for uncapped liability and uncapped indemnity. Company playbook allows a 12-month fees cap with narrow exclusions for confidentiality, IP infringement, and payment obligations.",
        "MSA 要求无限责任和无限赔偿。公司 playbook 允许以过去 12 个月费用为责任上限，并只对保密、知识产权侵权和付款义务设置窄例外。",
      ),
      fields: {
        title: "Customer paper requests uncapped liability and uncapped indemnity",
        description:
          "Replace uncapped liability with a mutual aggregate cap equal to fees paid or payable in the preceding 12 months. Carve-outs may include confidentiality breach, IP infringement indemnity, payment obligations, and fraud/willful misconduct, each subject to GC-approved sublimits where applicable.",
        seo_title: "Liability cap fallback for Zenith SaaS MSA",
        seo_description:
          "Recommend rejecting uncapped liability. Offer 12-month fees cap with narrow carve-outs and GC escalation if customer refuses.",
      },
      created_at: "2026-07-01T08:00:00.000Z",
      updated_at: "2026-07-02T09:40:00.000Z",
    },
    {
      draft_id: "d-dpa-retention-eu",
      ref: 3,
      product_id: "ct-orbit-dpa",
      platform: "dpa",
      locale: "EU",
      status: "needs_review",
      keyword_strategy: l(
        "DPA deletion section conflicts with the vendor's appendix allowing perpetual data retention. This is a hard stop for privacy review.",
        "DPA 删除章节与供应商附件中的永久数据保留冲突。这是隐私审查硬性阻断项。",
      ),
      fields: {
        title: "Retention appendix permits perpetual data retention after termination",
        selling_points: [
          "Block perpetual data retention; it conflicts with deletion obligations.",
          "Require deletion or return of personal data within 30 days after termination.",
          "Permit only legally required retention and documented security logs.",
          "Ask vendor to identify subprocessors and SCC transfer module.",
        ],
      },
      created_at: "2026-06-30T06:00:00.000Z",
      updated_at: "2026-07-01T09:00:00.000Z",
    },
    {
      draft_id: "d-sow-acceptance-us",
      ref: 4,
      product_id: "ct-luma-sow",
      platform: "sow",
      locale: "US",
      status: "approved",
      keyword_strategy: l(
        "Acceptance is workable if deemed acceptance starts only after complete deliverable submission and excludes defects reported in good faith.",
        "如视为验收只从完整交付物提交后开始计算，并排除善意报告的缺陷，则验收机制可接受。",
      ),
      fields: {
        title: "Acceptance window needs complete-deliverable trigger and defect carveout",
        subtitle: "Approved fallback for 5-business-day deemed acceptance",
        description:
          "Revise acceptance to state that the five-business-day review period begins only after complete delivery of the applicable milestone. Acceptance is deemed granted only if customer does not provide a good-faith written rejection describing material non-conformity. Supplier must cure rejected deliverables before milestone payment is due.",
        item_specifics: [
          { name: "Risk", value: "Medium" },
          { name: "Owner", value: "Services legal" },
          { name: "Fallback", value: "Complete-deliverable trigger + written rejection carveout" },
        ],
      },
      created_at: "2026-06-29T04:00:00.000Z",
      updated_at: "2026-07-02T02:15:00.000Z",
    },
    {
      draft_id: "d-msa-sla-us",
      ref: 5,
      product_id: "ct-zenith-msa",
      platform: "msa",
      locale: "US",
      status: "changes_requested",
      keyword_strategy: l(
        "SLA credits are commercially acceptable, but the draft does not cap credits as sole and exclusive remedy. Revision requested.",
        "SLA credits 商业上可接受，但草稿没有将 credits 设为唯一且排他的救济并设置上限。已要求修改。",
      ),
      fields: {
        title: "SLA service credits lack monthly cap and exclusive-remedy language",
        description:
          "Add that service credits are customer's sole and exclusive remedy for SLA failure and are capped at 10% of monthly subscription fees for the affected service in the applicable month.",
        seo_title: "SLA credit cap revision for Zenith MSA",
        seo_description: "Request revision: cap service credits and make them sole remedy for uptime misses.",
      },
      created_at: "2026-07-01T07:30:00.000Z",
      updated_at: "2026-07-02T07:20:00.000Z",
    },
  ];
}

function demoReviewItems(zh) {
  const l = L(zh);
  return [
    {
      review_id: "rv-nda-residuals-us",
      ref: 1,
      draft_id: "d-nda-residuals-us",
      status: "needs_review",
      compliance_summary: l(
        "Checks pass. Legal judgment needed: delete residuals or accept narrow unaided-memory fallback.",
        "检查通过。需要法务判断：删除 residuals，或接受窄范围 unaided-memory fallback。",
      ),
      suggestions: [
        l("Prefer deletion for supplier roadmap discussions.", "供应商路线图讨论场景优先删除。"),
        l(
          "If business needs speed, send fallback with explicit trade-secret and customer-data exclusions.",
          "若业务需要推进，可发送带商业秘密和客户数据排除的 fallback。",
        ),
      ],
      created_at: "2026-07-02T09:40:00.000Z",
    },
    {
      review_id: "rv-msa-liability-us",
      ref: 2,
      draft_id: "d-msa-liability-us",
      status: "needs_review",
      compliance_summary: l(
        'Playbook check fails: "uncapped liability" and rejected open-ended indemnity language require escalation.',
        '条款库检查未通过："uncapped liability" 和已拒绝的开放式赔偿表述需要升级。',
      ),
      suggestions: [
        l("Send 12-month-fees liability cap fallback.", "发送过去 12 个月费用责任上限 fallback。"),
        l("Escalate to GC if customer refuses any aggregate cap.", "如客户拒绝任何总责任上限，升级 GC。"),
      ],
      created_at: "2026-07-02T07:20:00.000Z",
    },
    {
      review_id: "rv-dpa-retention-eu",
      ref: 3,
      draft_id: "d-dpa-retention-eu",
      status: "needs_review",
      compliance_summary: l(
        'Hard stop: "perpetual data retention" conflicts with deletion commitments.',
        '硬性阻断："perpetual data retention" 与删除承诺冲突。',
      ),
      suggestions: [
        l("Block until vendor replaces retention appendix.", "供应商替换保留附件前拦截。"),
        l("Allow only legally required retention and documented security logs.", "仅允许依法保留和有记录的安全日志。"),
      ],
      created_at: "2026-07-01T09:00:00.000Z",
    },
    {
      review_id: "rv-sow-acceptance-us",
      ref: 4,
      draft_id: "d-sow-acceptance-us",
      status: "approved",
      compliance_summary: l("Approved fallback. Ready for issue-list export.", "Fallback 已批准。可导出 issue list。"),
      suggestions: [],
      created_at: "2026-07-02T02:15:00.000Z",
    },
    {
      review_id: "rv-msa-sla-us",
      ref: 5,
      draft_id: "d-msa-sla-us",
      status: "changes_requested",
      compliance_summary: l(
        "Needs revision: cap credits and make service credits sole remedy.",
        "需要修改：设置 credits 上限，并将服务 credits 作为唯一救济。",
      ),
      suggestions: [l("Add 10% monthly-fee cap.", "加入月费 10% 上限。")],
      created_at: "2026-07-02T06:00:00.000Z",
    },
  ];
}

function demoDecisions(zh) {
  const l = L(zh);
  return {
    updated_at: "2026-07-02T06:00:00.000Z",
    decisions: {
      "rv-msa-sla-us": {
        action: "request_changes",
        comment: l(
          "Add 10% monthly-fee cap and sole-remedy language before sending to customer.",
          "加入月费 10% 上限和唯一救济语言后再发客户。",
        ),
        decided_at: "2026-07-02T06:00:00.000Z",
      },
      "rv-sow-acceptance-us": {
        action: "approve",
        comment: l("Approved. Export into the issue list.", "已批准。导出到 issue list。"),
        decided_at: "2026-07-02T02:15:00.000Z",
      },
    },
  };
}

function demoAgentTasks(zh) {
  const l = L(zh);
  return {
    updated_at: "2026-07-02T06:00:00.000Z",
    tasks: [
      {
        task_id: "task-rv-msa-sla-us-1783404000000",
        type: "revise_contract_issue",
        review_id: "rv-msa-sla-us",
        draft_id: "d-msa-sla-us",
        ref: 5,
        comment: l(
          "Add 10% monthly-fee cap and sole-remedy language before sending to customer.",
          "加入月费 10% 上限和唯一救济语言后再发客户。",
        ),
        requested_at: "2026-07-02T06:00:00.000Z",
        status: "queued",
      },
    ],
  };
}

function demoExecutionReport(zh) {
  const l = L(zh);
  return {
    executed_at: "2026-07-02T02:20:00.000Z",
    dry_run: false,
    source: "kelly-legal-contracts-demo",
    results: [
      {
        review_id: "rv-sow-acceptance-us",
        draft_id: "d-sow-acceptance-us",
        ref: 4,
        status: "executed",
        operation: "export_issue_list",
        target: "exports/luma-implementation-sow-issues.md",
        detail: l("Markdown issue list written for counsel review.", "已写出 Markdown issue list 供法务复核。"),
        executed_at: "2026-07-02T02:20:00.000Z",
      },
    ],
  };
}

function demoActivity(zh) {
  const l = L(zh);
  return [
    {
      id: "act-8",
      at: "2026-07-02T09:40:00.000Z",
      actor: "agent",
      detail: l("Prepared residuals-clause fallback for Acme NDA.", "为 Acme NDA 准备 residuals 条款 fallback。"),
      draft_id: "d-nda-residuals-us",
    },
    {
      id: "act-7",
      at: "2026-07-02T07:20:00.000Z",
      actor: "agent",
      detail: l(
        "Flagged uncapped liability in Zenith MSA as escalation-required.",
        "将 Zenith MSA 的无限责任标记为需升级。",
      ),
      draft_id: "d-msa-liability-us",
    },
    {
      id: "act-6",
      at: "2026-07-02T06:00:00.000Z",
      actor: "seller",
      detail: l("Requested changes to SLA credit fallback.", "要求修改 SLA credit fallback。"),
      draft_id: "d-msa-sla-us",
    },
    {
      id: "act-5",
      at: "2026-07-02T02:20:00.000Z",
      actor: "agent",
      detail: l("Exported Luma SOW acceptance issue to the issue list.", "将 Luma SOW 验收风险项导出到 issue list。"),
      draft_id: "d-sow-acceptance-us",
    },
    {
      id: "act-4",
      at: "2026-07-01T09:00:00.000Z",
      actor: "agent",
      detail: l(
        "Blocked Orbit DPA retention appendix pending vendor revision.",
        "拦截 Orbit DPA 保留附件，等待供应商修改。",
      ),
      draft_id: "d-dpa-retention-eu",
    },
  ];
}

function demoSnapshot(scenario, zh, lang, claims = null) {
  const l = L(zh);
  const config = demoConfig();
  const products = demoProducts(zh);
  const drafts = demoDrafts(zh);
  const productsById = new Map(products.map((product) => [product.product_id, product]));
  const checks: Check[] = [];
  for (const draft of drafts) {
    const product = productsById.get(draft.product_id);
    for (const result of evaluateDraft(draft, product, config, lang, claims)) {
      checks.push({
        check_id: `chk-${draft.draft_id.replace(/^d-/, "")}-${result.rule_id}`,
        draft_id: draft.draft_id,
        rule_id: result.rule_id,
        severity: result.severity,
        result: result.result,
        evidence: result.evidence,
        ...(result.refs ? { refs: result.refs } : {}),
        checked_at: "2026-07-02T09:45:00.000Z",
      });
    }
    draft.compliance_score = scoreChecks(checks.filter((check) => check.draft_id === draft.draft_id));
  }
  const snapshot = {
    schema_version: "1",
    generated_at: now,
    source: "kelly-legal-contracts-demo",
    seller: {
      brand: l("Nimbus Legal Ops", "Nimbus 法务运营"),
      entity: l("Nimbus Home Trading Co., Ltd. (Shenzhen)", "深圳临风家居贸易有限公司"),
    },
    metrics: {},
    products,
    drafts,
    rules: ruleCatalog(config, lang),
    checks,
    review_items: demoReviewItems(zh),
    activity_log: demoActivity(zh),
    warnings: ["checks", "review", "detail"].includes(scenario)
      ? [
          {
            id: "msa-liability-escalation",
            severity: "warning",
            draft_id: "d-msa-liability-us",
            message: l(
              "Issue #2 (Zenith MSA) fails the hard-stop playbook check and needs GC escalation before approval.",
              "Issue #2（Zenith MSA）未通过硬性条款库检查，批准前需要升级 GC。",
            ),
            detail: l("Demo warning; no real contract files were read.", "演示提醒，未读取任何真实合同文件。"),
          },
        ]
      : [],
  };
  snapshot.metrics = computeMetrics(snapshot);
  return snapshot;
}
