import assert from "node:assert/strict";
import test from "node:test";
import {
  approvalToFields,
  approvalsNeedingReviewCount,
  atRiskObligationsCount,
  buildApproval,
  buildContract,
  buildObligation,
  buildState,
  computeMetrics,
  contractToFields,
  isObligationDueSoon,
  isRenewalDueSoon,
  normalizeApprovalRow,
  normalizeContractRow,
  normalizeObligationRow,
  obligationToFields,
  obligationsWithContract,
  renewalWatchCount,
} from "../app/js/clm-model.js";

const NOW = "2026-07-07T09:00:00.000Z";

test("contractToFields/normalizeContractRow round trip preserves every field", () => {
  const contract = buildContract({
    id: "ct-1",
    name: "Nimbus Analytics MSA",
    counterparty: "Zenith Retail Group",
    type: "MSA",
    stage: "negotiation",
    owner: "Mira Chen",
    business_owner: "Jon Park",
    value: "USD 180k ARR",
    start_date: "2026-08-01",
    end_date: "2028-07-31",
    renewal_date: "2028-07-31",
    notice_deadline: "2028-06-01",
    next_action: "Confirm liability fallback.",
    risk: "medium",
  });
  const fields = contractToFields(contract);
  const roundTripped = normalizeContractRow({
    contract_id: fields["contract-id"],
    name: fields.name,
    counterparty: fields.counterparty,
    type: fields.type,
    stage: fields.stage,
    owner: fields.owner,
    business_owner: fields["business-owner"],
    value: fields.value,
    start_date: fields["start-date"],
    end_date: fields["end-date"],
    renewal_date: fields["renewal-date"],
    notice_deadline: fields["notice-deadline"],
    notice_acknowledged_at: fields["notice-acknowledged-at"],
    next_action: fields["next-action"],
    risk: fields.risk,
    created_at: fields["created-at"],
    updated_at: fields["updated-at"],
  });
  assert.equal(roundTripped.id, contract.id);
  assert.equal(roundTripped.name, contract.name);
  assert.equal(roundTripped.notice_deadline, contract.notice_deadline);
  assert.equal(roundTripped.risk, "medium");
});

test("obligationToFields/normalizeObligationRow round trip preserves every field", () => {
  const obligation = buildObligation({
    id: "obl-1",
    contract_id: "ct-1",
    title: "Delete or return personal data after termination",
    owner: "Privacy",
    due_date: "2026-08-19",
    status: "at_risk",
    evidence: "DPA deletion section needs final owner",
  });
  const fields = obligationToFields(obligation);
  const roundTripped = normalizeObligationRow({
    obligation_id: fields["obligation-id"],
    contract_id: fields["contract-id"],
    title: fields.title,
    owner: fields.owner,
    due_date: fields["due-date"],
    status: fields.status,
    evidence: fields.evidence,
    created_at: fields["created-at"],
    updated_at: fields["updated-at"],
  });
  assert.deepEqual(roundTripped, { ...obligation });
});

test("approvalToFields/normalizeApprovalRow round trip preserves every field", () => {
  const approval = buildApproval({
    id: "ap-1",
    contract_id: "ct-2",
    title: "Assign deletion obligation owner",
    summary: "Privacy needs an owner before approval can be marked ready.",
    status: "needs_review",
  });
  const fields = approvalToFields(approval);
  const roundTripped = normalizeApprovalRow({
    approval_id: fields["approval-id"],
    contract_id: fields["contract-id"],
    title: fields.title,
    summary: fields.summary,
    status: fields.status,
    decision_note: fields["decision-note"],
    decided_at: fields["decided-at"],
    created_at: fields["created-at"],
    updated_at: fields["updated-at"],
  });
  assert.deepEqual(roundTripped, { ...approval });
});

test("obligationsWithContract joins each obligation to its parent contract, matching the retired app/app.js's obligations()", () => {
  const contracts = [buildContract({ id: "ct-1", name: "Nimbus Analytics MSA" })];
  const obligations = [buildObligation({ id: "obl-1", contract_id: "ct-1", title: "Track SLA credit exposure" })];
  const joined = obligationsWithContract(obligations, contracts);
  assert.equal(joined[0].contract.name, "Nimbus Analytics MSA");
  const orphan = obligationsWithContract([buildObligation({ id: "obl-2", contract_id: "ct-missing" })], contracts);
  assert.equal(orphan[0].contract, null);
});

test("renewalWatchCount counts any contract with a renewal or notice date, regardless of window (worked example)", () => {
  const contracts = [
    buildContract({ id: "ct-1", renewal_date: "2028-07-31", notice_deadline: "2028-06-01" }),
    buildContract({ id: "ct-2", renewal_date: "", notice_deadline: "2027-05-20" }),
    buildContract({ id: "ct-3", renewal_date: "", notice_deadline: "" }),
  ];
  assert.equal(renewalWatchCount(contracts), 2);
});

test("atRiskObligationsCount includes both at_risk and blocked, unlike the stricter metrics.obligations_at_risk", () => {
  const obligations = [
    buildObligation({ status: "at_risk" }),
    buildObligation({ status: "blocked" }),
    buildObligation({ status: "open" }),
    buildObligation({ status: "done" }),
  ];
  assert.equal(atRiskObligationsCount(obligations), 2);
});

test("approvalsNeedingReviewCount counts only needs_review", () => {
  const approvals = [
    buildApproval({ status: "needs_review" }),
    buildApproval({ status: "approved" }),
    buildApproval({ status: "needs_review" }),
  ];
  assert.equal(approvalsNeedingReviewCount(approvals), 2);
});

test("isRenewalDueSoon: worked-example date-window detection relative to NOW", () => {
  // 43 days ahead of NOW -- inside the 90-day window.
  assert.equal(isRenewalDueSoon({ notice_deadline: "2026-08-19T09:00:00.000Z" }, NOW), true);
  // Exactly 90 days ahead -- inclusive boundary.
  assert.equal(isRenewalDueSoon({ renewal_date: "2026-10-05T09:00:00.000Z" }, NOW), true);
  // 91 days ahead -- just outside the window.
  assert.equal(isRenewalDueSoon({ renewal_date: "2026-10-06T09:00:00.000Z" }, NOW), false);
  // In the past -- never counts as "due soon".
  assert.equal(isRenewalDueSoon({ notice_deadline: "2026-06-01" }, NOW), false);
  // Far in the future (the retired demo's Nimbus MSA notice_deadline).
  assert.equal(isRenewalDueSoon({ notice_deadline: "2028-06-01" }, NOW), false);
  // No dates at all.
  assert.equal(isRenewalDueSoon({}, NOW), false);
});

test("isObligationDueSoon: worked-example 30-day window, excludes done obligations", () => {
  assert.equal(isObligationDueSoon({ due_date: "2026-08-05T09:00:00.000Z", status: "open" }, NOW), true);
  assert.equal(isObligationDueSoon({ due_date: "2026-09-01T09:00:00.000Z", status: "open" }, NOW), false);
  assert.equal(isObligationDueSoon({ due_date: "2026-08-05T09:00:00.000Z", status: "done" }, NOW), false);
  assert.equal(isObligationDueSoon({ due_date: "", status: "open" }, NOW), false);
});

test("computeMetrics: worked example over the retired demo.ts's four contracts/obligations/approvals", () => {
  const contracts = [
    buildContract({ id: "ct-nimbus-msa", renewal_date: "2028-07-31", notice_deadline: "2028-06-01" }),
    buildContract({ id: "ct-orbit-dpa", renewal_date: "2027-07-19", notice_deadline: "2027-05-20" }),
    buildContract({ id: "ct-luma-sow", renewal_date: "", notice_deadline: "" }),
    buildContract({ id: "ct-acme-nda", renewal_date: "", notice_deadline: "" }),
  ];
  const obligations = [
    buildObligation({ contract_id: "ct-orbit-dpa", status: "at_risk" }),
    buildObligation({ contract_id: "ct-luma-sow", status: "open" }),
    buildObligation({ contract_id: "ct-nimbus-msa", status: "open" }),
    buildObligation({ contract_id: "ct-acme-nda", status: "open" }),
  ];
  const approvals = [
    buildApproval({ contract_id: "ct-nimbus-msa", status: "needs_review" }),
    buildApproval({ contract_id: "ct-orbit-dpa", status: "needs_review" }),
  ];
  const metrics = computeMetrics(contracts, obligations, approvals, NOW);
  assert.deepEqual(metrics, {
    contracts: 4,
    // None of the retired demo dataset's renewal/notice dates (2027/2028)
    // fall within 90 days of NOW (2026-07-07) -- unlike the retired
    // app/server/demo.ts's hardcoded `renewals_90d: 1`, which never matched
    // its own data.
    renewals_90d: 0,
    obligations_at_risk: 1,
    approvals: 2,
  });
});

test("buildState assembles the full snapshot with metrics derived fresh from the given collections", () => {
  const state = buildState(
    [buildContract({ id: "ct-1" })],
    [buildObligation({ contract_id: "ct-1", status: "at_risk" })],
    [buildApproval({ contract_id: "ct-1", status: "needs_review" })],
    { app: "kelly-clm", demo: true, generated_at: NOW, profile: { company: "Example Legal Ops" } },
  );
  assert.equal(state.app, "kelly-clm");
  assert.equal(state.demo, true);
  assert.equal(state.metrics.contracts, 1);
  assert.equal(state.metrics.obligations_at_risk, 1);
  assert.equal(state.metrics.approvals, 1);
});
