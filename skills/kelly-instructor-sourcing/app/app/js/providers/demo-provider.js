const record = (id, baseKey, fields) => ({ id, baseKey, fields });

const records = [
  record("criteria-self", "criteria", {
    role_keywords: "财务/产品/运营 讲师，10 年以上行业经验",
    experience_filter: "10 年以上相关行业经验，至少 2 年授课或企业内训经验",
    activity_filter: "近 12 个月内有公开可见的授课、直播或分享活动",
    endorsement_rubric: "曾在知名机构任职或获得行业协会/认证背书，公开资料可核实，无明显履历夸大。",
    expertise_rubric: "对所授主题有可验证的深度（案例、方法论、公开发表）与广度（能覆盖相邻场景）。",
    teaching_rubric: "有清晰的课程结构与案例讲解能力，过往学员或客户有可查的正面反馈。",
    qualify_threshold: 75,
    updated_at: "2026-08-10",
    onboarding_version: 1,
  }),
  record("candidate-wang", "candidates", {
    name: "王建国",
    platform_headline: "10年财务培训讲师",
    search_context: "关键词：财务 讲师；经验筛选：10年以上",
    endorsement_score: 82,
    expertise_score: 88,
    teaching_score: 79,
    overall_score: 83,
    match_notes: "曾在大型制造企业任财务总监，平台主页列出多场企业内训经历，案例具体可核实。",
    status: "qualified",
    wechat_added_at: "",
  }),
  record("candidate-li", "candidates", {
    name: "李梅",
    platform_headline: "资深产品经理转型讲师",
    search_context: "关键词：产品 讲师；活跃度筛选：近12个月",
    endorsement_score: 74,
    expertise_score: 80,
    teaching_score: 85,
    overall_score: 80,
    match_notes: "近半年多次公开分享产品方法论，学员评价提到讲解节奏清晰、案例贴近实战。",
    status: "qualified",
    wechat_added_at: "2026-08-05",
  }),
  record("candidate-zhang", "candidates", {
    name: "张伟",
    platform_headline: "连锁餐饮运营与培训负责人",
    search_context: "关键词：连锁 运营 讲师",
    endorsement_score: 90,
    expertise_score: 84,
    teaching_score: 88,
    overall_score: 87,
    match_notes: "有多年连锁品牌运营培训负责人经历，公开履历与所在公司官网信息一致。",
    status: "connected",
    wechat_added_at: "2026-08-02",
    logged_at: "2026-08-03",
  }),
  record("candidate-zhao", "candidates", {
    name: "赵敏",
    platform_headline: "企业内训与领导力发展顾问",
    search_context: "关键词：领导力 内训 讲师",
    endorsement_score: 58,
    expertise_score: 62,
    teaching_score: 55,
    overall_score: 58,
    match_notes: "公开资料较少，仅有一份未标注机构的自述简介，暂无可核实的授课记录。",
    status: "not-qualified",
    logged_at: "2026-08-04",
  }),
  record("candidate-chen", "candidates", {
    name: "陈晨",
    platform_headline: "跨境电商运营实战讲师",
    search_context: "关键词：跨境电商 讲师；活跃度筛选：近12个月",
    endorsement_score: "",
    expertise_score: "",
    teaching_score: "",
    overall_score: "",
    match_notes: "刚从搜索结果中收录，尚未评分。",
    status: "screening",
  }),
  record("candidate-sun", "candidates", {
    name: "孙丽",
    platform_headline: "客户服务体系与话术训练讲师",
    search_context: "关键词：客户服务 培训 讲师",
    endorsement_score: 77,
    expertise_score: 71,
    teaching_score: 76,
    overall_score: 75,
    match_notes: "有公开的客服培训课程大纲与两段可查的分享视频，三项评分刚好达线，待下结论。",
    status: "screening",
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
  async saveCriteria({ fields }) {
    applyFields(
      records.find((item) => item.baseKey === "criteria"),
      fields,
    );
    return { merged: true, demo: true };
  },
  async updateCandidate({ recordId, fields }) {
    const target = records.find((item) => item.id === recordId);
    if (!target) throw new Error("SCHEMA_INCOMPLETE: candidates");
    applyFields(target, fields);
    return { merged: true, demo: true };
  },
};
