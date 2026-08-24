// Pure domain helpers for Kelly CLM, ported from the retired
// app/server/demo.ts (dataset shape + inline `metrics` rollup) and the
// retired app/app.js (join/count helpers: obligations(), renewalWatchCount(),
// atRiskCount(), approvalsNeedingReview()) -- same variable names and order
// of operations, only TS types stripped and DOM/fetch references removed.
// Shared by the live Busabase read/write path
// (js/providers/busabase-provider.js), the offline ?demo= dataset
// (js/providers/demo-provider.js), and the unit tests in app/test/.
//
// The retired app/server/store.ts held no real domain model -- it only
// persisted the old local decisions.json handoff bucket, which this
// Busabase-only shape replaces with direct field writes on each record
// itself (see references/clm-notes.md).

export const STAGES = ["intake", "review", "negotiation", "approval", "signature_ready", "active", "renewal", "closed"];
export const RISK_LEVELS = ["low", "medium", "high"];
export const OBLIGATION_STATUSES = ["open", "at_risk", "blocked", "done"];
export const APPROVAL_STATUSES = ["needs_review", "approved", "changes_requested", "blocked"];

// Matches the retired config.example.json's `alerts` thresholds: a renewal
// or notice deadline within this many days counts toward the "renewals"
// metric; an obligation due within this many days is flagged "due soon".
export const RENEWAL_NOTICE_DAYS = 90;
export const OBLIGATION_WARNING_DAYS = 30;

function randomId(prefix = "") {
  return `${prefix}${Math.random().toString(16).slice(2, 10)}${Date.now().toString(16)}`;
}

export function newContractId() {
  return randomId("ct-");
}

export function newObligationId() {
  return randomId("obl-");
}

export function newApprovalId() {
  return randomId("ap-");
}

// ---- Contract record helpers ----

export function buildContract({
  id = "",
  name = "",
  counterparty = "",
  type = "",
  stage = "intake",
  owner = "",
  business_owner = "",
  value = "",
  start_date = "",
  end_date = "",
  renewal_date = "",
  notice_deadline = "",
  notice_acknowledged_at = "",
  next_action = "",
  risk = "low",
  created_at = "",
} = {}) {
  const now = new Date().toISOString();
  return {
    id: id || newContractId(),
    name,
    counterparty,
    type,
    stage,
    owner,
    business_owner,
    value,
    start_date,
    end_date,
    renewal_date,
    notice_deadline,
    notice_acknowledged_at,
    next_action,
    risk,
    created_at: created_at || now,
    updated_at: now,
  };
}

export function contractToFields(contract = {}) {
  return {
    "contract-id": contract.id || "",
    name: contract.name || "",
    counterparty: contract.counterparty || "",
    type: contract.type || "",
    stage: contract.stage || "intake",
    owner: contract.owner || "",
    "business-owner": contract.business_owner || "",
    value: contract.value || "",
    "start-date": contract.start_date || "",
    "end-date": contract.end_date || "",
    "renewal-date": contract.renewal_date || "",
    "notice-deadline": contract.notice_deadline || "",
    "notice-acknowledged-at": contract.notice_acknowledged_at || "",
    "next-action": contract.next_action || "",
    risk: contract.risk || "low",
    "created-at": contract.created_at || new Date().toISOString(),
    "updated-at": contract.updated_at || new Date().toISOString(),
  };
}

export function normalizeContractRow({
  contract_id = "",
  name = "",
  counterparty = "",
  type = "",
  stage = "intake",
  owner = "",
  business_owner = "",
  value = "",
  start_date = "",
  end_date = "",
  renewal_date = "",
  notice_deadline = "",
  notice_acknowledged_at = "",
  next_action = "",
  risk = "low",
  created_at = "",
  updated_at = "",
} = {}) {
  return {
    id: contract_id,
    name,
    counterparty,
    type,
    stage,
    owner,
    business_owner,
    value,
    start_date,
    end_date,
    renewal_date,
    notice_deadline,
    notice_acknowledged_at,
    next_action,
    risk,
    created_at,
    updated_at,
  };
}

// ---- Obligation record helpers ----

export function buildObligation({
  id = "",
  contract_id = "",
  title = "",
  owner = "",
  due_date = "",
  status = "open",
  evidence = "",
  created_at = "",
} = {}) {
  const now = new Date().toISOString();
  return {
    id: id || newObligationId(),
    contract_id,
    title,
    owner,
    due_date,
    status,
    evidence,
    created_at: created_at || now,
    updated_at: now,
  };
}

export function obligationToFields(obligation = {}) {
  return {
    "obligation-id": obligation.id || "",
    "contract-id": obligation.contract_id || "",
    title: obligation.title || "",
    owner: obligation.owner || "",
    "due-date": obligation.due_date || "",
    status: obligation.status || "open",
    evidence: obligation.evidence || "",
    "created-at": obligation.created_at || new Date().toISOString(),
    "updated-at": obligation.updated_at || new Date().toISOString(),
  };
}

export function normalizeObligationRow({
  obligation_id = "",
  contract_id = "",
  title = "",
  owner = "",
  due_date = "",
  status = "open",
  evidence = "",
  created_at = "",
  updated_at = "",
} = {}) {
  return { id: obligation_id, contract_id, title, owner, due_date, status, evidence, created_at, updated_at };
}

// ---- Approval record helpers ----

export function buildApproval({
  id = "",
  contract_id = "",
  title = "",
  summary = "",
  status = "needs_review",
  decision_note = "",
  decided_at = "",
  created_at = "",
} = {}) {
  const now = new Date().toISOString();
  return {
    id: id || newApprovalId(),
    contract_id,
    title,
    summary,
    status,
    decision_note,
    decided_at,
    created_at: created_at || now,
    updated_at: now,
  };
}

export function approvalToFields(approval = {}) {
  return {
    "approval-id": approval.id || "",
    "contract-id": approval.contract_id || "",
    title: approval.title || "",
    summary: approval.summary || "",
    status: approval.status || "needs_review",
    "decision-note": approval.decision_note || "",
    "decided-at": approval.decided_at || "",
    "created-at": approval.created_at || new Date().toISOString(),
    "updated-at": approval.updated_at || new Date().toISOString(),
  };
}

export function normalizeApprovalRow({
  approval_id = "",
  contract_id = "",
  title = "",
  summary = "",
  status = "needs_review",
  decision_note = "",
  decided_at = "",
  created_at = "",
  updated_at = "",
} = {}) {
  return { id: approval_id, contract_id, title, summary, status, decision_note, decided_at, created_at, updated_at };
}

// ---- Rollups, ported from the retired app/server/demo.ts (metrics) and
// app/app.js (join/count helpers). ----

// Ported from the retired app/app.js's obligations(): joins each obligation
// to its parent contract for display.
export function obligationsWithContract(obligations = [], contracts = []) {
  return obligations.map((item) => ({
    ...item,
    contract: contracts.find((contract) => contract.id === item.contract_id) || null,
  }));
}

// Ported from the retired app/app.js's approvalsNeedingReview().
export function approvalsNeedingReviewCount(approvals = []) {
  return approvals.filter((item) => item.status === "needs_review").length;
}

// Ported from the retired app/app.js's renewalWatchCount(): any contract
// carrying a renewal or notice date at all, regardless of how soon it
// falls -- a broader "keep an eye on this" signal than the 90-day
// metrics.renewals_90d tile below.
export function renewalWatchCount(contracts = []) {
  return contracts.filter((item) => item.notice_deadline || item.renewal_date).length;
}

// Ported from the retired app/app.js's atRiskCount(): obligations that are
// at_risk OR blocked. Deliberately broader than metrics.obligations_at_risk
// below, which the retired app/server/demo.ts only ever counted as strict
// "at_risk" -- both counts are preserved verbatim since the original app
// used them in different places (sidebar badge/overview risk list vs. the
// summary metric tile).
export function atRiskObligationsCount(obligations = []) {
  return obligations.filter((item) => item.status === "at_risk" || item.status === "blocked").length;
}

function daysFromNow(dateText = "", nowMs = Date.now()) {
  if (!dateText) return null;
  const parsed = new Date(dateText).getTime();
  if (Number.isNaN(parsed)) return null;
  return (parsed - nowMs) / (24 * 60 * 60 * 1000);
}

// Renewal-notice detection: a contract counts toward the renewal window if
// its renewal_date or notice_deadline falls between now and
// RENEWAL_NOTICE_DAYS days from now (not already past). New logic -- the
// retired app/server/demo.ts hardcoded metrics.renewals_90d to the literal
// value `1`, which never actually matched any of its own demo contracts'
// dates (see computeMetrics() below).
export function isRenewalDueSoon(contract = {}, now = new Date().toISOString(), windowDays = RENEWAL_NOTICE_DAYS) {
  const nowMs = new Date(now).getTime();
  for (const value of [contract.renewal_date, contract.notice_deadline]) {
    const days = daysFromNow(value, nowMs);
    if (days !== null && days >= 0 && days <= windowDays) return true;
  }
  return false;
}

// Obligation-due detection: an open (not done) obligation counts as "due
// soon" if its due_date falls within OBLIGATION_WARNING_DAYS days from now.
export function isObligationDueSoon(
  obligation = {},
  now = new Date().toISOString(),
  windowDays = OBLIGATION_WARNING_DAYS,
) {
  if (obligation.status === "done") return false;
  const days = daysFromNow(obligation.due_date, new Date(now).getTime());
  return days !== null && days >= 0 && days <= windowDays;
}

// Ported from the retired app/server/demo.ts's inline `metrics` object.
// `obligations_at_risk` intentionally matches demo.ts's strict `at_risk`
// filter (see atRiskObligationsCount() above for the broader UI count).
// `renewals_90d` replaces demo.ts's hardcoded `1` with a real date-window
// computation over renewal_date/notice_deadline via isRenewalDueSoon().
export function computeMetrics(contracts = [], obligations = [], approvals = [], now = new Date().toISOString()) {
  return {
    contracts: contracts.length,
    renewals_90d: contracts.filter((item) => isRenewalDueSoon(item, now)).length,
    obligations_at_risk: obligations.filter((item) => item.status === "at_risk").length,
    approvals: approvalsNeedingReviewCount(approvals),
  };
}

export function buildState(
  contracts = [],
  obligations = [],
  approvals = [],
  { app = "kelly-clm", demo = false, generated_at = new Date().toISOString(), profile = {} } = {},
) {
  return {
    app,
    demo,
    generated_at,
    profile,
    contracts,
    obligations,
    approvals,
    metrics: computeMetrics(contracts, obligations, approvals, generated_at),
  };
}
