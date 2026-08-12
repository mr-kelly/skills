const toNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const toText = (value, fallback = "") => {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
};

const fieldsOf = (record) => record?.fields || record || {};
const recordsFor = (records, key) => (records || []).filter((record) => record.baseKey === key);

const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 };
const STATUSES = ["draft", "queued", "sent", "opted-out"];
const EVIDENCE_TYPES = ["first-party", "public-directory", "market-signal"];
const EVIDENCE_RANK = { "first-party": 3, "public-directory": 2, "market-signal": 1 };

export const statusLabel = (status) =>
  ({ draft: "待审核", queued: "待发送", sent: "已触达", "opted-out": "不再联系" })[status] || "待审核";

export const confidenceLabel = (confidence) => ({ high: "高", medium: "中", low: "低" })[confidence] || "未知";

export const evidenceLabel = (type) =>
  ({ "first-party": "一方来源", "public-directory": "公开目录", "market-signal": "市场信号" })[type] || "未标注";

export function evidenceAgeDays(evidenceDate, today = new Date()) {
  if (!evidenceDate) return null;
  const captured = new Date(`${evidenceDate}T00:00:00Z`);
  if (Number.isNaN(captured.getTime())) return null;
  const midnight = new Date(`${today.toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.max(0, Math.round((midnight.getTime() - captured.getTime()) / 86_400_000));
}

const normalizeStatus = (value) => {
  const status = toText(value, "draft").toLowerCase();
  return STATUSES.includes(status) ? status : "draft";
};

const normalizeConfidence = (value) => {
  const confidence = toText(value, "medium").toLowerCase();
  return CONFIDENCE_RANK[confidence] ? confidence : "medium";
};

const normalizeEvidenceType = (value) => {
  const type = toText(value).toLowerCase();
  return EVIDENCE_TYPES.includes(type) ? type : "";
};

const PROFILE_REQUIREMENTS = [
  ["offerName", "产品或服务名称"],
  ["offerSummary", "产品或服务说明"],
];

const missingRequirementsFor = (profile) =>
  PROFILE_REQUIREMENTS.filter(([key]) => !profile[key]).map(([, label]) => label);

export function normalizeProfile(record) {
  const fields = fieldsOf(record);
  const profile = {
    id: record?.id || "",
    recordId: record?.id || "",
    sellerName: toText(fields.seller_name),
    offerName: toText(fields.offer_name),
    offerSummary: toText(fields.offer_summary),
    valueProposition: toText(fields.value_proposition),
    proofPoints: toText(fields.proof_points),
    targetIndustries: toText(fields.target_industries),
    targetRegions: toText(fields.target_regions),
    buyerRoles: toText(fields.buyer_roles),
    idealCustomer: toText(fields.ideal_customer),
    researchChannels: toText(fields.research_channels),
    collateralFile: toText(fields.collateral_file),
    fromEmail: toText(fields.from_email),
    smtpVaultKey: toText(fields.smtp_vault_key),
    updatedAt: toText(fields.updated_at),
    onboardingVersion: toNumber(fields.onboarding_version),
  };
  profile.missing = missingRequirementsFor(profile);
  profile.ready = profile.missing.length === 0;
  profile.mailReady = Boolean(profile.fromEmail && profile.smtpVaultKey);
  return profile;
}

export function normalizeLead(record) {
  const fields = fieldsOf(record);
  return {
    id: record?.id || toText(fields.email),
    email: toText(fields.email),
    companyKey: toText(fields.company_key),
    contactName: toText(fields.contact_name),
    role: toText(fields.role, "业务联系人"),
    sourceUrl: toText(fields.source_url),
    confidence: normalizeConfidence(fields.confidence),
  };
}

export function normalizeCompany(record) {
  const fields = fieldsOf(record);
  const key = toText(fields.key, record?.id || "");
  return {
    id: record?.id || key,
    recordId: record?.id || "",
    key,
    name: toText(fields.name, "未命名客户"),
    website: toText(fields.website),
    sourceUrl: toText(fields.source_url),
    industry: toText(fields.industry, "未分类"),
    region: toText(fields.region),
    companySize: toText(fields.company_size),
    matchScore: toNumber(fields.match_score),
    matchReason: toText(fields.match_reason, "尚未记录匹配理由。"),
    painSignals: toText(fields.pain_signals, "尚未记录业务信号。"),
    emailSubject: toText(fields.email_subject),
    emailBody: toText(fields.email_body),
    status: normalizeStatus(fields.status),
    sentTo: toText(fields.sent_to),
    approvedAt: toText(fields.approved_at),
    sentAt: toText(fields.sent_at),
    optedOutAt: toText(fields.opted_out_at),
    evidenceType: normalizeEvidenceType(fields.evidence_type),
    evidenceDate: toText(fields.evidence_date),
  };
}

export function pickBestLead(company, leads) {
  if (!leads.length) return null;
  if (company.sentTo) {
    const used = leads.find((lead) => lead.email === company.sentTo);
    if (used) return used;
  }
  return [...leads].sort((left, right) => CONFIDENCE_RANK[right.confidence] - CONFIDENCE_RANK[left.confidence])[0];
}

export function createSalesOutreachDesk(records) {
  const profile = normalizeProfile(recordsFor(records, "profile")[0]);
  const leads = recordsFor(records, "leads").map(normalizeLead);
  const leadsByCompany = new Map();
  for (const lead of leads) {
    if (!leadsByCompany.has(lead.companyKey)) leadsByCompany.set(lead.companyKey, []);
    leadsByCompany.get(lead.companyKey).push(lead);
  }

  const companies = recordsFor(records, "companies")
    .map(normalizeCompany)
    .sort(
      (left, right) =>
        (EVIDENCE_RANK[right.evidenceType] || 0) - (EVIDENCE_RANK[left.evidenceType] || 0) ||
        right.matchScore - left.matchScore ||
        left.name.localeCompare(right.name, "zh-CN"),
    )
    .map((company, index) => {
      const companyLeads = (leadsByCompany.get(company.key) || []).sort(
        (left, right) => CONFIDENCE_RANK[right.confidence] - CONFIDENCE_RANK[left.confidence],
      );
      return {
        ...company,
        ref: `#${index + 1}`,
        leads: companyLeads,
        bestLead: pickBestLead(company, companyLeads),
        draftReady: Boolean(company.emailSubject && company.emailBody),
      };
    });

  const toReview = companies.filter((company) => company.status === "draft");
  const sent = companies.filter((company) => company.status === "sent");
  const blocked = toReview.filter((company) => !company.bestLead || !company.draftReady);

  return {
    profile,
    companies,
    leads,
    buckets: { all: companies, "to-send": toReview, sent },
    counts: {
      all: companies.length,
      "to-send": toReview.length,
      sent: sent.length,
      queued: companies.filter((company) => company.status === "queued").length,
      "opted-out": companies.filter((company) => company.status === "opted-out").length,
    },
    attention: {
      toSend: toReview.length,
      blocked: blocked.length,
      profileReady: profile.ready,
      profileMissing: profile.missing,
    },
  };
}

export function buildApprovalFields(company, email, now) {
  if (!email) throw new Error("MISSING_CONTACT: 这家公司还没有可核验的业务邮箱");
  if (!company.emailSubject || !company.emailBody) throw new Error("MISSING_DRAFT: 邮件主题或正文为空");
  if (company.status === "sent") throw new Error("ALREADY_SENT: 这家公司已经触达，不能重复发送首封邮件");
  if (company.status === "opted-out") throw new Error("OPTED_OUT: 这家公司已要求不再联系");
  return { status: "queued", "sent-to": email, "approved-at": now };
}

export function buildProfileFields(input, now, options = {}) {
  const fields = {
    "seller-name": toText(input.sellerName, "我"),
    "offer-name": toText(input.offerName),
    "offer-summary": toText(input.offerSummary),
    "value-proposition": toText(input.valueProposition),
    "proof-points": toText(input.proofPoints),
    "target-industries": toText(input.targetIndustries),
    "target-regions": toText(input.targetRegions),
    "buyer-roles": toText(input.buyerRoles),
    "ideal-customer": toText(input.idealCustomer),
    "research-channels": toText(input.researchChannels),
    "collateral-file": toText(input.collateralFile),
    "from-email": toText(input.fromEmail),
    "updated-at": now,
  };
  if (Number.isInteger(options.onboardingVersion) && options.onboardingVersion > 0) {
    fields["onboarding-version"] = options.onboardingVersion;
  }
  return fields;
}

export function missingProfileRequirements(input) {
  return missingRequirementsFor({ offerName: toText(input.offerName), offerSummary: toText(input.offerSummary) });
}

const NEXT_STEPS = [
  {
    when: (desk) => !desk.profile.ready,
    command: "/kelly-sales-outreach profile",
    title: "先录入产品与服务",
    detail: (desk) => `还缺 ${desk.profile.missing.join("、")}。把官网、产品说明或几段介绍交给 Agent 即可。`,
  },
  {
    when: (desk) => desk.counts.all === 0,
    command: "/kelly-sales-outreach research",
    title: "开始找目标客户",
    detail: () => "Agent 会先推导 ICP，再从公开来源找公司、决策角色和可核验联系方式。",
  },
  {
    when: (desk) => desk.attention.blocked > 0,
    command: "/kelly-sales-outreach research",
    title: "补齐被阻塞的线索",
    detail: (desk) => `${desk.attention.blocked} 家缺联系方式或定制草稿，重新研究不会覆盖已批准或已发送记录。`,
  },
  {
    when: (desk) => desk.counts.queued > 0 && !desk.profile.mailReady,
    command: "/kelly-sales-outreach send",
    title: "配置发件邮箱",
    detail: (desk) => `${desk.counts.queued} 封已批准。发件授权码只写入 Vault，不进入页面。`,
  },
  {
    when: (desk) => desk.counts.queued > 0,
    command: "node scripts/send_emails.mjs",
    title: "发送已批准的邮件",
    detail: (desk) => `${desk.counts.queued} 封等待可信脚本发送；默认先预演清单。`,
  },
  {
    when: (desk) => desk.counts["to-send"] > 0,
    command: "",
    title: "逐条审核首封邮件",
    detail: (desk) => `${desk.counts["to-send"]} 家等待你确认对象、证据和文案。`,
  },
];

export function nextStep(desk) {
  const step = NEXT_STEPS.find((candidate) => candidate.when(desk));
  return step ? { command: step.command, title: step.title, detail: step.detail(desk) } : null;
}
