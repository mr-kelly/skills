import assert from "node:assert/strict";
import test from "node:test";
import {
  actionLabel,
  badgeLabel,
  escapeHtml,
  isImage,
  isPdf,
  languageLabel,
  parseEmailAddresses,
  shortSender,
  sizeLabel,
} from "../app/js/format.js";

test("escapeHtml escapes special characters correctly", () => {
  assert.equal(
    escapeHtml('<script>alert("xss")&</script>'),
    "&lt;script&gt;alert(&quot;xss&quot;)&amp;&lt;/script&gt;",
  );
  assert.equal(escapeHtml(""), "");
  assert.equal(escapeHtml(null), "");
});

test("shortSender strips quotes and cleans whitespace", () => {
  assert.equal(shortSender('"John Doe" <john@example.com>'), "<john@example.com>");
  assert.equal(shortSender("  Alice  Smith  "), "Alice Smith");
});

test("parseEmailAddresses extracts name and email address", () => {
  const parsed = parseEmailAddresses('"John Doe" <JOHN@example.com>, Jane <jane@example.com>');
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, "John Doe");
  assert.equal(parsed[0].address, "john@example.com");
  assert.equal(parsed[1].name, "Jane");
  assert.equal(parsed[1].address, "jane@example.com");
});

test("sizeLabel formats bytes accurately", () => {
  assert.equal(sizeLabel(0), "0 B");
  assert.equal(sizeLabel(512), "512 B");
  assert.equal(sizeLabel(2048), "2 KB");
  assert.equal(sizeLabel(2 * 1024 * 1024), "2.0 MB");
});

test("isImage and isPdf detect attachment types", () => {
  assert.equal(isImage({ content_type: "image/png" }), true);
  assert.equal(isImage({ content_type: "application/json" }), false);

  assert.equal(isPdf({ content_type: "application/pdf" }), true);
  assert.equal(isPdf({ filename: "document.pdf" }), true);
  assert.equal(isPdf({ filename: "document.txt" }), false);
});

test("badgeLabel and actionLabel format status and actions", () => {
  assert.equal(badgeLabel("needs_review"), "needs review");
  assert.equal(badgeLabel(""), "");

  assert.ok(actionLabel("archive"));
  assert.ok(actionLabel("mark_read"));
});

test("languageLabel returns expected code/fallback", () => {
  assert.equal(languageLabel("unknown"), "Unknown language");
  assert.equal(languageLabel(""), "Unknown language");
});
