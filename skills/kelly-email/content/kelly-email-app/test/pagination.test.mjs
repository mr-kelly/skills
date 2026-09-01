import assert from "node:assert/strict";
import test from "node:test";
import { appendStatePage } from "../app/js/store.js";
import { batchFromEmailRecords } from "../lib/data-provider/email-records.ts";

test("successive record pages use the same field normalizer", () => {
  const first = batchFromEmailRecords([
    {
      kind: "review_item",
      batch_id: "batch-1",
      record_id: "email-item-1",
      item_id: "1",
      email_uid: "1",
      subject: "First",
      risk: "security, money",
      attachment_refs: '[{"filename":"invoice.pdf","content_type":"application/pdf"}]',
    },
  ]);
  const second = batchFromEmailRecords([
    {
      kind: "review_item",
      batch_id: "batch-1",
      record_id: "email-item-2",
      item_id: "2",
      email_uid: "2",
      subject: "Second",
      risk: "course",
      attachment_refs: "",
    },
  ]);

  assert.deepEqual(first.items[0].risk, ["security", "money"]);
  assert.equal(first.items[0].attachments[0].filename, "invoice.pdf");
  assert.deepEqual(second.items[0].risk, ["course"]);
  assert.deepEqual(second.items[0].attachments, []);
});

test("appendStatePage accumulates pages without duplicating records", () => {
  const current = {
    items: [{ id: "1", subject: "Old", review_ref: "Review #1" }],
    counts: { needs_review: 1 },
    total_cached: 3,
    pagination: { batch_id: "batch-1", next_cursor: "cursor-2" },
  };
  const next = {
    items: [
      { id: "1", subject: "Updated", review_ref: "Review #1" },
      { id: "2", subject: "New", review_ref: "Review #1" },
    ],
    counts: { needs_review: 1, approved: 1 },
    total_cached: 3,
    pagination: { batch_id: "batch-1", next_cursor: null },
  };

  const merged = appendStatePage(current, next);
  assert.deepEqual(
    merged.items.map((item) => [item.id, item.subject]),
    [
      ["1", "Updated"],
      ["2", "New"],
    ],
  );
  assert.deepEqual(merged.counts, { needs_review: 2, approved: 1 });
  assert.deepEqual(
    merged.items.map((item) => item.review_ref),
    ["Review #1", "Review #2"],
  );
  assert.equal(merged.total_cached, 3);
  assert.equal(merged.pagination.next_cursor, null);
});
