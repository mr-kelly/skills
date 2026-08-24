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

const STATUSES = ["screening", "qualified", "not-qualified", "connected"];
const STATUS_RANK = { screening: 3, qualified: 2, connected: 1, "not-qualified": 0 };

export const statusLabel = (status) =>
  ({ screening: "待筛选", qualified: "已合格", "not-qualified": "不合格", connected: "已建联" })[status] || "待筛选";

/**
 * A score bucket exists purely to color/label a number consistently across the
 * list row, the detail pane, and tests — it never drives a status transition.
 * Thresholds mirror the desk's own qualify-threshold guidance (typically ~75)
 * without depending on any one criteria record's exact value.
 */
export const scoreBucket = (score) => {
  const value = toNumber(score);
  if (value >= 85) return "high";
  if (value >= 70) return "mid";
  return "low";
};

export const scoreBucketLabel = (score) => ({ high: "优秀", mid: "达标", low: "待观察" })[scoreBucket(score)];

const normalizeStatus = (value) => {
  const status = toText(value, "screening").toLowerCase();
  return STATUSES.includes(status) ? status : "screening";
};

const CRITERIA_REQUIREMENTS = [
  ["roleKeywords", "搜索关键词"],
  ["qualifyThreshold", "合格分数线"],
];

const missingCriteriaRequirementsFor = (criteria) =>
  CRITERIA_REQUIREMENTS.filter(([key]) => !criteria[key]).map(([, label]) => label);

export function normalizeCriteria(record) {
  const fields = fieldsOf(record);
  const criteria = {
    id: record?.id || "",
    recordId: record?.id || "",
    roleKeywords: toText(fields.role_keywords),
    experienceFilter: toText(fields.experience_filter),
    activityFilter: toText(fields.activity_filter),
    endorsementRubric: toText(fields.endorsement_rubric),
    expertiseRubric: toText(fields.expertise_rubric),
    teachingRubric: toText(fields.teaching_rubric),
    qualifyThreshold: toNumber(fields.qualify_threshold, 0) || null,
    updatedAt: toText(fields.updated_at),
    onboardingVersion: toNumber(fields.onboarding_version),
  };
  criteria.missing = missingCriteriaRequirementsFor(criteria);
  criteria.ready = criteria.missing.length === 0;
  return criteria;
}

export function missingCriteriaRequirements(input) {
  return missingCriteriaRequirementsFor({
    roleKeywords: toText(input.roleKeywords),
    qualifyThreshold: toNumber(input.qualifyThreshold, 0) || null,
  });
}

export function buildCriteriaFields(input, now, options = {}) {
  const fields = {
    "role-keywords": toText(input.roleKeywords),
    "experience-filter": toText(input.experienceFilter),
    "activity-filter": toText(input.activityFilter),
    "endorsement-rubric": toText(input.endorsementRubric),
    "expertise-rubric": toText(input.expertiseRubric),
    "teaching-rubric": toText(input.teachingRubric),
    "qualify-threshold": toNumber(input.qualifyThreshold, 0),
    "updated-at": now,
  };
  if (Number.isInteger(options.onboardingVersion) && options.onboardingVersion > 0) {
    fields["onboarding-version"] = options.onboardingVersion;
  }
  return fields;
}

/** Simple mean of the three axes, rounded — the same formula everywhere an overall score is shown. */
export function computeOverallScore(endorsementScore, expertiseScore, teachingScore) {
  return Math.round((toNumber(endorsementScore) + toNumber(expertiseScore) + toNumber(teachingScore)) / 3);
}

export function normalizeCandidate(record) {
  const fields = fieldsOf(record);
  const endorsementScore = toNumber(fields.endorsement_score, null);
  const expertiseScore = toNumber(fields.expertise_score, null);
  const teachingScore = toNumber(fields.teaching_score, null);
  const hasAllScores = [endorsementScore, expertiseScore, teachingScore].every(
    (value) => value !== null && value !== undefined,
  );
  const storedOverall = toNumber(fields.overall_score, null);
  return {
    id: record?.id || "",
    recordId: record?.id || "",
    name: toText(fields.name, "未命名候选人"),
    platformHeadline: toText(fields.platform_headline),
    searchContext: toText(fields.search_context),
    endorsementScore: endorsementScore ?? 0,
    expertiseScore: expertiseScore ?? 0,
    teachingScore: teachingScore ?? 0,
    hasAllScores,
    overallScore:
      storedOverall ?? (hasAllScores ? computeOverallScore(endorsementScore, expertiseScore, teachingScore) : 0),
    matchNotes: toText(fields.match_notes),
    status: normalizeStatus(fields.status),
    wechatAddedAt: toText(fields.wechat_added_at),
    loggedAt: toText(fields.logged_at),
  };
}

export function qualifies(candidate, threshold) {
  const bar = toNumber(threshold, 0);
  return bar > 0 && toNumber(candidate?.overallScore) >= bar;
}

export function buildScoreFields(input) {
  const endorsementScore = toNumber(input.endorsementScore, 0);
  const expertiseScore = toNumber(input.expertiseScore, 0);
  const teachingScore = toNumber(input.teachingScore, 0);
  return {
    "endorsement-score": endorsementScore,
    "expertise-score": expertiseScore,
    "teaching-score": teachingScore,
    "overall-score": computeOverallScore(endorsementScore, expertiseScore, teachingScore),
    "match-notes": toText(input.matchNotes),
  };
}

export function buildDecisionFields(candidate, decision, now) {
  if (!["qualified", "not-qualified"].includes(decision)) {
    throw new Error(`INVALID_DECISION: ${decision}`);
  }
  if (candidate.status !== "screening") {
    throw new Error("ALREADY_DECIDED: 这位候选人已经离开待筛选队列");
  }
  if (!candidate.hasAllScores) {
    throw new Error("MISSING_SCORES: 三项评分都填完才能下结论");
  }
  return decision === "not-qualified" ? { status: decision, "logged-at": now } : { status: decision };
}

export function buildWechatAddedFields(candidate, date) {
  if (candidate.status !== "qualified") {
    throw new Error("NOT_QUALIFIED: 只有已合格的候选人才能记录微信添加");
  }
  if (!date) throw new Error("MISSING_DATE: 请填写微信添加日期");
  return { "wechat-added-at": date };
}

export function buildConnectedFields(candidate, now) {
  if (candidate.status !== "qualified") {
    throw new Error("NOT_QUALIFIED: 只有已合格的候选人才能标记已建联");
  }
  if (!candidate.wechatAddedAt) {
    throw new Error("MISSING_WECHAT_ADD: 先记录真实发生的微信添加，再标记已建联");
  }
  return { status: "connected", "logged-at": now };
}

export function createInstructorSourcingDesk(records) {
  const criteria = normalizeCriteria(recordsFor(records, "criteria")[0]);
  const candidates = recordsFor(records, "candidates")
    .map(normalizeCandidate)
    .sort(
      (left, right) =>
        (STATUS_RANK[right.status] ?? 0) - (STATUS_RANK[left.status] ?? 0) ||
        right.overallScore - left.overallScore ||
        left.name.localeCompare(right.name, "zh-CN"),
    )
    .map((candidate, index) => ({ ...candidate, ref: `#${index + 1}` }));

  const screening = candidates.filter((candidate) => candidate.status === "screening");
  const qualified = candidates.filter((candidate) => candidate.status === "qualified");
  const connected = candidates.filter((candidate) => candidate.status === "connected");
  const notQualified = candidates.filter((candidate) => candidate.status === "not-qualified");
  const readyToDecide = screening.filter((candidate) => candidate.hasAllScores);
  const awaitingWechatRecord = qualified.filter((candidate) => !candidate.wechatAddedAt);

  return {
    criteria,
    candidates,
    buckets: { all: candidates, qualified, connected },
    counts: {
      all: candidates.length,
      screening: screening.length,
      qualified: qualified.length,
      connected: connected.length,
      "not-qualified": notQualified.length,
    },
    attention: {
      screening: screening.length,
      readyToDecide: readyToDecide.length,
      awaitingWechatRecord: awaitingWechatRecord.length,
      criteriaReady: criteria.ready,
      criteriaMissing: criteria.missing,
    },
  };
}

/**
 * Per-candidate guidance, not desk-wide: this app has no research/send command
 * loop, so "what happens next" is always about one specific row. `app.js`
 * picks which candidate to ask about (typically the first one needing
 * attention) and renders whatever this returns.
 */
export function nextStep(candidate) {
  if (!candidate) return null;
  if (candidate.status === "screening" && !candidate.hasAllScores) {
    return {
      command: "/kelly-instructor-sourcing review",
      title: "补齐三项评分",
      detail: `${candidate.name} 还缺评分，填完背景背书、专业深广度、授课服务能力三项才能下结论。`,
    };
  }
  if (candidate.status === "screening" && candidate.hasAllScores) {
    return {
      command: "",
      title: "标记合格或不合格",
      detail: `${candidate.name} 三项评分已完整，综合分 ${candidate.overallScore}，请下一步结论。`,
    };
  }
  if (candidate.status === "qualified" && !candidate.wechatAddedAt) {
    return {
      command: "",
      title: "人工添加微信后回来记录",
      detail: `${candidate.name} 已合格。请在这个应用之外手动加上微信，加上之后回来记录添加日期。`,
    };
  }
  if (candidate.status === "qualified" && candidate.wechatAddedAt) {
    return {
      command: "",
      title: "标记已建联",
      detail: `${candidate.name} 的微信添加已记录（${candidate.wechatAddedAt}），可以标记为已建联。`,
    };
  }
  return null;
}
