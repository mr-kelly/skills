import assert from "node:assert/strict";
import test from "node:test";
import { inventoryExample } from "../content/kelly-appsec-app/app/js/model.js";
import {
  encodeFields,
  evaluateResponse,
  parseOpenApi,
  redact,
  validateInventory,
  validateOrigin,
  validatePath,
} from "../lib/domain.mjs";
test("denial needs baseline and forbidden data; status alone cannot prove vulnerability", () => {
  const rule = validateInventory(inventoryExample("rev-a")).rules[1];
  assert.equal(
    evaluateResponse(rule, { status: 200, body: { id: "test-b" }, baselineSatisfied: false }).result,
    "inconclusive",
  );
  assert.equal(
    evaluateResponse(rule, { status: 200, body: { message: "public status" }, baselineSatisfied: true }).result,
    "inconclusive",
  );
  assert.equal(
    evaluateResponse(rule, { status: 403, body: { id: "test-b" }, baselineSatisfied: true }).result,
    "violated",
  );
  assert.equal(
    evaluateResponse(rule, { status: 404, body: { error: "not found" }, baselineSatisfied: true }).result,
    "satisfied",
  );
});
test("schema rejects foreign refs, credentials, ambiguous denial and unsafe paths", () => {
  const base = inventoryExample("rev-a");
  for (const mutate of [
    (value) => (value.rules[0].endpointKey = "missing"),
    (value) => (value.rules[1].baselineRuleKey = ""),
    (value) => (value.rules[0].requestBody = { authorization: "secret" }),
    (value) => (value.endpoints[0].path = "//other.test/path"),
    (value) => (value.rules[0].assertions = [{ path: "__proto__.bad", equals: true }]),
  ]) {
    const value = structuredClone(base);
    mutate(value);
    assert.throws(() => validateInventory(value));
  }
  for (const value of ["https://example.test/path", "https://u:p@example.test", "http://example.test"])
    assert.throws(() => validateOrigin(value));
  for (const value of ["/%252e%252e/secret", "/x%0ay", "/x\\y"]) assert.throws(() => validatePath(value));
  assert.equal(validateOrigin("http://127.0.0.1:1234"), "http://127.0.0.1:1234");
});
test("OpenAPI inventories operations without deriving executable targets", () => {
  const result = parseOpenApi(
    {
      openapi: "3.1.0",
      servers: [{ url: "https://unapproved.example" }],
      paths: { "/orders/{id}": { parameters: [], get: { operationId: "read", tags: ["Orders"] } } },
    },
    { sourceRevision: "rev-a" },
  );
  assert.equal(result.endpoints[0].path, "/orders/{id}");
  assert.equal(result.rules.length, 0);
  assert.equal(result.endpoints[0].method, "GET");
});
test("native scalar encoding and redaction retain useful evidence without credentials", () => {
  assert.equal(
    encodeFields({ "expected-statuses": [200], "rule-snapshot": [], project: "rec1" })["expected-statuses"],
    "[200]",
  );
  const result = redact({
    authorization: "Bearer synthetic-secret",
    cookie: "sid=private",
    password: "private",
    id: "test-b",
  });
  assert.ok(!result.includes("synthetic-secret"));
  assert.ok(!result.includes("private"));
  assert.ok(result.includes("test-b"));
});
