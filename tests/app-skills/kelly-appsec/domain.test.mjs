import assert from "node:assert/strict";
import test from "node:test";
import { evaluateResponse, parseOpenApi, redact, validateCase } from "../../../skills/kelly-appsec/lib/domain.mjs";

test("API inventory preserves concrete source locations and does not invent authorization policy", () => {
  const inventory = parseOpenApi(
    {
      openapi: "3.1.0",
      info: { title: "Synthetic order API", version: "1" },
      paths: {
        "/orders/{id}": {
          get: { operationId: "readOrder", responses: { 200: { description: "OK" } } },
          parameters: [{ name: "id", in: "path", required: true }],
        },
      },
    },
    { sourceRevision: "fixture-rev", sourceLocation: "fixture:openapi.json" },
  );
  assert.equal(inventory.sourceRevision, "fixture-rev");
  assert.equal(inventory.endpoints.length, 1);
  assert.equal(inventory.endpoints[0].path, "/orders/{id}");
  assert.equal(inventory.endpoints[0].method, "GET");
  assert.ok(inventory.endpoints[0].location.includes("fixture:openapi.json"));
  assert.deepEqual(inventory.rules, []);
});

test("a successful positive baseline is required before interpreting denial or leaked forbidden data", () => {
  const rule = validateCase({
    key: "cross",
    endpointKey: "private",
    identity: "other-user",
    expectation: "deny",
    expectedStatuses: [403],
    forbiddenAssertions: [{ path: "id", equals: "private-object" }],
    objectId: "private-object",
    baselineRuleKey: "own",
    policyNote: "Only the resource owner may read this private object.",
    confirmed: true,
  });
  for (const [status, body] of [
    [403, { error: "forbidden" }],
    [403, { id: "private-object" }],
    [200, { id: "private-object" }],
  ]) {
    assert.equal(evaluateResponse(rule, { status, body, baselineSatisfied: false }).result, "inconclusive");
  }
  assert.equal(
    evaluateResponse(rule, { status: 200, body: { id: "public-info" }, baselineSatisfied: true }).result,
    "inconclusive",
  );
  assert.equal(
    evaluateResponse(rule, { status: 403, body: { id: "private-object" }, baselineSatisfied: true }).result,
    "violated",
  );
  assert.equal(
    evaluateResponse(rule, { status: 403, body: { error: "forbidden" }, baselineSatisfied: true }).result,
    "satisfied",
  );
});

test("redaction removes headers, private material and sensitive URL query values", () => {
  const output = redact({
    authorization: "Bearer synthetic-token",
    password: "synthetic-password",
    nested: { cookie: "session=synthetic-cookie" },
    url: "https://user:synthetic-password@example.test/api?token=synthetic-query",
    privateKey: "-----BEGIN PRIVATE KEY-----\nsynthetic-key\n-----END PRIVATE KEY-----",
  });
  for (const value of ["synthetic-token", "synthetic-password", "synthetic-cookie", "synthetic-query", "synthetic-key"])
    assert.ok(!output.includes(value), value);
});
