import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConfigSummary,
  buildSnapshot,
  computeMetrics,
  computeSlaState,
  maskContact,
  slaHoursFor,
  statusForProposalVerdict,
  triageStateForIntakeVerdict,
} from "../app/js/tickets-model.js";

test("statusForProposalVerdict maps every decision action, ported from local-file-provider.ts's mergeSnapshot", () => {
  assert.equal(statusForProposalVerdict("approve"), "approved");
  assert.equal(statusForProposalVerdict("request_changes"), "changes_requested");
  assert.equal(statusForProposalVerdict("block"), "blocked");
  // "revise" only edits note_to_crew/draft: status stays whatever it was.
  assert.equal(statusForProposalVerdict("revise", "needs_review"), "needs_review");
  assert.equal(statusForProposalVerdict("revise", "approved"), "approved");
});

test("triageStateForIntakeVerdict only 'ignore' changes triage_state", () => {
  assert.equal(triageStateForIntakeVerdict("ignore", "new"), "ignored");
  assert.equal(triageStateForIntakeVerdict("convert_to_ticket", "classified"), "classified");
});

test("maskContact masks digit runs of 5+ but keeps the first 3 and last 2", () => {
  assert.equal(maskContact("13800002214"), "138******14");
  assert.equal(maskContact("wechat:@tang***"), "wechat:@tang***");
  assert.equal(maskContact(""), "");
});

test("slaHoursFor: exact category+urgency rule wins over the '*' wildcard, which wins over the default", () => {
  const settings = {
    sla_rules: [
      { category: "plumbing", urgency: "urgent", hours: 4 },
      { category: "*", urgency: "urgent", hours: 8 },
      { category: "*", urgency: "normal", hours: 72 },
    ],
    sla_default_hours: 72,
  };
  assert.equal(slaHoursFor(settings, "plumbing", "urgent"), 4);
  assert.equal(slaHoursFor(settings, "elevator", "urgent"), 8);
  assert.equal(slaHoursFor(settings, "elevator", "low"), 72);
});

// One ticket worked by hand, mirroring the retired lib/common.ts's
// computeSlaState(): a ticket created 4h ago with a due date 1h from now has
// only 1/5 = 20% of its SLA window left, which is <= 25% -> "at_risk".
test("computeSlaState: at_risk when 25% or less of the SLA window remains", () => {
  const now = "2026-07-03T09:00:00.000Z";
  const created = new Date(Date.parse(now) - 4 * 3600000).toISOString();
  const due = new Date(Date.parse(now) + 1 * 3600000).toISOString();
  const ticket = { status: "open", created_at: created, sla_due_at: due };
  assert.equal(computeSlaState(ticket, now), "at_risk");
});

test("computeSlaState: ok well inside the window, breached once due has passed", () => {
  const now = "2026-07-03T09:00:00.000Z";
  const created = new Date(Date.parse(now) - 1 * 3600000).toISOString();
  const dueSoon = new Date(Date.parse(now) + 10 * 3600000).toISOString();
  assert.equal(computeSlaState({ status: "open", created_at: created, sla_due_at: dueSoon }, now), "ok");
  const duePassed = new Date(Date.parse(now) - 1 * 3600000).toISOString();
  assert.equal(computeSlaState({ status: "open", created_at: created, sla_due_at: duePassed }, now), "breached");
});

test("computeSlaState: resolved tickets are 'met' unless resolved after the due date", () => {
  assert.equal(computeSlaState({ status: "resolved", sla_due_at: "", resolved_at: "" }, "now"), "met");
  assert.equal(
    computeSlaState(
      { status: "resolved", sla_due_at: "2026-07-01T00:00:00.000Z", resolved_at: "2026-06-30T00:00:00.000Z" },
      "now",
    ),
    "met",
  );
  assert.equal(
    computeSlaState(
      { status: "resolved", sla_due_at: "2026-07-01T00:00:00.000Z", resolved_at: "2026-07-02T00:00:00.000Z" },
      "now",
    ),
    "breached",
  );
});

test("computeMetrics counts open/resolved/sla_at_risk and buckets intake by channel", () => {
  const snapshot = {
    intake: [
      { channel: "wechat", triage_state: "new" },
      { channel: "wechat", triage_state: "ticketed" },
      { channel: "phone", triage_state: "new" },
    ],
    tickets: [
      { status: "open", sla_state: "ok" },
      { status: "open", sla_state: "at_risk" },
      { status: "resolved", created_at: "2026-07-01T00:00:00.000Z", resolved_at: "2026-07-01T04:00:00.000Z" },
    ],
    dispatch_proposals: [{ status: "needs_review" }, { status: "approved" }],
  };
  const metrics = computeMetrics(snapshot);
  assert.equal(metrics.intake_count, 3);
  assert.equal(metrics.unclassified_intake, 2);
  assert.equal(metrics.ticket_count, 3);
  assert.equal(metrics.open_tickets, 2);
  assert.equal(metrics.resolved_tickets, 1);
  assert.equal(metrics.avg_resolution_hours, 4);
  assert.equal(metrics.sla_at_risk, 1);
  assert.equal(metrics.proposal_count, 2);
  assert.equal(metrics.needs_review, 1);
  assert.deepEqual(metrics.intake_by_channel, { wechat: 2, phone: 1 });
});

// A minimal end-to-end pass through buildSnapshot(), mirroring the shape
// busabase-provider.js feeds it (flat Busabase rows with JSON-string array
// fields), proving normalization + sla_state + metrics all compose.
test("buildSnapshot normalizes Busabase rows and computes sla_state/metrics fresh", () => {
  const now = "2026-07-03T09:00:00.000Z";
  const snapshot = buildSnapshot({
    intake: [{ intake_id: "in-1", channel: "wechat", text: "leak", triage_state: "new" }],
    tickets: [
      {
        ticket_id: "T-1",
        title: "Leak",
        category: "plumbing",
        urgency: "urgent",
        status: "open",
        created_at: new Date(Date.parse(now) - 4 * 3600000).toISOString(),
        sla_due_at: new Date(Date.parse(now) + 1 * 3600000).toISOString(),
        intake_ids: JSON.stringify(["in-1"]),
        history: JSON.stringify([{ event: "intake", actor: "kelly-tickets", at: now, note: "" }]),
      },
    ],
    proposals: [],
    crews: [{ crew_id: "plumbing", name: "Plumbing Crew", skills: JSON.stringify(["plumbing"]) }],
    sync_log: [],
    settings: { property_name: "Riverside Gardens", buildings: "3" },
    now,
  });
  assert.equal(snapshot.property.name, "Riverside Gardens");
  assert.equal(snapshot.property.buildings, 3);
  assert.equal(snapshot.tickets[0].sla_state, "at_risk");
  assert.deepEqual(snapshot.tickets[0].intake_ids, ["in-1"]);
  assert.equal(snapshot.crews[0].skills[0], "plumbing");
  assert.equal(snapshot.metrics.open_tickets, 1);
  assert.equal(snapshot.metrics.sla_at_risk, 1);
  assert.equal(snapshot.warnings.length, 0);
});

test("buildSnapshot surfaces the empty-state warning when nothing has been ingested yet", () => {
  const snapshot = buildSnapshot({});
  assert.equal(snapshot.warnings[0].id, "no-snapshot");
});

test("buildConfigSummary reads live off the settings row and crews Base, no contact readiness (browser can't read agent env vars)", () => {
  const summary = buildConfigSummary({
    settings: {
      property_name: "Riverside Gardens",
      buildings: "3",
      channels: JSON.stringify(["wechat", "phone"]),
      sla_default_hours: "72",
    },
    crews: [{ crew_id: "plumbing", name: "Plumbing Crew", contact_env: "KELLY_TICKETS_CREW_PLUMBING_CONTACT" }],
  });
  assert.equal(summary.property.name, "Riverside Gardens");
  assert.deepEqual(summary.channels, ["wechat", "phone"]);
  assert.equal(summary.crews[0].contact_env, "KELLY_TICKETS_CREW_PLUMBING_CONTACT");
  assert.equal("contact_ready" in summary.crews[0], false);
  assert.equal(summary.sla_default_hours, 72);
});
