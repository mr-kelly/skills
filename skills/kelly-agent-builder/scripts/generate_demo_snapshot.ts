#!/usr/bin/env node
// Seeds app/.data/agents.json with a mock catalog of agent configs: some
// draft, some live, one deliberately over-quota, and one missing an owner.
// This never provisions or calls a real agent — it only writes local files.

import { nowIso } from "../lib/common.ts";
import { getProvider } from "../lib/data-provider/index.ts";
import type { AgentConfig, AgentsFile } from "../lib/data-provider/provider-interface.ts";

function agent(partial: Omit<AgentConfig, "created_at" | "updated_at">, at = nowIso()): AgentConfig {
  return { ...partial, created_at: at, updated_at: at };
}

const agents: AgentConfig[] = [
  agent({
    id: "agent-001",
    name: "Inbound Ticket Triage",
    trigger_description: "Classifies inbound support tickets and routes them to the right queue.",
    allowed_tools: ["file_read", "crm_lookup", "slack_post"],
    approval_required: false,
    monthly_quota: 5000,
    calls_this_month: 3120,
    owning_team: "Support Ops",
    status: "live",
  }),
  agent({
    id: "agent-002",
    name: "Sales Follow-up Drafter",
    trigger_description: "Drafts personalized follow-up emails after a demo call.",
    allowed_tools: ["crm_lookup", "send_email"],
    approval_required: true,
    monthly_quota: 1000,
    calls_this_month: 1180,
    owning_team: "Sales Engineering",
    status: "live",
  }),
  agent({
    id: "agent-003",
    name: "Weekly Metrics Digest",
    trigger_description: "Queries the analytics warehouse and posts a weekly digest to the team channel.",
    allowed_tools: ["db_query", "slack_post"],
    approval_required: false,
    monthly_quota: 200,
    calls_this_month: 44,
    owning_team: "Data Platform",
    status: "live",
  }),
  agent({
    id: "agent-004",
    name: "Invoice Reminder Bot",
    trigger_description: "Looks up overdue invoices and drafts payment reminder emails.",
    allowed_tools: ["db_query", "send_email"],
    approval_required: true,
    monthly_quota: 500,
    calls_this_month: 12,
    owning_team: "",
    status: "live",
  }),
  agent({
    id: "agent-005",
    name: "Competitor Watch",
    trigger_description: "Searches the web for competitor announcements and summarizes them.",
    allowed_tools: ["web_search", "http_request"],
    approval_required: false,
    monthly_quota: 300,
    calls_this_month: 0,
    owning_team: "Marketing",
    status: "draft",
  }),
  agent({
    id: "agent-006",
    name: "Meeting Notes Scheduler",
    trigger_description: "",
    allowed_tools: [],
    approval_required: false,
    monthly_quota: 0,
    calls_this_month: 0,
    owning_team: "",
    status: "draft",
  }),
  agent({
    id: "agent-007",
    name: "Code Review Assistant",
    trigger_description: "Runs lint/tests on pull requests and posts a summary comment.",
    allowed_tools: ["code_exec", "file_read", "slack_post"],
    approval_required: false,
    monthly_quota: 2000,
    calls_this_month: 640,
    owning_team: "Data Platform",
    status: "paused",
  }),
  agent({
    id: "agent-008",
    name: "Legacy Refund Handler",
    trigger_description: "Old refund workflow, replaced by the finance team's new process.",
    allowed_tools: ["db_query", "send_email", "crm_lookup"],
    approval_required: true,
    monthly_quota: 150,
    calls_this_month: 150,
    owning_team: "Finance",
    status: "archived",
  }),
];

const file: AgentsFile = { schema_version: "1", generated_at: nowIso(), agents };

const provider = getProvider();
await provider.writeAgentsFile(file);
// This skill has no external accounts/secrets to configure, so seeding a mock
// catalog is itself "setup complete" — write the onboarding marker.
await provider.writeOnboarding({ completed: true, completed_at: nowIso(), config_version: "1" });

console.log(`Seeded ${agents.length} mock agent configs.`);
console.log(
  `  live=${agents.filter((a) => a.status === "live").length} draft=${agents.filter((a) => a.status === "draft").length} paused=${agents.filter((a) => a.status === "paused").length} archived=${agents.filter((a) => a.status === "archived").length}`,
);
