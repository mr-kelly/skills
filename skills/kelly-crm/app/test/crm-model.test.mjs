import assert from "node:assert/strict";
import test from "node:test";
import { buildSnapshot, decisionsFromSnapshot, statusForAction } from "../app/js/crm-model.js";

const rawCompanies = [{ company_id: "comp-1", name: "Acme" }];
const rawContacts = [
  { contact_id: "ct-1", name: "Ada", company_id: "comp-1", relationship: "warm", tags: '["pilot"]' },
];
const rawDeals = [
  {
    deal_id: "deal-1",
    name: "Pilot",
    company_id: "comp-1",
    primary_contact_id: "ct-1",
    stage: "proposal",
    amount: "1000",
    probability: "0.5",
    status: "open",
  },
];
const rawFollowups = [
  {
    followup_id: "fu-1",
    ref: "1",
    contact_id: "ct-1",
    status: "approved",
    decision_comment: "go",
    decided_at: "2026-01-01T00:00:00.000Z",
  },
  { followup_id: "fu-2", ref: "2", contact_id: "ct-1", status: "needs_review" },
];

test("buildSnapshot normalizes fields and computes metrics", () => {
  const snapshot = buildSnapshot({
    companies: rawCompanies,
    contacts: rawContacts,
    deals: rawDeals,
    interactions: [],
    followups: rawFollowups,
  });
  assert.equal(snapshot.companies[0].name, "Acme");
  assert.deepEqual(snapshot.contacts[0].tags, ["pilot"]);
  assert.equal(snapshot.deals[0].amount, 1000);
  assert.equal(snapshot.deals[0].probability, 0.5);
  assert.equal(snapshot.metrics.open_deal_count, 1);
  assert.equal(snapshot.metrics.pipeline_value, 1000);
  assert.equal(snapshot.metrics.weighted_pipeline_value, 500);
  assert.equal(snapshot.metrics.followups_needs_review, 1);
  assert.equal(snapshot.metrics.followups_due, 2);
});

test("decisionsFromSnapshot only surfaces decided followups", () => {
  const snapshot = buildSnapshot({ followups: rawFollowups });
  const decisions = decisionsFromSnapshot(snapshot);
  assert.equal(Object.keys(decisions.decisions).length, 1);
  assert.equal(decisions.decisions["fu-1"].action, "approve");
  assert.equal(decisions.decisions["fu-1"].comment, "go");
  assert.equal(decisions.decisions["fu-2"], undefined);
});

test("statusForAction maps every decision verdict", () => {
  assert.equal(statusForAction("approve"), "approved");
  assert.equal(statusForAction("request_changes"), "changes_requested");
  assert.equal(statusForAction("block"), "blocked");
  assert.equal(statusForAction("revise"), "needs_review");
  assert.equal(statusForAction("unknown"), null);
});
