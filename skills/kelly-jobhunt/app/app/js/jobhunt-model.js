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

const fieldsOf = (record) => record.fields || record;
const recordsFor = (records, key) => (records || []).filter((record) => record.baseKey === key);

const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 };
const STATUSES = ["draft", "queued", "sent"];

export const statusLabel = (status) => ({ draft: "待发送", queued: "排队中", sent: "已发出" })[status] || "待发送";

export const confidenceLabel = (confidence) => ({ high: "高", medium: "中", low: "低" })[confidence] || "未知";

const normalizeStatus = (value) => {
  const status = toText(value, "draft").toLowerCase();
  return STATUSES.includes(status) ? status : "draft";
};

const normalizeConfidence = (value) => {
  const confidence = toText(value, "medium").toLowerCase();
  return CONFIDENCE_RANK[confidence] ? confidence : "medium";
};

// The profile drives both company search and email drafting. Any missing item
// here makes the outreach queue meaningless, so it is an attention state, not a
// silent default.
const PROFILE_REQUIREMENTS = [
  ["targetRole", "目标岗位"],
  ["highlights", "自我介绍"],
  ["resumeFile", "简历附件"],
  ["fromEmail", "发件邮箱"],
];

export function normalizeProfile(record) {
  const fields = record ? fieldsOf(record) : {};
  const profile = {
    id: record?.id || "",
    recordId: record?.id || "",
    name: toText(fields.name),
    targetRole: toText(fields.target_role),
    locations: toText(fields.locations),
    industries: toText(fields.industries),
    highlights: toText(fields.highlights),
    resumeFile: toText(fields.resume_file),
    fromEmail: toText(fields.from_email),
    updatedAt: toText(fields.updated_at),
  };
  profile.missing = PROFILE_REQUIREMENTS.filter(([key]) => !profile[key]).map(([, label]) => label);
  profile.ready = profile.missing.length === 0;
  return profile;
}

export function normalizeLead(record) {
  const fields = fieldsOf(record);
  return {
    id: record.id || toText(fields.email),
    email: toText(fields.email),
    companyKey: toText(fields.company_key),
    role: toText(fields.role, "通用"),
    sourceUrl: toText(fields.source_url),
    confidence: normalizeConfidence(fields.confidence),
  };
}

export function normalizeCompany(record) {
  const fields = fieldsOf(record);
  const key = toText(fields.key, record.id || "");
  return {
    id: record.id || key,
    recordId: record.id || "",
    key,
    name: toText(fields.name, "未命名公司"),
    website: toText(fields.website),
    sourceUrl: toText(fields.source_url),
    industry: toText(fields.industry, "未分类"),
    matchScore: toNumber(fields.match_score),
    matchReason: toText(fields.match_reason, "尚未记录匹配理由。"),
    emailSubject: toText(fields.email_subject),
    emailBody: toText(fields.email_body),
    status: normalizeStatus(fields.status),
    sentTo: toText(fields.sent_to),
    approvedAt: toText(fields.approved_at),
    sentAt: toText(fields.sent_at),
  };
}

// One company sends one email. Extra addresses stay available as fallbacks so a
// bounced send can be retried without another search, but they are never a
// reason to mail the same company twice.
export function pickBestLead(company, leads) {
  if (!leads.length) return null;
  if (company.sentTo) {
    const used = leads.find((lead) => lead.email === company.sentTo);
    if (used) return used;
  }
  return [...leads].sort((left, right) => CONFIDENCE_RANK[right.confidence] - CONFIDENCE_RANK[left.confidence])[0];
}

export function createJobhuntDesk(records) {
  const profile = normalizeProfile(recordsFor(records, "profile")[0]);
  const leads = recordsFor(records, "leads").map(normalizeLead);
  const leadsByCompany = new Map();
  for (const lead of leads) {
    if (!leadsByCompany.has(lead.companyKey)) leadsByCompany.set(lead.companyKey, []);
    leadsByCompany.get(lead.companyKey).push(lead);
  }

  const companies = recordsFor(records, "companies")
    .map(normalizeCompany)
    .sort((left, right) => right.matchScore - left.matchScore || left.name.localeCompare(right.name, "zh-CN"))
    .map((company, index) => {
      const companyLeads = (leadsByCompany.get(company.key) || []).sort(
        (left, right) => CONFIDENCE_RANK[right.confidence] - CONFIDENCE_RANK[left.confidence],
      );
      return {
        ...company,
        // Stable per-batch reference so "改第 3 条" resolves the same row in chat.
        ref: `#${index + 1}`,
        leads: companyLeads,
        bestLead: pickBestLead(company, companyLeads),
        draftReady: Boolean(company.emailSubject && company.emailBody),
      };
    });

  const toSend = companies.filter((company) => company.status === "draft");
  const sent = companies.filter((company) => company.status !== "draft");
  const blocked = toSend.filter((company) => !company.bestLead || !company.draftReady);

  return {
    profile,
    companies,
    leads,
    buckets: { all: companies, "to-send": toSend, sent },
    counts: { all: companies.length, "to-send": toSend.length, sent: sent.length },
    attention: {
      toSend: toSend.length,
      blocked: blocked.length,
      profileReady: profile.ready,
      profileMissing: profile.missing,
    },
  };
}

export function buildApprovalFields(company, email, now) {
  if (!email) throw new Error("MISSING_CONTACT: 这家公司还没有可用邮箱");
  if (!company.emailSubject || !company.emailBody) throw new Error("MISSING_DRAFT: 邮件主题或正文为空");
  return {
    status: "queued",
    "sent-to": email,
    "approved-at": now,
  };
}

export function buildProfileFields(input, now) {
  return {
    name: toText(input.name, "我"),
    "target-role": toText(input.targetRole),
    locations: toText(input.locations),
    industries: toText(input.industries),
    highlights: toText(input.highlights),
    "resume-file": toText(input.resumeFile),
    "from-email": toText(input.fromEmail),
    "updated-at": now,
  };
}
