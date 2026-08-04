import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConfigSummary,
  buildOutbox,
  buildSnapshot,
  normalizeAccount,
  normalizeConversation,
  normalizeMessage,
  normalizeReply,
  recomputeMetrics,
  statusForAction,
} from "../app/js/messenger-model.js";

test("statusForAction maps every reply verdict, ported from local-file-provider.ts's decideReply", () => {
  assert.equal(statusForAction("approve"), "approved");
  assert.equal(statusForAction("request_changes"), "changes_requested");
  assert.equal(statusForAction("block"), "blocked");
  // "revise" (Save edit) never changes status: it stays whatever it was.
  assert.equal(statusForAction("revise", "needs_review"), "needs_review");
  assert.equal(statusForAction("revise", "approved"), "approved");
  // Unknown actions are treated the same as "revise": no status change.
  assert.equal(statusForAction("unknown", "blocked"), "blocked");
});

test("normalizeAccount/normalizeConversation/normalizeMessage/normalizeReply parse Busabase's snake_cased text fields", () => {
  const account = normalizeAccount({ account_id: "wa-biz", platform: "whatsapp", connector: "whatsapp_cloud" });
  assert.equal(account.display_name, "wa-biz");
  assert.equal(account.status, "not_configured");

  const conversation = normalizeConversation({
    conversation_id: "wa-lena",
    participants: '["Lena","Kelly"]',
    unread: "true",
    awaiting_reply: "false",
  });
  assert.deepEqual(conversation.participants, ["Lena", "Kelly"]);
  assert.equal(conversation.unread, true);
  assert.equal(conversation.awaiting_reply, false);

  const message = normalizeMessage({ message_id: "m1", direction: "outgoing", text: "hi" });
  assert.equal(message.direction, "outgoing");

  const reply = normalizeReply({
    reply_id: "reply-1",
    status: "approved",
    decision_action: "approve",
    decision_comment: "go ahead",
    decided_at: "2026-07-02T09:00:00.000Z",
  });
  assert.deepEqual(reply.decision, { action: "approve", comment: "go ahead", decided_at: "2026-07-02T09:00:00.000Z" });
  assert.equal(reply.execution, null);
});

test("buildSnapshot groups messages by conversation-id, derives last_message_at/last_incoming_at, and sorts by latest activity", () => {
  const accounts = [{ account_id: "wa-biz", platform: "whatsapp", connector: "whatsapp_cloud", status: "ok" }];
  const conversations = [
    { conversation_id: "wa-lena", account_id: "wa-biz", title: "Lena", unread: "true", awaiting_reply: "true" },
    { conversation_id: "wa-marco", account_id: "wa-biz", title: "Marco", unread: "false", awaiting_reply: "false" },
  ];
  const messages = [
    { message_id: "m1", conversation_id: "wa-lena", direction: "incoming", sent_at: "2026-07-02T09:00:00.000Z" },
    { message_id: "m2", conversation_id: "wa-lena", direction: "outgoing", sent_at: "2026-07-02T09:05:00.000Z" },
    { message_id: "m3", conversation_id: "wa-lena", direction: "incoming", sent_at: "2026-07-02T09:10:00.000Z" },
    { message_id: "m4", conversation_id: "wa-marco", direction: "outgoing", sent_at: "2026-07-01T09:00:00.000Z" },
  ];

  const snapshot = buildSnapshot({ accounts, conversations, messages, sync_log: [] });
  const lena = snapshot.conversations.find((item) => item.conversation_id === "wa-lena");
  assert.equal(lena.messages.length, 3);
  assert.equal(lena.last_message_at, "2026-07-02T09:10:00.000Z");
  // last_incoming_at is the most recent INCOMING message, not the most recent message overall.
  assert.equal(lena.last_incoming_at, "2026-07-02T09:10:00.000Z");
  // Sorted by latest activity: wa-lena (Jul 2) before wa-marco (Jul 1).
  assert.deepEqual(
    snapshot.conversations.map((item) => item.conversation_id),
    ["wa-lena", "wa-marco"],
  );
  assert.equal(snapshot.accounts[0].conversation_count, 2);
  assert.equal(snapshot.accounts[0].unread_count, 1);
  assert.equal(snapshot.metrics.message_count, 4);
  assert.equal(snapshot.metrics.unread_count, 1);
  assert.equal(snapshot.metrics.awaiting_reply_count, 1);
  assert.equal(snapshot.warnings.length, 0);
});

test("buildSnapshot emits a no-accounts warning when nothing is configured yet", () => {
  const snapshot = buildSnapshot({});
  assert.equal(snapshot.warnings.length, 1);
  assert.equal(snapshot.warnings[0].id, "no-accounts");
});

test("recomputeMetrics matches the retired lib/data-provider/common.ts formula exactly", () => {
  const snapshot = {
    accounts: [{}, {}],
    conversations: [
      { unread: true, awaiting_reply: true, messages: [{}, {}] },
      { unread: false, awaiting_reply: false, messages: [{}] },
    ],
  };
  recomputeMetrics(snapshot);
  assert.deepEqual(snapshot.metrics, {
    account_count: 2,
    conversation_count: 2,
    message_count: 3,
    unread_count: 1,
    awaiting_reply_count: 1,
  });
});

test("buildOutbox assigns stable refs by created_at ascending, independent of Busabase read order", () => {
  const replies = [
    { reply_id: "reply-b", created_at: "2026-07-02T00:00:00.000Z", status: "needs_review" },
    { reply_id: "reply-a", created_at: "2026-07-01T00:00:00.000Z", status: "needs_review" },
  ];
  const outbox = buildOutbox({ replies });
  assert.equal(outbox.replies.find((item) => item.reply_id === "reply-a").ref, 1);
  assert.equal(outbox.replies.find((item) => item.reply_id === "reply-b").ref, 2);
});

test("buildConfigSummary never exposes secret values, only the env-var name and a status-derived readiness proxy", () => {
  const summary = buildConfigSummary({
    settings: { reply_style_tone: "warm", sync_cadence_minutes: "30" },
    accounts: [
      { account_id: "slack-team", bot_token_env: "KELLY_MESSENGER_SLACK_BOT_TOKEN", status: "ok" },
      { account_id: "discord-community", bot_token_env: "KELLY_MESSENGER_DISCORD_BOT_TOKEN", status: "warning" },
    ],
  });
  assert.deepEqual(summary.reply_style, { tone: "warm", language: "" });
  assert.equal(summary.sync.cadence_minutes, 30);
  assert.deepEqual(summary.accounts[0].secret_envs, ["KELLY_MESSENGER_SLACK_BOT_TOKEN"]);
  assert.equal(summary.accounts[0].secrets_ready, true);
  assert.equal(summary.accounts[1].secrets_ready, false);
  assert.equal(Object.hasOwn(summary.accounts[0], "bot_token_env"), false);
});
