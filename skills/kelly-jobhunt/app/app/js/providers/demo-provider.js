const record = (id, baseKey, fields) => ({ id, baseKey, fields });

const mail = (company, opening) =>
  `您好，

我是陈默，五年 B 端产品经理，正在寻找${company}这类把复杂业务做薄的团队。

${opening}

我在上一段经历中负责的协作工作台，把跨部门审批链路从平均 3.4 天压到 9 小时，季度活跃团队数从 120 增至 460。我习惯先蹲到一线看真实操作，再决定要不要加功能。

简历见附件。如果方向合适，我可以先做一份贵司现有产品的拆解再聊。

顺祝商祺
陈默`;

const records = [
  record("profile-self", "profile", {
    name: "陈默",
    target_role: "B 端产品经理",
    locations: "杭州 / 上海 / 远程",
    industries: "企业服务、AI 基础设施、数字医疗",
    highlights:
      "五年 B 端产品经验，主导过协作工作台与审批中台两条线。擅长把模糊的跨部门流程拆成可度量的操作步骤，做过 0-1 也做过 1-10。熟悉 SQL 与埋点分析，能自己跑数据而不依赖分析师排期。",
    resume_file: "陈默-B端产品经理-2026.pdf",
    from_email: "chenmo.pm@example.com",
    updated_at: "2026-08-10",
  }),

  record("company-lanxi", "companies", {
    name: "蓝汐科技",
    key: "lanxi-tech",
    website: "lanxi-tech.example.com",
    source_url: "https://lanxi-tech.example.com/careers",
    industry: "企业协作 SaaS",
    match_score: 92,
    match_reason:
      "主打跨部门协作工作台，与候选人上一段负责的产品几乎同一战场；招聘页明确在招 B 端产品经理，且写了「有审批流经验优先」。团队 80 人，产品线单一，产品经理话语权大。",
    email_subject: "应聘 B 端产品经理 — 陈默（协作工作台 / 审批中台）",
    email_body: mail("蓝汐科技", "看到贵司招聘页写着「有审批流经验优先」，这恰好是我过去两年每天在处理的问题。"),
    status: "draft",
    sent_to: "",
    approved_at: "",
    sent_at: "",
  }),
  record("company-hetu", "companies", {
    name: "河图智能",
    key: "hetu-ai",
    website: "hetu-ai.example.com",
    source_url: "https://hetu-ai.example.com/about/jobs",
    industry: "AI 基础设施",
    match_score: 89,
    match_reason:
      "在做面向企业的模型编排平台，用户是研发与业务混合团队，需要能把技术能力翻译成业务流程的产品经理。近期完成 B 轮，团队正在扩产品线。",
    email_subject: "应聘产品经理 — 陈默（把模型能力接进业务流程）",
    email_body: mail("河图智能", "贵司的模型编排平台面向的是研发与业务混合的团队，这类「翻译工作」是我最擅长的部分。"),
    status: "draft",
    sent_to: "",
    approved_at: "",
    sent_at: "",
  }),
  record("company-xingye", "companies", {
    name: "星野出行",
    key: "xingye-mobility",
    website: "xingye-mobility.example.com",
    source_url: "https://www.example-jobs.com/xingye-mobility",
    industry: "出行平台",
    match_score: 85,
    match_reason: "企业用车与差旅报销业务线在招产品，报销审批与候选人做过的审批中台高度重合。总部在杭州，通勤成本低。",
    email_subject: "应聘产品经理 — 陈默（企业差旅与报销审批）",
    email_body: mail("星野出行", "贵司的企业差旅报销线，本质上是一条高频、多角色、强合规的审批链路。"),
    status: "draft",
    sent_to: "",
    approved_at: "",
    sent_at: "",
  }),
  record("company-muhe", "companies", {
    name: "木荷医疗",
    key: "muhe-medtech",
    website: "muhe-medtech.example.com",
    source_url: "https://muhe-medtech.example.com/join",
    industry: "数字医疗",
    match_score: 81,
    match_reason:
      "做医院内部的科室协同系统，客户是三甲医院，流程复杂度高。候选人写了对数字医疗的兴趣，但缺行业经验，是偏挑战的一条线。",
    email_subject: "应聘产品经理 — 陈默（复杂流程产品化）",
    email_body: mail("木荷医疗", "科室之间的协同，和我做过的跨部门审批是同一类问题：角色多、例外多、口头约定多。"),
    status: "draft",
    sent_to: "",
    approved_at: "",
    sent_at: "",
  }),
  record("company-chaoxi", "companies", {
    name: "潮汐云",
    key: "chaoxi-cloud",
    website: "chaoxi-cloud.example.com",
    source_url: "https://chaoxi-cloud.example.com/careers/pm",
    industry: "云计算",
    match_score: 78,
    match_reason: "控制台与计费体系在招产品经理，偏平台型工作。规模较大，产品经理分工更细，成长速度可能不如小团队。",
    email_subject: "应聘产品经理 — 陈默（控制台与计费体系）",
    email_body: mail("潮汐云", "控制台是云产品唯一的门面，它的信息密度决定了客户能不能自助解决问题。"),
    status: "queued",
    sent_to: "hr@chaoxi-cloud.example.com",
    approved_at: "2026-08-11",
    sent_at: "",
  }),
  record("company-qingyou", "companies", {
    name: "青柚教育",
    key: "qingyou-edu",
    website: "qingyou-edu.example.com",
    source_url: "https://qingyou-edu.example.com/jobs",
    industry: "在线教育",
    match_score: 74,
    match_reason: "面向机构的教务管理系统，B 端属性明确。行业整体处于收缩期，作为备选投递。",
    email_subject: "应聘产品经理 — 陈默（教务管理 B 端方向）",
    email_body: mail("青柚教育", "教务系统的排课与结算，是典型的「规则写不完」的场景。"),
    status: "sent",
    sent_to: "recruit@qingyou-edu.example.com",
    approved_at: "2026-08-09",
    sent_at: "2026-08-09",
  }),
  record("company-lanshan", "companies", {
    name: "岚山金融科技",
    key: "lanshan-fintech",
    website: "lanshan-fintech.example.com",
    source_url: "https://lanshan-fintech.example.com/careers",
    industry: "金融科技",
    match_score: 71,
    match_reason: "风控策略配置平台在招产品，强合规场景。要求有金融背景，候选人这一项不满足，属于试投。",
    email_subject: "应聘产品经理 — 陈默（策略配置平台）",
    email_body: mail("岚山金融科技", "把风控策略从代码里搬到配置界面上，是一件既要懂业务又要克制的事。"),
    status: "sent",
    sent_to: "hr@lanshan-fintech.example.com",
    approved_at: "2026-08-08",
    sent_at: "2026-08-08",
  }),
  record("company-maimang", "companies", {
    name: "麦芒零售",
    key: "maimang-retail",
    website: "maimang-retail.example.com",
    source_url: "https://www.example-jobs.com/maimang-retail",
    industry: "零售数字化",
    match_score: 66,
    match_reason: "门店运营系统在招产品经理，业务侧偏重线下履约。官网与招聘页均未公开任何邮箱，需要人工再找一次。",
    email_subject: "应聘产品经理 — 陈默（门店运营系统）",
    email_body: mail("麦芒零售", "线下履约的产品最怕纸上谈兵，我习惯先去门店站两天再动笔。"),
    status: "draft",
    sent_to: "",
    approved_at: "",
    sent_at: "",
  }),
  record("company-xiliu", "companies", {
    name: "溪流传媒",
    key: "xiliu-media",
    website: "xiliu-media.example.com",
    source_url: "https://xiliu-media.example.com/hiring",
    industry: "内容平台",
    match_score: 61,
    match_reason: "创作者后台在招产品，C 端属性更强，与候选人的 B 端积累重合度低。列在末位作为兜底。",
    email_subject: "应聘产品经理 — 陈默（创作者后台）",
    email_body: mail("溪流传媒", "创作者后台其实是一套面向个体户的 B 端产品，只是用户不这么称呼自己。"),
    status: "draft",
    sent_to: "",
    approved_at: "",
    sent_at: "",
  }),

  record("lead-lanxi-hr", "leads", {
    email: "hr@lanxi-tech.example.com",
    company_key: "lanxi-tech",
    role: "HR 邮箱",
    source_url: "https://lanxi-tech.example.com/careers",
    confidence: "high",
  }),
  record("lead-lanxi-jobs", "leads", {
    email: "jobs@lanxi-tech.example.com",
    company_key: "lanxi-tech",
    role: "招聘通用",
    source_url: "https://lanxi-tech.example.com/contact",
    confidence: "medium",
  }),
  record("lead-lanxi-pm", "leads", {
    email: "wang.product@lanxi-tech.example.com",
    company_key: "lanxi-tech",
    role: "产品部负责人",
    source_url: "https://www.example-social.com/in/wang-product",
    confidence: "low",
  }),
  record("lead-hetu-hr", "leads", {
    email: "talent@hetu-ai.example.com",
    company_key: "hetu-ai",
    role: "HR 邮箱",
    source_url: "https://hetu-ai.example.com/about/jobs",
    confidence: "high",
  }),
  record("lead-hetu-general", "leads", {
    email: "hello@hetu-ai.example.com",
    company_key: "hetu-ai",
    role: "通用",
    source_url: "https://hetu-ai.example.com",
    confidence: "low",
  }),
  record("lead-xingye-hr", "leads", {
    email: "recruit@xingye-mobility.example.com",
    company_key: "xingye-mobility",
    role: "HR 邮箱",
    source_url: "https://www.example-jobs.com/xingye-mobility",
    confidence: "medium",
  }),
  record("lead-muhe-hr", "leads", {
    email: "hr@muhe-medtech.example.com",
    company_key: "muhe-medtech",
    role: "HR 邮箱",
    source_url: "https://muhe-medtech.example.com/join",
    confidence: "high",
  }),
  record("lead-muhe-office", "leads", {
    email: "office@muhe-medtech.example.com",
    company_key: "muhe-medtech",
    role: "通用",
    source_url: "https://muhe-medtech.example.com/contact",
    confidence: "low",
  }),
  record("lead-chaoxi-hr", "leads", {
    email: "hr@chaoxi-cloud.example.com",
    company_key: "chaoxi-cloud",
    role: "HR 邮箱",
    source_url: "https://chaoxi-cloud.example.com/careers/pm",
    confidence: "high",
  }),
  record("lead-chaoxi-campus", "leads", {
    email: "campus@chaoxi-cloud.example.com",
    company_key: "chaoxi-cloud",
    role: "校招",
    source_url: "https://chaoxi-cloud.example.com/careers",
    confidence: "low",
  }),
  record("lead-qingyou-hr", "leads", {
    email: "recruit@qingyou-edu.example.com",
    company_key: "qingyou-edu",
    role: "HR 邮箱",
    source_url: "https://qingyou-edu.example.com/jobs",
    confidence: "high",
  }),
  record("lead-lanshan-hr", "leads", {
    email: "hr@lanshan-fintech.example.com",
    company_key: "lanshan-fintech",
    role: "HR 邮箱",
    source_url: "https://lanshan-fintech.example.com/careers",
    confidence: "high",
  }),
  record("lead-lanshan-tech", "leads", {
    email: "tech-hire@lanshan-fintech.example.com",
    company_key: "lanshan-fintech",
    role: "技术线招聘",
    source_url: "https://lanshan-fintech.example.com/careers",
    confidence: "medium",
  }),
  record("lead-xiliu-hr", "leads", {
    email: "join@xiliu-media.example.com",
    company_key: "xiliu-media",
    role: "HR 邮箱",
    source_url: "https://xiliu-media.example.com/hiring",
    confidence: "medium",
  }),
];

const applyFields = (target, fields) => {
  for (const [slug, value] of Object.entries(fields)) target.fields[slug.replaceAll("-", "_")] = value;
};

export const demoProvider = {
  name: "demo",
  async getState() {
    return {
      provider: {
        ok: true,
        name: "demo",
        mode: "deterministic_preview",
        readOnly: true,
        pendingReview: false,
        asOf: "2026-08-11 09:20 CST",
      },
      records,
      pageInfo: {},
    };
  },
  async saveProfile({ fields }) {
    applyFields(
      records.find((item) => item.baseKey === "profile"),
      fields,
    );
    return { merged: true, demo: true };
  },
  async updateCompany({ recordId, fields }) {
    const target = records.find((item) => item.id === recordId);
    if (!target) throw new Error("SCHEMA_INCOMPLETE: companies");
    applyFields(target, fields);
    return { merged: true, demo: true };
  },
};
