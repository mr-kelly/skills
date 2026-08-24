import assert from "node:assert/strict";
import test from "node:test";
import {
  buildConfigSummary,
  buildSnapshot,
  recomputeMetrics,
  refreshTicketDerived,
  runQualityGate,
  statusForAction,
} from "../app/js/support-model.js";

test("statusForAction maps every decision verdict", () => {
  assert.equal(statusForAction("approve"), "approved");
  assert.equal(statusForAction("request_changes"), "changes_requested");
  assert.equal(statusForAction("block"), "blocked");
  assert.equal(statusForAction("revise", "needs_review"), "needs_review");
  assert.equal(statusForAction("revise", "approved"), "approved");
  assert.equal(statusForAction("unknown", "needs_review"), "needs_review");
});

test("refreshTicketDerived: SLA breach is derived from due_by vs the reference time, never trusted", () => {
  const reference = "2026-07-06T09:00:00.000Z";

  // Open ticket, no first response, due_by already passed -> breached.
  const overdue = {
    status: "needs_review",
    sla: { policy: "first_response", due_by: "2026-07-06T07:00:00.000Z", breached: false },
    messages: [{ direction: "incoming", sender: "Customer", text: "help", sent_at: "2026-07-06T05:10:00.000Z" }],
  };
  refreshTicketDerived(overdue, reference);
  assert.equal(overdue.sla.breached, true);

  // Open ticket, due_by in the future -> not breached.
  const notYet = {
    status: "needs_review",
    sla: { policy: "first_response", due_by: "2026-07-06T13:00:00.000Z", breached: false },
    messages: [],
  };
  refreshTicketDerived(notYet, reference);
  assert.equal(notYet.sla.breached, false);

  // Resolved ("done") ticket is never breached, even past due_by.
  const resolved = {
    status: "done",
    sla: { policy: "first_response", due_by: "2026-07-06T07:00:00.000Z", breached: false },
    messages: [],
  };
  refreshTicketDerived(resolved, reference);
  assert.equal(resolved.sla.breached, false);

  // last_message_at / last_incoming_at derive from the messages array.
  const withMessages = {
    status: "needs_review",
    sla: { policy: "first_response", due_by: "", breached: false },
    messages: [
      { direction: "incoming", sender: "A", text: "hi", sent_at: "2026-07-06T05:00:00.000Z" },
      { direction: "outgoing", sender: "Kelly", text: "hello", sent_at: "2026-07-06T05:05:00.000Z" },
    ],
  };
  refreshTicketDerived(withMessages, reference);
  assert.equal(withMessages.last_message_at, "2026-07-06T05:05:00.000Z");
  assert.equal(withMessages.last_incoming_at, "2026-07-06T05:00:00.000Z");
  assert.equal(withMessages.sla.first_response_at, "2026-07-06T05:05:00.000Z");
});

test("runQualityGate: grounded reply within policy -> SHIP", () => {
  const ticket = {
    suggested_reply:
      "Hi David! Head to Settings -> Data -> Export and choose Markdown, PDF, or a full ZIP archive. Want me to trigger the export for you?",
    kb_refs: ["kb-export"],
    proposed_action: "send_reply",
    status: "needs_review",
  };
  const kb = [{ article_id: "kb-export" }];
  const gate = runQualityGate(ticket, kb, {});
  assert.equal(gate.verdict, "ship");
  assert.equal(gate.score, 100);
});

test("runQualityGate: a reply promising a refund without approval is a hard BLOCK", () => {
  const ticket = {
    suggested_reply: "I can refund the €120 annual charge to your original card and process that refund right away.",
    kb_refs: ["kb-refunds"],
    proposed_action: "refund",
    status: "needs_review",
    execution: { amount: 120 },
  };
  const kb = [{ article_id: "kb-refunds" }];
  const risk = { refund_requires_approval: true, block_commitments_without_approval: true };
  const gate = runQualityGate(ticket, kb, risk);
  assert.equal(gate.verdict, "block");
  const commitmentCheck = gate.checks.find((c) => c.id === "no_unapproved_commitment");
  assert.equal(commitmentCheck.ok, false);
  const refundCheck = gate.checks.find((c) => c.id === "refund_policy");
  assert.equal(refundCheck.ok, false);
});

test("runQualityGate: the same refund reply on an APPROVED refund action clears the gate", () => {
  const ticket = {
    suggested_reply: "I can refund the €120 annual charge to your original card and process that refund right away.",
    kb_refs: ["kb-refunds"],
    proposed_action: "refund",
    status: "approved",
    execution: { amount: 120 },
  };
  const kb = [{ article_id: "kb-refunds" }];
  const risk = { refund_requires_approval: true, block_commitments_without_approval: true };
  const gate = runQualityGate(ticket, kb, risk);
  assert.equal(gate.verdict, "ship");
});

test("runQualityGate: a dangling KB ref is a FIX, not a BLOCK", () => {
  const ticket = {
    suggested_reply:
      "Hi Ola! Yes - go to Settings -> Data -> Import and pick 'Evernote (.enx)'. Upload your export and we'll bring over notes, notebooks, and attachments.",
    kb_refs: ["kb-import"],
    proposed_action: "send_reply",
    status: "needs_review",
  };
  const kb = [{ article_id: "kb-export" }];
  const gate = runQualityGate(ticket, kb, {});
  assert.equal(gate.verdict, "fix");
  assert.equal(gate.checks.find((c) => c.id === "kb_refs_resolve").ok, false);
});

test("runQualityGate: a short acknowledgement is exempt from grounding", () => {
  const ticket = {
    suggested_reply: "Thanks for reaching out!",
    kb_refs: [],
    proposed_action: "send_reply",
    status: "needs_review",
  };
  const gate = runQualityGate(ticket, [], {});
  assert.equal(gate.verdict, "ship");
});

test("recomputeMetrics: CSAT average, status counts, and SLA breach count", () => {
  const snapshot = {
    generated_at: "2026-07-06T09:00:00.000Z",
    tickets: [
      {
        status: "needs_review",
        category: "bug",
        channel: "email",
        created_at: "2026-07-06T08:00:00.000Z",
        messages: [],
        sla: { breached: true },
      },
      {
        status: "approved",
        category: "billing",
        channel: "webchat",
        created_at: "2026-07-06T08:00:00.000Z",
        messages: [],
        sla: { breached: false },
      },
      {
        status: "done",
        category: "how_to",
        channel: "email",
        created_at: "2026-07-05T08:00:00.000Z",
        messages: [],
        sla: { breached: false },
        csat: { score: 5, rated_at: "2026-07-05T10:00:00.000Z" },
      },
      {
        status: "done",
        category: "how_to",
        channel: "email",
        created_at: "2026-07-04T08:00:00.000Z",
        messages: [],
        sla: { breached: false },
        csat: { score: 3, rated_at: "2026-07-04T10:00:00.000Z" },
      },
    ],
    knowledge_base: [],
    accounts: [{ account_id: "a" }],
  };
  recomputeMetrics(snapshot);
  assert.equal(snapshot.metrics.ticket_count, 4);
  assert.equal(snapshot.metrics.breaching_sla_count, 1);
  assert.equal(snapshot.metrics.resolved_count, 2);
  assert.equal(snapshot.metrics.csat_average, 4);
  assert.equal(snapshot.metrics.csat_responses, 2);
  assert.deepEqual(snapshot.metrics.status_counts, {
    needs_review: 1,
    changes_requested: 0,
    approved: 1,
    done: 2,
    blocked: 0,
  });
});

test("buildSnapshot: joins messages onto tickets, derives quality_gate/refs live, and assigns stable refs", () => {
  const snapshot = buildSnapshot({
    accounts: [{ account_id: "email-support", channel: "email", connector: "email_agent", display_name: "Support" }],
    tickets: [
      {
        ticket_id: "tk-a",
        account_id: "email-support",
        channel: "email",
        subject: "Refund please",
        suggested_reply: "I will refund you right away, guaranteed.",
        kb_refs: JSON.stringify(["kb-refunds"]),
        proposed_action: "refund",
        status: "needs_review",
        created_at: "2026-07-06T08:00:00.000Z",
      },
      {
        ticket_id: "tk-b",
        account_id: "email-support",
        channel: "email",
        subject: "How to export",
        suggested_reply: "Head to Settings, Data, Export to download your notes as a ZIP archive today.",
        kb_refs: JSON.stringify(["kb-export"]),
        proposed_action: "send_reply",
        status: "needs_review",
        created_at: "2026-07-05T08:00:00.000Z",
      },
    ],
    messages: [
      {
        message_id: "m1",
        ticket_id: "tk-a",
        direction: "incoming",
        sender: "Cust",
        text: "hi",
        sent_at: "2026-07-06T08:00:00.000Z",
      },
      {
        message_id: "m2",
        ticket_id: "tk-b",
        direction: "incoming",
        sender: "Cust",
        text: "hi",
        sent_at: "2026-07-05T08:00:00.000Z",
      },
    ],
    knowledge_base: [{ article_id: "kb-export", title: "Export" }],
    risk_policy: { block_commitments_without_approval: true },
  });

  const a = snapshot.tickets.find((t) => t.ticket_id === "tk-a");
  const b = snapshot.tickets.find((t) => t.ticket_id === "tk-b");
  assert.equal(a.messages.length, 1);
  assert.equal(a.quality_gate.verdict, "block"); // unapproved refund commitment
  assert.equal(b.quality_gate.verdict, "ship"); // grounded, no commitment
  // refs assigned by created_at ascending: tk-b (07-05) before tk-a (07-06).
  assert.equal(b.ref, 1);
  assert.equal(a.ref, 2);
  assert.equal(snapshot.accounts[0].ticket_count, 2);
  // buildWarnings surfaces the BLOCK ticket.
  assert.ok(snapshot.warnings.some((w) => w.id === "tk-a-quality-block"));
});

test("buildConfigSummary: never exposes secret values, only env-var names and readiness", () => {
  const summary = buildConfigSummary({
    settings: {
      sla_policy: JSON.stringify({ first_response_hours: { urgent: 2 } }),
      risk_policy: JSON.stringify({ refund_requires_approval: true }),
      reply_style: JSON.stringify({ tone: "warm" }),
      kb_source_path: "/path/to/kb.json",
    },
    accounts: [
      {
        account_id: "wa",
        channel: "whatsapp",
        connector: "whatsapp_cloud",
        access_token_env: "TOKEN_ENV",
        status: "ok",
      },
      { account_id: "email-support", channel: "email", connector: "email_agent", status: "ok" },
    ],
  });
  assert.deepEqual(summary.sla_policy, { first_response_hours: { urgent: 2 } });
  assert.equal(summary.knowledge_base.source_path, "/path/to/kb.json");
  const wa = summary.accounts.find((a) => a.account_id === "wa");
  assert.deepEqual(wa.secret_envs, ["TOKEN_ENV"]);
  assert.equal(wa.secrets_ready, true);
  const email = summary.accounts.find((a) => a.account_id === "email-support");
  assert.deepEqual(email.secret_envs, []);
  assert.equal(email.secrets_ready, true);
});
