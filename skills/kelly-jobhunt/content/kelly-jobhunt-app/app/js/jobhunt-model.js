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

// Where the match came from, strongest evidence first. A role on the company's
// own careers page is a fact; the same role on an aggregator may have closed
// months ago; "their business needs this" is a hypothesis worth sending but not
// worth ranking above either.
const EVIDENCE_TYPES = ["official-site", "aggregator", "business-match"];
const EVIDENCE_RANK = { "official-site": 3, aggregator: 2, "business-match": 1 };

export const evidenceLabel = (evidenceType) =>
  ({ "official-site": "官网岗位", aggregator: "聚合岗位", "business-match": "业务匹配" })[evidenceType] || "未标注";

const normalizeEvidenceType = (value) => {
  const evidenceType = toText(value).toLowerCase();
  return EVIDENCE_TYPES.includes(evidenceType) ? evidenceType : "";
};

// How stale the evidence is, in whole days. Null when undated — which is itself
// worth showing, since an undated find cannot be judged for freshness at all.
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

// The profile drives both company search and email drafting. A resume can make
// outreach stronger, but it is an optional attachment rather than a reason to
// block research or sending.
const PROFILE_REQUIREMENTS = [
  ["targetRole", "目标岗位"],
  ["highlights", "自我介绍"],
  ["fromEmail", "发件邮箱"],
];

const missingRequirementsFor = (profile) =>
  PROFILE_REQUIREMENTS.filter(([key]) => !profile[key]).map(([, label]) => label);

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
    jobBoards: toText(fields.job_boards),
    resumeSource: toText(fields.resume_source),
    smtpVaultKey: toText(fields.smtp_vault_key),
    onboardingVersion: toNumber(fields.onboarding_version),
  };
  profile.missing = missingRequirementsFor(profile);
  profile.ready = profile.missing.length === 0;
  // Mailbox readiness is deliberately separate: SMTP is only needed at send
  // time, so a missing credential must not block searching or drafting.
  profile.mailReady = Boolean(profile.smtpVaultKey);
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
    evidenceType: normalizeEvidenceType(fields.evidence_type),
    evidenceDate: toText(fields.evidence_date),
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

  // Evidence outranks score. Two companies that both score 90 are not equally
  // worth an email if one role is posted on the company's own site and the
  // other is an aggregator listing that may have closed — sorting on score
  // alone puts the dead one first as often as not.
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
    counts: {
      all: companies.length,
      "to-send": toSend.length,
      sent: sent.length,
      queued: companies.filter((company) => company.status === "queued").length,
    },
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

/** @param {{ onboardingVersion?: number }} [options] */
export function buildProfileFields(input, now, options = {}) {
  const { onboardingVersion } = options;
  const fields = {
    name: toText(input.name, "我"),
    "target-role": toText(input.targetRole),
    locations: toText(input.locations),
    industries: toText(input.industries),
    highlights: toText(input.highlights),
    "resume-file": toText(input.resumeFile),
    "from-email": toText(input.fromEmail),
    "updated-at": now,
    "job-boards": toText(input.jobBoards),
  };
  if (Number.isInteger(onboardingVersion) && onboardingVersion > 0) {
    fields["onboarding-version"] = onboardingVersion;
  }
  return fields;
}

export function missingProfileRequirements(input) {
  return missingRequirementsFor({
    targetRole: toText(input.targetRole),
    highlights: toText(input.highlights),
    resumeFile: toText(input.resumeFile),
    fromEmail: toText(input.fromEmail),
  });
}

// The desk is one surface of a three-command skill, and the work it cannot do
// itself always happens back in the conversation. Rather than leaving the
// operator to guess which command comes next, derive it from the same state the
// queue is rendered from.
const NEXT_STEPS = [
  {
    when: (desk) => !desk.profile.ready,
    command: "/kelly-jobhunt profile",
    title: "先补全你的资料",
    detail: (desk) => `还缺 ${desk.profile.missing.join("、")}。把简历丢给它，它读完帮你填。`,
  },
  {
    when: (desk) => desk.counts.all === 0,
    command: "/kelly-jobhunt research",
    title: "去找目标公司",
    detail: () => "它会先问你想用哪些招聘渠道，再把公司和联系邮箱写回这个列表。",
  },
  {
    when: (desk) => desk.attention.blocked > 0,
    command: "/kelly-jobhunt research",
    title: "补齐缺邮箱的公司",
    detail: (desk) => `${desk.attention.blocked} 家公司还没找到可用邮箱，让它再补一次线索。`,
  },
  {
    when: (desk) => desk.counts.queued > 0 && !desk.profile.mailReady,
    command: "/kelly-jobhunt send",
    title: "配置发件邮箱",
    detail: (desk) => `${desk.counts.queued} 封已批准等着发。授权码存进 Vault，不进这个页面。`,
  },
  {
    when: (desk) => desk.counts.queued > 0,
    command: "node scripts/send_emails.mjs",
    title: "把已批准的发出去",
    detail: (desk) => `${desk.counts.queued} 封在排队。脚本默认预演，确认后加 --apply。`,
  },
  {
    when: (desk) => desk.counts["to-send"] > 0,
    command: "",
    title: "逐封审你的信",
    detail: (desk) => `${desk.counts["to-send"]} 家等你看一眼、改一句、点批准。`,
  },
];

export function nextStep(desk) {
  const step = NEXT_STEPS.find((candidate) => candidate.when(desk));
  if (!step) return null;
  return { command: step.command, title: step.title, detail: step.detail(desk) };
}
