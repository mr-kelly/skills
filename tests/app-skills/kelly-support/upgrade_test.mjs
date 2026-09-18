import assert from "node:assert/strict";
import { appConfig } from "../../../skills/kelly-support/content/kelly-support-app/app/js/config.js";
import {
  inspectProvisionedResources,
  provisionDeclaredResources,
} from "../../../skills/kelly-support/node_modules/busabase-sdk/dist/airapp.js";
import { createBusabaseClient } from "../../../skills/kelly-support/node_modules/busabase-sdk/dist/index.js";

const baseUrl = process.argv[2];
if (!baseUrl) throw new Error("Usage: node upgrade_test.mjs <busabase-url>");
const client = createBusabaseClient({ baseUrl });
const v3TicketFields = new Set([
  "execution-last-error",
  "execution-next-retry-at",
  "execution-claim-expires-at",
  "execution-retryable",
]);
const v3MessageFields = new Set(["provider-message-id", "provider-references"]);
const v2 = structuredClone(appConfig);
v2.schemaVersion = 2;
v2.airApp = undefined;
for (const base of v2.bases) {
  if (base.key === "tickets") base.fields = base.fields.filter((field) => !v3TicketFields.has(field.slug));
  if (base.key === "messages") base.fields = base.fields.filter((field) => !v3MessageFields.has(field.slug));
}

const v2State = await provisionDeclaredResources(client, v2);
assert.equal(v2State.missing.length, 0);
assert.equal(v2State.repairs.length, 0);
const upgraded = await provisionDeclaredResources(client, { ...appConfig, airApp: undefined });
assert.equal(upgraded.missing.length, 0);
assert.equal(upgraded.repairs.length, 0);
const inspected = await inspectProvisionedResources(client, { ...appConfig, airApp: undefined });
assert.equal(inspected.repairs.length, 0);
for (const key of ["tickets", "messages"]) {
  const resource = inspected.bases.find((base) => base.key === key);
  const actual = await client.bases.get({ baseId: resource.baseId });
  const expected = appConfig.bases.find((base) => base.key === key);
  assert.deepEqual(
    actual.fields.map((field) => field.slug),
    expected.fields.map((field) => field.slug),
  );
}
console.log("PASS v2 -> v3 additive schema upgrade");
