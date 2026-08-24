import assert from "node:assert/strict";
import test from "node:test";

import { readAllPages } from "../app/js/providers/busabase-provider.js";

const base = { key: "strategies", baseId: "strategies-base", readLimit: 1_000 };

test("uses the provider-owned page size and loads every Busabase record page", async () => {
  const cursors = [];
  const limits = [];
  const client = {
    records: {
      async list({ cursor, limit }) {
        cursors.push(cursor || null);
        limits.push(limit);
        if (!cursor) {
          return { records: [{ id: "strategy-1", fields: { key: "one" } }], nextCursor: "page-2" };
        }
        return { records: [{ id: "strategy-2", fields: { key: "two" } }], nextCursor: null };
      },
    },
  };

  const page = await readAllPages(client, base);

  assert.deepEqual(cursors, [null, "page-2"]);
  assert.deepEqual(limits, [100, 100]);
  assert.deepEqual(
    page.records.map((record) => record.id),
    ["strategy-1", "strategy-2"],
  );
  assert.equal(page.pageCount, 2);
  assert.equal(page.nextCursor, null);
});

test("does not cap the complete dataset at 100 pages", async () => {
  let calls = 0;
  const client = {
    records: {
      async list({ limit }) {
        calls += 1;
        assert.equal(limit, 100);
        return {
          records: [{ id: `strategy-${calls}`, fields: { key: String(calls) } }],
          nextCursor: calls < 101 ? `page-${calls + 1}` : null,
        };
      },
    },
  };

  const page = await readAllPages(client, base);

  assert.equal(page.pageCount, 101);
  assert.equal(page.records.length, 101);
});

test("stops when Busabase repeats a pagination cursor", async () => {
  const client = {
    records: {
      async list() {
        return { records: [], nextCursor: "same-cursor" };
      },
    },
  };

  await assert.rejects(readAllPages(client, base), /PAGINATION_LOOP: strategies/);
});
