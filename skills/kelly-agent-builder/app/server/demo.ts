import { summarize, toView } from "./store.ts";
import type { AgentConfig } from "./types.ts";

interface DemoQuery {
  demo?: string | boolean;
  lang?: string;
}

export function isDemoQuery(query: DemoQuery = {}): boolean {
  return Boolean(query.demo);
}

const now = "2026-07-01T09:00:00.000Z";

export function demoStatePayload(query: DemoQuery = {}): Record<string, unknown> {
  const zh = String(query.lang || "")
    .toLowerCase()
    .startsWith("zh");
  const agents = zh ? localizeZh(demoAgents()) : demoAgents();
  return {
    demo: true,
    app: "kelly-agent-builder",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: now, config_version: "demo" },
    config_summary: {
      config_path: "demo://kelly-agent-builder/config.json",
      is_example: false,
    },
    lock: null,
    summary: summarize(agents),
    agents: agents.map(toView),
  };
}

function localizeZh(agents: AgentConfig[]): AgentConfig[] {
  const teamNames: Record<string, string> = {
    "Support Ops": "客服运营",
    "Sales Engineering": "解决方案工程",
    Marketing: "市场部",
    "Data Platform": "数据平台",
    Finance: "财务部",
  };
  return agents.map((agent) => ({
    ...agent,
    owning_team: teamNames[agent.owning_team] || agent.owning_team,
  }));
}

export function demoAgents(): AgentConfig[] {
  return [
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
}

function agent(partial: Omit<AgentConfig, "created_at" | "updated_at">): AgentConfig {
  return { ...partial, created_at: now, updated_at: now };
}
