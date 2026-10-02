import assert from "node:assert/strict";
import test from "node:test";
import { appConfig } from "../app/js/config.js";
import {
  calendarRange,
  dayKey,
  filterRows,
  mergeRows,
  monthGrid,
  normalizeRecord,
  resolveOwnedBases,
  safeUrl,
} from "../app/js/model.js";

test("relation arrays normalize identically for initial and later pages", () => {
  const initial = normalizeRecord(
    { id: "art-1", fields: { sources: '[{"recordId":"src-1"},"src-2"]', "publish-date": "2026-09-30T08:00:00Z" } },
    "articles",
  );
  const later = normalizeRecord(
    { id: "art-2", headCommit: { payload: { sources: ["src-2"], "review-note": "核对引用" } } },
    "articles",
  );
  assert.deepEqual(initial.fields.sources, ["src-1", "src-2"]);
  assert.equal(initial.fields.publish_date, "2026-09-30T08:00:00Z");
  assert.equal(later.fields.review_note, "核对引用");
  assert.equal(mergeRows([initial], [initial, later]).length, 2);
});
test("calendar scopes a complete Monday-first 42-day range", () => {
  const grid = monthGrid(2026, 8);
  assert.equal(grid.length, 42);
  assert.equal(grid[0].getDay(), 1);
  assert.equal(dayKey(grid[0]), "2026-08-31");
  const range = calendarRange(2026, 8);
  assert.equal(range.fieldSlug, "publish-date");
  assert.equal(dayKey(range.lt), "2026-10-12");
});
test("combined search and topic/status filters preserve relevant loaded rows", () => {
  const records = [
    { id: "a", fields: { title: "公众号排期", topic: "workflow", status: "review" } },
    { id: "b", fields: { title: "公众号排期", topic: "growth", status: "planned" } },
  ];
  assert.deepEqual(
    filterRows(records, { query: "排期", topic: "workflow", status: "review" }).map((row) => row.id),
    ["a"],
  );
});
test("unsafe asset/source URLs are never rendered as links", () => {
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(safeUrl("data:text/html,<script>"), "");
  assert.equal(safeUrl("https://example.com/report"), "https://example.com/report");
});
test("resource binding stays inside the selected installation and refuses ambiguous ownership", () => {
  const stamp = (resourceKey) => ({ appId: appConfig.appId, resourceKey, schemaVersion: 1 });
  const folder = { id: "folder-one", metadata: stamp("app-root") };
  const children = ["sources", "articles"].map((key) => ({
    id: `node-${key}`,
    baseId: `base-${key}`,
    type: "base",
    slug: `custom-prefix-${key}`,
    metadata: stamp(key),
  }));
  assert.deepEqual(
    resolveOwnedBases(appConfig, folder, children).map((base) => base.baseId),
    ["base-sources", "base-articles"],
  );
  assert.throws(() => resolveOwnedBases(appConfig, { metadata: {} }, children), /SCHEMA_INCOMPLETE/);
  assert.throws(() => resolveOwnedBases(appConfig, folder, [...children, children[0]]), /SCHEMA_INCOMPLETE/);
  assert.throws(() => resolveOwnedBases(appConfig, folder, [children[0]]), /SCHEMA_INCOMPLETE/);
});
