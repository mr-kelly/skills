export const SUPPORT_SETTINGS_VERSION = 1;

export const DEFAULT_SUPPORT_SETTINGS = Object.freeze({
  sla_policy: Object.freeze({
    first_response_hours: Object.freeze({ urgent: 2, high: 4, normal: 8, low: 24 }),
    business_hours: "24/7",
  }),
  risk_policy: Object.freeze({
    refund_requires_approval: true,
    max_auto_refund: 0,
    block_ungrounded_replies: true,
    block_commitments_without_approval: true,
  }),
  reply_style: Object.freeze({
    tone: "professional, concise, direct, solution-focused",
    language: "follow_customer",
    signature: "Support",
    avoid: Object.freeze([]),
  }),
  kb_source_path: "",
});

const parseObject = (value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const field = (row, key) => row[key] ?? row[key.replaceAll("_", "-")];

export function settingsRecord({ status = "needs_review", updatedAt = "" } = {}) {
  return {
    record_id: "config",
    onboarding_status: status,
    onboarding_version: SUPPORT_SETTINGS_VERSION,
    sla_policy: JSON.stringify(DEFAULT_SUPPORT_SETTINGS.sla_policy),
    risk_policy: JSON.stringify(DEFAULT_SUPPORT_SETTINGS.risk_policy),
    reply_style: JSON.stringify(DEFAULT_SUPPORT_SETTINGS.reply_style),
    kb_source_path: DEFAULT_SUPPORT_SETTINGS.kb_source_path,
    updated_at: updatedAt,
  };
}

export function normalizeSupportSettings(row = {}) {
  const sla = parseObject(field(row, "sla_policy"));
  const risk = parseObject(field(row, "risk_policy"));
  const style = parseObject(field(row, "reply_style"));
  return {
    record_id: "config",
    onboarding_status: String(field(row, "onboarding_status") || "not_started"),
    onboarding_version: Number(field(row, "onboarding_version") || 0),
    sla_policy: {
      first_response_hours: {
        ...DEFAULT_SUPPORT_SETTINGS.sla_policy.first_response_hours,
        ...(sla.first_response_hours || {}),
      },
      business_hours: String(sla.business_hours || DEFAULT_SUPPORT_SETTINGS.sla_policy.business_hours),
    },
    risk_policy: { ...DEFAULT_SUPPORT_SETTINGS.risk_policy, ...risk },
    reply_style: {
      ...DEFAULT_SUPPORT_SETTINGS.reply_style,
      ...style,
      avoid: Array.isArray(style.avoid) ? style.avoid : [],
    },
    kb_source_path: String(field(row, "kb_source_path") || ""),
    updated_at: String(field(row, "updated_at") || ""),
  };
}

export function validateSupportSettings(row = {}) {
  const value = normalizeSupportSettings(row);
  const errors = [];
  if (!field(row, "sla_policy")) errors.push("sla_policy");
  if (!field(row, "risk_policy")) errors.push("risk_policy");
  if (!field(row, "reply_style")) errors.push("reply_style");
  for (const priority of ["urgent", "high", "normal", "low"]) {
    const hours = Number(value.sla_policy.first_response_hours[priority]);
    if (!Number.isFinite(hours) || hours <= 0) errors.push(`sla_policy.first_response_hours.${priority}`);
  }
  if (!value.sla_policy.business_hours.trim()) errors.push("sla_policy.business_hours");
  if (!Number.isFinite(Number(value.risk_policy.max_auto_refund)) || Number(value.risk_policy.max_auto_refund) < 0) {
    errors.push("risk_policy.max_auto_refund");
  }
  if (!value.reply_style.tone.trim()) errors.push("reply_style.tone");
  if (!value.reply_style.language.trim()) errors.push("reply_style.language");
  if (!value.reply_style.signature.trim()) errors.push("reply_style.signature");
  return { value, errors };
}

export function supportSettingsComplete(row = {}) {
  const { value, errors } = validateSupportSettings(row);
  return (
    errors.length === 0 &&
    value.onboarding_status === "complete" &&
    value.onboarding_version === SUPPORT_SETTINGS_VERSION
  );
}

export function serializeSupportSettings(input = {}, { complete = false, updatedAt = new Date().toISOString() } = {}) {
  const { value, errors } = validateSupportSettings(input);
  if (errors.length) throw new Error(`Invalid support settings: ${errors.join(", ")}`);
  return {
    record_id: "config",
    onboarding_status: complete ? "complete" : value.onboarding_status,
    onboarding_version: SUPPORT_SETTINGS_VERSION,
    sla_policy: JSON.stringify(value.sla_policy),
    risk_policy: JSON.stringify(value.risk_policy),
    reply_style: JSON.stringify(value.reply_style),
    kb_source_path: value.kb_source_path,
    updated_at: updatedAt,
  };
}
