export const appConfig = {
  appId: "kelly-jobhunt",
  appName: "Kelly JobHunt",
  deployment: "cloud",
  locale: "zh-CN",
  readOnly: false,
  spaceId: "",
  schemaVersion: 3,
  folder: {
    name: "Kelly 求职直投",
    description: "Job-search profile, target companies, and outreach state",
    nodeId: "",
    slug: "kelly-jobhunt",
  },
  airApp: {
    name: "Kelly JobHunt",
    slug: "kelly-jobhunt-app",
    resourceKey: "airapp",
  },
  bases: [
    {
      key: "profile",
      name: "求职档案",
      slug: "jobhunt-profile-v1",
      description: "One job seeker profile that drives company search and email drafting",
      nodeId: "",
      baseId: "",
      fields: [
        { slug: "name", name: "求职人", type: "text", required: true },
        { slug: "target-role", name: "目标岗位", type: "text", required: true },
        { slug: "locations", name: "意向城市", type: "text", required: false },
        { slug: "industries", name: "意向行业", type: "text", required: false },
        { slug: "highlights", name: "自我介绍", type: "longtext", required: false },
        { slug: "resume-file", name: "简历文件", type: "text", required: false },
        { slug: "from-email", name: "发件邮箱", type: "text", required: false },
        { slug: "updated-at", name: "更新时间", type: "date", required: false },
        // Appended in schema v2. New fields must go after the existing ones so
        // the additive migration in resource-provisioning.js can add them to a
        // Base that was created at v1 without touching what is already there.
        { slug: "job-boards", name: "招聘渠道", type: "text", required: false },
        { slug: "resume-source", name: "简历原文", type: "longtext", required: false },
        { slug: "smtp-vault-key", name: "SMTP 凭据引用", type: "text", required: false },
      ],
    },
    {
      key: "companies",
      name: "目标公司",
      slug: "jobhunt-companies-v1",
      description: "One row per target company: match evidence, drafted email, and outreach status",
      nodeId: "",
      baseId: "",
      fields: [
        { slug: "name", name: "公司名称", type: "text", required: true },
        { slug: "key", name: "公司标识", type: "text", required: true },
        { slug: "website", name: "官网", type: "text", required: false },
        { slug: "source-url", name: "来源链接", type: "text", required: false },
        { slug: "industry", name: "行业", type: "text", required: false },
        { slug: "match-score", name: "匹配度", type: "number", required: false },
        { slug: "match-reason", name: "匹配理由", type: "longtext", required: false },
        { slug: "email-subject", name: "邮件主题", type: "text", required: false },
        { slug: "email-body", name: "邮件正文", type: "longtext", required: false },
        { slug: "status", name: "状态", type: "text", required: false },
        { slug: "sent-to", name: "实发邮箱", type: "text", required: false },
        { slug: "approved-at", name: "批准时间", type: "date", required: false },
        { slug: "sent-at", name: "发送时间", type: "date", required: false },
        // Appended in schema v3. A match score alone cannot say whether a role
        // is still open: an aggregator listing from March and a role on the
        // company's own careers page today score the same and are not the same
        // lead. Must stay after the v2 fields for the additive migration.
        { slug: "evidence-type", name: "证据类型", type: "text", required: false },
        { slug: "evidence-date", name: "抓取日期", type: "date", required: false },
      ],
    },
    {
      key: "leads",
      name: "联系邮箱",
      slug: "jobhunt-leads-v1",
      description: "Candidate contact addresses discovered for a company, several per company",
      nodeId: "",
      baseId: "",
      fields: [
        { slug: "email", name: "邮箱", type: "text", required: true },
        { slug: "company-key", name: "所属公司", type: "text", required: true },
        { slug: "role", name: "角色", type: "text", required: false },
        { slug: "source-url", name: "来源链接", type: "text", required: false },
        { slug: "confidence", name: "置信度", type: "text", required: false },
      ],
    },
  ],
  permissions: {
    readProcedures: ["nodes.list", "nodes.get", "bases.get", "records.list"],
    setupProcedures: ["nodes.createChangeRequest", "nodes.updateMetadata"],
    writeProcedures: ["bases.createChangeRequest", "records.changeRequest"],
  },
};
