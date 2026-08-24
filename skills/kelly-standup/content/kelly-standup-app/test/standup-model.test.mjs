import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConfigSummary,
  buildSnapshot,
  computeMetrics,
  isoAddDays,
  normalizeBlocker,
  normalizeCheckin,
  normalizeMember,
  normalizeReminder,
  recomputeDerived,
  statusForAction,
} from "../app/js/standup-model.js";

test("statusForAction maps every reminder verdict, ported from local-file-provider.ts's saveDecision", () => {
  assert.equal(statusForAction("approve"), "approved");
  assert.equal(statusForAction("request_changes"), "changes_requested");
  assert.equal(statusForAction("block"), "blocked");
  // "revise" (Save note) never changes status: it stays whatever it was.
  assert.equal(statusForAction("revise", "needs_review"), "needs_review");
  assert.equal(statusForAction("revise", "approved"), "approved");
});

test("isoAddDays adds/subtracts calendar days across a UTC month boundary", () => {
  assert.equal(isoAddDays("2026-07-03", -29), "2026-06-04");
  assert.equal(isoAddDays("2026-07-31", 1), "2026-08-01");
});

test("recomputeDerived streak: on-leave days do not break the streak, a real miss does", () => {
  // Alice: day1 submitted, day2 on leave (skipped, doesn't break), day3 submitted.
  const onLeaveSnapshot = {
    today: "2026-07-03",
    members: [{ member_id: "alice", active: true }],
    days: [
      { date: "2026-07-01", on_leave: [], updates: [{ member_id: "alice" }] },
      { date: "2026-07-02", on_leave: ["alice"], updates: [] },
      { date: "2026-07-03", on_leave: [], updates: [{ member_id: "alice" }] },
    ],
    blockers: [],
    reminders: [],
  };
  recomputeDerived(onLeaveSnapshot);
  assert.equal(onLeaveSnapshot.members[0].streak, 2);
  assert.equal(onLeaveSnapshot.members[0].last_submitted_date, "2026-07-03");

  // Bob: day1 submitted, day2 missing (not on leave — breaks the streak), day3 submitted.
  const missedSnapshot = {
    today: "2026-07-03",
    members: [{ member_id: "bob", active: true }],
    days: [
      { date: "2026-07-01", on_leave: [], updates: [{ member_id: "bob" }] },
      { date: "2026-07-02", on_leave: [], updates: [] },
      { date: "2026-07-03", on_leave: [], updates: [{ member_id: "bob" }] },
    ],
    blockers: [],
    reminders: [],
  };
  recomputeDerived(missedSnapshot);
  assert.equal(missedSnapshot.members[0].streak, 1);
});

test("recomputeDerived open_blockers counts only this member's open blockers", () => {
  const snapshot = {
    today: "2026-07-03",
    members: [{ member_id: "alice", active: true }],
    days: [{ date: "2026-07-03", on_leave: [], updates: [{ member_id: "alice" }] }],
    blockers: [
      { member_id: "alice", status: "open" },
      { member_id: "alice", status: "resolved" },
      { member_id: "bob", status: "open" },
    ],
    reminders: [],
  };
  recomputeDerived(snapshot);
  assert.equal(snapshot.members[0].open_blockers, 1);
});

test("computeMetrics: missing_today excludes submitted and on-leave members from expected", () => {
  const snapshot = {
    members: [
      { member_id: "alice", active: true, participation_30d: 1 },
      { member_id: "bob", active: true, participation_30d: 0.5 },
      { member_id: "carol", active: true, participation_30d: 0 },
    ],
    days: [
      {
        date: "2026-07-03",
        participation: { submitted: 1, expected: 3, on_leave: 1 },
      },
    ],
    blockers: [
      { status: "open", severity: "high" },
      { status: "open", severity: "low" },
      { status: "resolved", severity: "high" },
    ],
    reminders: [{ status: "needs_review" }, { status: "approved" }],
  };
  const metrics = computeMetrics(snapshot);
  assert.equal(metrics.missing_today, 1); // 3 expected - 1 submitted - 1 on_leave
  assert.equal(metrics.open_blockers, 2);
  assert.equal(metrics.high_open_blockers, 1);
  assert.equal(metrics.reminders_needs_review, 1);
  assert.equal(metrics.avg_participation_30d, 0.5); // (1 + 0.5 + 0) / 3
});

test("normalizeMember/normalizeBlocker/normalizeCheckin/normalizeReminder parse Busabase's snake_cased text fields", () => {
  const member = normalizeMember({ member_id: "alice", name: "Alice", active: "false" });
  assert.equal(member.active, false);
  assert.equal(member.name, "Alice");

  const blocker = normalizeBlocker({
    blocker_id: "bl-1",
    member_id: "alice",
    severity: "high",
    status: "open",
    text: "Blocked",
  });
  assert.equal(blocker.severity, "high");

  const checkin = normalizeCheckin({
    member_id: "alice",
    date: "2026-07-03",
    yesterday: '["Shipped X"]',
    today: '["Ship Y"]',
    blockers: '[{"blocker_id":"bl-1","text":"Blocked","severity":"high","status":"open"}]',
    mood: "ok",
  });
  assert.deepEqual(checkin.yesterday, ["Shipped X"]);
  assert.equal(checkin.blockers[0].blocker_id, "bl-1");

  const reminder = normalizeReminder({
    reminder_id: "rem-1",
    type: "missing_checkin",
    member_id: "bob",
    status: "approved",
    decision_action: "approve",
    decision_note: "go ahead",
    decided_at: "2026-07-03T00:00:00.000Z",
  });
  assert.deepEqual(reminder.decision, {
    action: "approve",
    note: "go ahead",
    draft: null,
    decided_at: "2026-07-03T00:00:00.000Z",
  });
});

test("buildSnapshot groups checkins into each day's updates[] by date and assigns stable reminder refs", () => {
  const members = [{ member_id: "alice", name: "Alice", active: "true" }];
  const days = [{ date: "2026-07-03", digest: "Shipped things", on_leave: "[]" }];
  const checkins = [
    {
      member_id: "alice",
      date: "2026-07-03",
      yesterday: '["Shipped X"]',
      today: '["Ship Y"]',
      blockers: "[]",
      mood: "good",
      submitted_at: "2026-07-03T01:00:00.000Z",
      source: "slack",
    },
  ];
  const blockers = [
    {
      blocker_id: "bl-1",
      member_id: "alice",
      raised_date: "2026-07-01",
      severity: "high",
      status: "open",
      text: "Blocked",
    },
  ];
  const reminders = [
    {
      reminder_id: "rem-b",
      created_at: "2026-07-02T00:00:00.000Z",
      type: "missing_checkin",
      member_id: "alice",
      channel: "slack",
      title: "B",
      status: "needs_review",
    },
    {
      reminder_id: "rem-a",
      created_at: "2026-07-01T00:00:00.000Z",
      type: "missing_checkin",
      member_id: "alice",
      channel: "slack",
      title: "A",
      status: "needs_review",
    },
  ];
  const settings = { team_name: "Nimbus", team_timezone: "Asia/Shanghai", team_workdays: '["mon","tue"]' };

  const snapshot = buildSnapshot({ members, days, checkins, blockers, reminders, settings });
  assert.equal(snapshot.team.name, "Nimbus");
  assert.equal(snapshot.today, "2026-07-03");
  assert.equal(snapshot.days[0].updates.length, 1);
  assert.equal(snapshot.days[0].updates[0].member_id, "alice");
  assert.equal(snapshot.members[0].open_blockers, 1);
  // Refs assigned by created_at ascending: rem-a (Jul 1) is ref 1, rem-b (Jul 2) is ref 2.
  assert.equal(snapshot.reminders.find((item) => item.id === "rem-a").ref, 1);
  assert.equal(snapshot.reminders.find((item) => item.id === "rem-b").ref, 2);
  assert.equal(snapshot.metrics.member_count, 1);
});

test("buildConfigSummary never exposes contact values, only the contact_env name and a configured boolean", () => {
  const summary = buildConfigSummary({
    settings: { team_name: "Nimbus", team_timezone: "Asia/Shanghai", standup_questions: '["Yesterday?"]' },
    members: [{ member_id: "alice", name: "Alice", contact_env: "KELLY_STANDUP_MEMBER_ALICE_CONTACT" }],
  });
  assert.equal(summary.members[0].contact_env, "KELLY_STANDUP_MEMBER_ALICE_CONTACT");
  assert.equal(summary.members[0].contact_ready, true);
  assert.deepEqual(summary.standup_questions, ["Yesterday?"]);
  assert.equal(Object.hasOwn(summary.members[0], "contact_value"), false);
});
