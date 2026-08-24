const record = (id, baseKey, fields) => ({ id, baseKey, fields });

const mail = (company, signal) => `您好，

留意到${company}${signal}。我们做的「澄明 AI 质检」会抽检全部客服会话，自动定位高风险服务问题，并把可执行的改进项推给运营负责人。

目前服务团队通常在两周内把人工抽检时间降低 70% 以上，同时保留每条结论的原始会话证据。如果这正好是你们在解决的问题，我可以先基于公开信息做一份 3 页的质检机会清单，不需要先开采购流程。

方便下周用 20 分钟看看是否值得继续吗？

Kelly`;

const records = [
  record("profile-self", "profile", {
    seller_name: "Kelly",
    offer_name: "澄明 AI 客服质检",
    offer_summary:
      "面向客服团队的全量会话质检与改进工作台，自动识别合规、服务和转化问题，并把证据与改进项交给运营负责人。",
    value_proposition: "从 1%-3% 人工抽检提升到全量覆盖，在不增加质检人力的情况下更早发现服务风险。",
    proof_points: "试点客户两周内人工抽检时间下降 73%，高风险会话发现量提升 4.6 倍。",
    target_industries: "电商、在线教育、保险、连锁零售",
    target_regions: "中国大陆",
    buyer_roles: "客服运营负责人、客户体验负责人、合规负责人",
    ideal_customer: "200 人以上、客服团队 20-300 人、已有在线客服或呼叫中心、正经历增长或合规压力的企业。",
    research_channels: "公司官网、招聘页、新闻、行业目录、公开案例与活动名录",
    collateral_file: "澄明-AI客服质检-one-pager.pdf",
    from_email: "kelly@example.com",
    smtp_vault_key: "SMTP_HOST,SMTP_PORT,SMTP_USER,SMTP_PASS",
    updated_at: "2026-08-12",
    onboarding_version: 1,
  }),
  record("company-miaogou", "companies", {
    name: "秒购电商",
    key: "miaogou",
    website: "https://miaogou.example.com",
    source_url: "https://miaogou.example.com/jobs/customer-service-ops",
    industry: "综合电商",
    region: "上海",
    company_size: "1000-5000 人",
    match_score: 94,
    match_reason: "客服规模大，公开招聘质检运营，职责明确包含抽检覆盖率和服务风险闭环。",
    pain_signals: "近期招聘 3 名客服质检运营；职位说明提到当前抽检覆盖不足与旺季投诉压力。",
    email_subject: "秒购客服全量质检：先做一份公开信息机会清单",
    email_body: mail("秒购", "正在扩充客服质检运营团队，且职位说明提到抽检覆盖不足"),
    status: "draft",
    evidence_type: "first-party",
    evidence_date: "2026-08-12",
  }),
  record("company-qingke", "companies", {
    name: "青课在线",
    key: "qingke",
    website: "https://qingke.example.com",
    source_url: "https://qingke.example.com/news/service-upgrade",
    industry: "在线教育",
    region: "北京",
    company_size: "500-1000 人",
    match_score: 89,
    match_reason: "公布服务升级计划，课程顾问与售后会话量大，客户体验负责人是明确买方。",
    pain_signals: "官方新闻宣布本季度升级服务体验并增设客户体验负责人。",
    email_subject: "青课服务升级计划里的全量会话质检",
    email_body: mail("青课", "刚宣布本季度服务体验升级计划"),
    status: "draft",
    evidence_type: "first-party",
    evidence_date: "2026-08-11",
  }),
  record("company-anxin", "companies", {
    name: "安心保险经纪",
    key: "anxin",
    website: "https://anxin.example.com",
    source_url: "https://directory.example.com/insurance/anxin",
    industry: "保险经纪",
    region: "深圳",
    company_size: "200-500 人",
    match_score: 84,
    match_reason: "保险客服有强合规需求，公司规模与目标 ICP 一致，但目前只有公开目录信号。",
    pain_signals: "公开目录显示拥有电话销售与售后团队，暂未发现近期质检项目的一方证据。",
    email_subject: "保险客服合规质检的全量覆盖思路",
    email_body: mail("安心保险经纪", "拥有电话销售与售后服务团队"),
    status: "queued",
    sent_to: "service-ops@anxin.example.com",
    approved_at: "2026-08-12",
    evidence_type: "public-directory",
    evidence_date: "2026-08-10",
  }),
  record("company-luyin", "companies", {
    name: "绿印家居",
    key: "luyin",
    website: "https://luyin.example.com",
    source_url: "https://news.example.com/luyin-service-center",
    industry: "连锁零售",
    region: "杭州",
    company_size: "1000-5000 人",
    match_score: 79,
    match_reason: "新建全国客服中心带来流程与质量管理需求，符合扩张期购买信号。",
    pain_signals: "新闻报道新客服中心本月启用，计划承接全国门店售后。",
    email_subject: "新客服中心上线后的质检覆盖",
    email_body: mail("绿印家居", "新的全国客服中心刚刚启用"),
    status: "sent",
    sent_to: "cx@luyin.example.com",
    approved_at: "2026-08-09",
    sent_at: "2026-08-10",
    evidence_type: "market-signal",
    evidence_date: "2026-08-08",
  }),
  record("company-yunhe", "companies", {
    name: "云禾生活",
    key: "yunhe",
    website: "https://yunhe.example.com",
    source_url: "https://yunhe.example.com/about",
    industry: "新消费",
    region: "广州",
    company_size: "200-500 人",
    match_score: 72,
    match_reason: "客服规模可能符合，但公开信息不足，需要补联系人与当前业务信号。",
    pain_signals: "只确认到多渠道售后服务，尚无明确采购或扩张信号。",
    email_subject: "多渠道售后会话的统一质检",
    email_body: mail("云禾生活", "正在同时运营多个售后渠道"),
    status: "draft",
    evidence_type: "first-party",
    evidence_date: "2026-08-07",
  }),
  record("lead-miaogou", "leads", {
    email: "service-ops@miaogou.example.com",
    company_key: "miaogou",
    contact_name: "客服运营团队",
    role: "客服运营",
    source_url: "https://miaogou.example.com/contact",
    confidence: "high",
  }),
  record("lead-qingke", "leads", {
    email: "cx@qingke.example.com",
    company_key: "qingke",
    contact_name: "客户体验团队",
    role: "客户体验",
    source_url: "https://qingke.example.com/contact",
    confidence: "high",
  }),
  record("lead-anxin", "leads", {
    email: "service-ops@anxin.example.com",
    company_key: "anxin",
    role: "服务运营",
    source_url: "https://directory.example.com/insurance/anxin",
    confidence: "medium",
  }),
  record("lead-luyin", "leads", {
    email: "cx@luyin.example.com",
    company_key: "luyin",
    role: "客户体验",
    source_url: "https://luyin.example.com/contact",
    confidence: "high",
  }),
];

const applyFields = (target, fields) => {
  for (const [slug, value] of Object.entries(fields)) target.fields[slug.replaceAll("-", "_")] = value;
};

export const demoProvider = {
  name: "demo",
  async getReadinessState() {
    return this.getState();
  },
  async getState() {
    return {
      provider: {
        ok: true,
        name: "demo",
        mode: "deterministic_preview",
        readOnly: true,
        pendingReview: false,
        asOf: "2026-08-12 14:00 CST",
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
