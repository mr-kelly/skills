import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMinPriceGuard,
  buildConfigSummary,
  buildSnapshot,
  isFollowUpOverdue,
  recomputeMetrics,
  recomputeQuoteTotals,
  refreshInquiryDerived,
  staleInquiries,
  statusForAction,
  unansweredNew,
} from "../app/js/inquiry-model.js";

test("statusForAction maps every decision verdict", () => {
  assert.equal(statusForAction("approve"), "approved");
  assert.equal(statusForAction("request_changes"), "changes_requested");
  assert.equal(statusForAction("block"), "blocked");
  assert.equal(statusForAction("revise", "needs_review"), "needs_review");
  assert.equal(statusForAction("revise", "approved"), "approved");
  assert.equal(statusForAction("unknown", "needs_review"), "needs_review");
});

test("refreshInquiryDerived: a new inquiry with an outgoing reply is promoted to replied", () => {
  const inquiry = {
    stage: "new",
    messages: [
      { direction: "incoming", sender: "Klaus", text: "hi", sent_at: "2026-07-03T06:58:00.000Z" },
      { direction: "outgoing", sender: "Kelly", text: "hello", sent_at: "2026-07-03T07:00:00.000Z" },
    ],
  };
  refreshInquiryDerived(inquiry);
  assert.equal(inquiry.stage, "replied");
  assert.equal(inquiry.last_message_at, "2026-07-03T07:00:00.000Z");
  assert.equal(inquiry.last_incoming_at, "2026-07-03T06:58:00.000Z");
});

test("refreshInquiryDerived: a new inquiry with only incoming messages stays new", () => {
  const inquiry = {
    stage: "new",
    messages: [{ direction: "incoming", sender: "Lucía", text: "hola", sent_at: "2026-07-02T16:04:00.000Z" }],
  };
  refreshInquiryDerived(inquiry);
  assert.equal(inquiry.stage, "new");
});

test("refreshInquiryDerived: an explicit non-new stage is never downgraded", () => {
  const inquiry = {
    stage: "negotiating",
    messages: [{ direction: "incoming", sender: "Wei", text: "ok", sent_at: "2026-07-02T11:30:00.000Z" }],
  };
  refreshInquiryDerived(inquiry);
  assert.equal(inquiry.stage, "negotiating");
});

test("applyMinPriceGuard: flags a line priced below the product's price_min floor", () => {
  const products = [{ product_id: "prod-highbay-150", sku: "LL-HB-150U", price_min: 24.5 }];
  const quote = {
    items: [
      { product_id: "prod-highbay-150", sku: "LL-HB-150U", unit_price: 22.8 },
      { product_id: "prod-highbay-150", sku: "LL-HB-150U", unit_price: 26.0 },
    ],
  };
  applyMinPriceGuard(quote, products);
  assert.equal(quote.pricing_alerts.length, 1);
  assert.equal(quote.pricing_alerts[0].unit_price, 22.8);
  assert.equal(quote.pricing_alerts[0].price_min, 24.5);
});

test("applyMinPriceGuard: a quote priced at or above the floor has no alerts", () => {
  const products = [{ product_id: "prod-panel-6060", sku: "LL-PNL-6060-40", price_min: 6.8 }];
  const quote = { items: [{ product_id: "prod-panel-6060", sku: "LL-PNL-6060-40", unit_price: 7.4 }] };
  applyMinPriceGuard(quote, products);
  assert.equal(quote.pricing_alerts.length, 0);
});

test("recomputeQuoteTotals: worked example matching Q-2026-0731 (2000 panels + 400 track lights)", () => {
  const quote = {
    items: [
      { line_id: "l1", qty: 2000, unit_price: 7.4 },
      { line_id: "l2", qty: 400, unit_price: 9.2 },
    ],
  };
  recomputeQuoteTotals(quote);
  assert.equal(quote.items[0].total, 14800);
  assert.equal(quote.items[1].total, 3680);
  assert.equal(quote.subtotal, 18480);
  assert.equal(quote.total, 18480);
});

test("staleInquiries / isFollowUpOverdue: only active-stage inquiries past next_follow_up are stale", () => {
  const reference = "2026-07-03T09:00:00.000Z"; // today = 2026-07-03
  const overdueQuoted = { inquiry_id: "a", stage: "quoted", next_follow_up: "2026-06-30" };
  const overdueReplied = { inquiry_id: "b", stage: "replied", next_follow_up: "2026-07-02" };
  const notYetDue = { inquiry_id: "c", stage: "negotiating", next_follow_up: "2026-07-10" };
  const wonWithPastDate = { inquiry_id: "d", stage: "won", next_follow_up: "2026-06-01" };
  const noDate = { inquiry_id: "e", stage: "new", next_follow_up: "" };

  const stale = staleInquiries([overdueQuoted, overdueReplied, notYetDue, wonWithPastDate, noDate], reference);
  assert.deepEqual(
    stale.map((i) => i.inquiry_id),
    ["a", "b"], // sorted by next_follow_up ascending
  );
  assert.equal(isFollowUpOverdue(overdueQuoted, reference), true);
  assert.equal(isFollowUpOverdue(notYetDue, reference), false);
  assert.equal(isFollowUpOverdue(wonWithPastDate, reference), false); // won is not an active stage
  assert.equal(isFollowUpOverdue(noDate, reference), false);
});

test("unansweredNew: a new inquiry with no outgoing message is unanswered", () => {
  const answered = {
    stage: "new",
    messages: [
      { direction: "incoming", sent_at: "1" },
      { direction: "outgoing", sent_at: "2" },
    ],
  };
  const unanswered = { stage: "new", messages: [{ direction: "incoming", sent_at: "1" }] };
  const replied = { stage: "replied", messages: [] };
  assert.deepEqual(unansweredNew([answered, unanswered, replied]), [unanswered]);
});

test("recomputeMetrics: stage counts, win rate, and reply median", () => {
  const snapshot = {
    generated_at: "2026-07-03T09:00:00.000Z",
    inquiries: [
      {
        stage: "won",
        channel: "whatsapp",
        created_at: "2026-07-02T00:00:00.000Z",
        messages: [
          { direction: "incoming", sent_at: "2026-07-02T00:00:00.000Z" },
          { direction: "outgoing", sent_at: "2026-07-02T00:10:00.000Z" },
        ],
      },
      {
        stage: "lost",
        channel: "email",
        created_at: "2026-07-01T00:00:00.000Z",
        messages: [
          { direction: "incoming", sent_at: "2026-07-01T00:00:00.000Z" },
          { direction: "outgoing", sent_at: "2026-07-01T00:20:00.000Z" },
        ],
      },
      { stage: "new", channel: "whatsapp", created_at: "2026-07-03T00:00:00.000Z", messages: [] },
    ],
    quotes: [{ status: "sent" }, { status: "draft" }],
    products: [{ product_id: "p1" }],
    accounts: [{ account_id: "a1" }],
  };
  recomputeMetrics(snapshot);
  assert.equal(snapshot.metrics.inquiry_count, 3);
  assert.equal(snapshot.metrics.win_rate, 0.5);
  // replyDeltas = [10, 20] minutes; median index = floor((2-1)/2) = 0 -> 10.
  assert.equal(snapshot.metrics.reply_median_minutes, 10);
  assert.equal(snapshot.metrics.quotes_sent, 1);
  assert.equal(snapshot.metrics.unanswered_new_count, 1);
  assert.deepEqual(snapshot.metrics.stage_counts, { new: 1, replied: 0, quoted: 0, negotiating: 0, won: 1, lost: 1 });
});

test("buildSnapshot: joins messages onto inquiries, derives stage/totals/guard live, assigns approval refs", () => {
  const snapshot = buildSnapshot({
    accounts: [{ account_id: "wa-sales", channel: "whatsapp", connector: "whatsapp_cloud", display_name: "WA" }],
    inquiries: [
      {
        inquiry_id: "inq-a",
        account_id: "wa-sales",
        channel: "whatsapp",
        customer_name: "Klaus",
        stage: "new",
        created_at: "2026-07-03T06:00:00.000Z",
      },
      {
        inquiry_id: "inq-b",
        account_id: "wa-sales",
        channel: "whatsapp",
        customer_name: "Rafael",
        stage: "new",
        created_at: "2026-07-02T06:00:00.000Z",
      },
    ],
    messages: [
      {
        message_id: "m1",
        inquiry_id: "inq-a",
        direction: "incoming",
        sender: "Klaus",
        sent_at: "2026-07-03T06:00:00.000Z",
      },
      {
        message_id: "m2",
        inquiry_id: "inq-b",
        direction: "incoming",
        sender: "Rafael",
        sent_at: "2026-07-02T06:00:00.000Z",
      },
      {
        message_id: "m3",
        inquiry_id: "inq-b",
        direction: "outgoing",
        sender: "Kelly",
        sent_at: "2026-07-02T07:00:00.000Z",
      },
    ],
    products: [{ product_id: "prod-1", sku: "SKU-1", price_min: "10" }],
    quotes: [
      {
        quote_id: "q1",
        inquiry_id: "inq-a",
        items: JSON.stringify([{ line_id: "l1", product_id: "prod-1", sku: "SKU-1", qty: 2, unit_price: 5 }]),
      },
    ],
    approvals: [
      {
        item_id: "ap-2",
        inquiry_id: "inq-a",
        kind: "reply",
        status: "needs_review",
        created_at: "2026-07-03T08:00:00.000Z",
      },
      {
        item_id: "ap-1",
        inquiry_id: "inq-b",
        kind: "reply",
        status: "needs_review",
        created_at: "2026-07-02T08:00:00.000Z",
      },
    ],
  });

  const a = snapshot.inquiries.find((i) => i.inquiry_id === "inq-a");
  const b = snapshot.inquiries.find((i) => i.inquiry_id === "inq-b");
  assert.equal(a.stage, "new"); // only incoming messages -> stays new
  assert.equal(b.stage, "replied"); // has an outgoing message -> promoted
  assert.equal(snapshot.accounts[0].inquiry_count, 2);

  const quote = snapshot.quotes.find((q) => q.quote_id === "q1");
  assert.equal(quote.total, 10); // 2 * 5 recomputed
  assert.equal(quote.pricing_alerts.length, 1); // 5 < price_min 10

  // refs assigned by created_at ascending: ap-1 (07-02) before ap-2 (07-03).
  const ap1 = snapshot.approvals.find((item) => item.item_id === "ap-1");
  const ap2 = snapshot.approvals.find((item) => item.item_id === "ap-2");
  assert.equal(ap1.ref, 1);
  assert.equal(ap2.ref, 2);
});

test("buildConfigSummary: never exposes secret values, only env-var names and readiness", () => {
  const summary = buildConfigSummary({
    settings: {
      quote_defaults: JSON.stringify({ currency: "USD", min_price_guard: { enabled: true } }),
      follow_up: JSON.stringify({ sla_days: { new: 1 } }),
      reply_style: JSON.stringify({ tone: "warm" }),
      kb_source_path: "/path/to/products.json",
    },
    accounts: [
      {
        account_id: "wa-sales",
        channel: "whatsapp",
        connector: "whatsapp_cloud",
        access_token_env: "TOKEN_ENV",
        status: "ok",
      },
      { account_id: "sales-email", channel: "email", connector: "email_agent", status: "ok" },
    ],
  });
  assert.deepEqual(summary.quote_defaults, { currency: "USD", min_price_guard: { enabled: true } });
  assert.equal(summary.product_kb.source_path, "/path/to/products.json");
  const wa = summary.accounts.find((a) => a.account_id === "wa-sales");
  assert.deepEqual(wa.secret_envs, ["TOKEN_ENV"]);
  assert.equal(wa.secrets_ready, true);
  const email = summary.accounts.find((a) => a.account_id === "sales-email");
  assert.deepEqual(email.secret_envs, []);
  assert.equal(email.secrets_ready, true);
});
