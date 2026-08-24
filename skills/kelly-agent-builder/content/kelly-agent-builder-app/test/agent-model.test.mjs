import assert from "node:assert/strict";
import test from "node:test";
import {
  activateAgent,
  applyUpdate,
  archiveAgent,
  createAgent,
  deriveAgent,
  isQuotaReached,
  missingRequiredFields,
  pauseAgent,
  sanitizeTools,
  summarize,
} from "../app/js/agent-model.js";

test("missingRequiredFields flags every gate for draft -> live", () => {
  assert.deepEqual(missingRequiredFields({ allowed_tools: [] }), [
    "name",
    "trigger_description",
    "allowed_tools",
    "owning_team",
    "monthly_quota",
  ]);
  assert.deepEqual(
    missingRequiredFields({
      name: "A",
      trigger_description: "B",
      allowed_tools: ["web_search"],
      owning_team: "Team",
      monthly_quota: 10,
    }),
    [],
  );
});

test("isQuotaReached fires at >= not only over", () => {
  const agent = { status: "live", monthly_quota: 100, calls_this_month: 100 };
  assert.equal(isQuotaReached(agent), true);
  assert.equal(isQuotaReached({ ...agent, calls_this_month: 99 }), false);
  assert.equal(isQuotaReached({ ...agent, status: "draft" }), false);
});

test("deriveAgent surfaces every attention reason", () => {
  const derived = deriveAgent({
    status: "draft",
    name: "",
    trigger_description: "",
    allowed_tools: [],
    owning_team: "",
    monthly_quota: 0,
    calls_this_month: 0,
    approval_required: true,
  });
  assert.equal(derived.needs_attention, true);
  assert.deepEqual(derived.attention_reasons.sort(), ["approval_without_owner", "draft_incomplete", "missing_owner"]);
});

test("sanitizeTools drops unknown/duplicate tools", () => {
  assert.deepEqual(sanitizeTools(["web_search", "web_search", "not_a_tool"]), ["web_search"]);
  assert.deepEqual(sanitizeTools(null), []);
});

test("createAgent/applyUpdate/activate/pause/archive lifecycle", () => {
  const created = createAgent([], { name: "A", allowed_tools: ["web_search"] });
  assert.equal(created.status, "draft");
  assert.equal(created.id, "agent-001");

  const activationBlocked = activateAgent(created);
  assert.equal(activationBlocked.ok, false);

  const updated = applyUpdate(created, { trigger_description: "does things", owning_team: "Team", monthly_quota: 5 });
  const activated = activateAgent(updated);
  assert.equal(activated.ok, true);
  assert.equal(activated.agent.status, "live");

  const paused = pauseAgent(activated.agent);
  assert.equal(paused.status, "paused");

  const archived = archiveAgent(paused);
  assert.equal(archived.status, "archived");
  assert.equal(activateAgent(archived).ok, false);
});

test("summarize counts by status and only sums live quota/calls", () => {
  const agents = [
    { status: "live", monthly_quota: 100, calls_this_month: 50 },
    { status: "paused", monthly_quota: 100, calls_this_month: 100 },
    { status: "draft", monthly_quota: 0, calls_this_month: 0 },
  ];
  const summary = summarize(agents);
  assert.equal(summary.total, 3);
  assert.equal(summary.live_count, 1);
  assert.equal(summary.paused_count, 1);
  assert.equal(summary.draft_count, 1);
  assert.equal(summary.total_quota, 100);
  assert.equal(summary.total_calls, 50);
  assert.equal(summary.usage_pct, 50);
});
