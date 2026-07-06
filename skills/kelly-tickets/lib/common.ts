// Provider-neutral helpers for kelly-tickets: generic JSON file I/O, the empty
// snapshot, the deterministic SLA / metrics / merge compute, contact masking,
// config loading, and dotenv loading. These are domain logic (not backend
// logic), so they live outside the data-provider and are shared by both the
// local and Busabase providers as well as the scripts.

import fs from "node:fs/promises";
import path from "node:path";
import { SKILL_DIR } from "./paths.ts";
import type { Config, ConfigResult, ConfigSummary, DecisionsFile, ExecutionReport, Snapshot, Ticket } from "./types.ts";

export async function readJson<T = unknown>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function emptySnapshot(): Snapshot {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: "kelly-tickets",
    property: { name: "", buildings: 0 },
    range: { start: "", end: "" },
    metrics: {
      intake_count: 0,
      unclassified_intake: 0,
      ticket_count: 0,
      open_tickets: 0,
      resolved_tickets: 0,
      avg_resolution_hours: 0,
      sla_at_risk: 0,
      proposal_count: 0,
      needs_review: 0,
      intake_by_channel: {},
    },
    intake: [],
    tickets: [],
    dispatch_proposals: [],
    crews: [],
    sync_log: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message: "No tickets snapshot exists yet. Ingest intake payloads, then run triage.",
      },
    ],
  };
}

const OPEN_TICKET_STATUSES = new Set(["open", "assigned", "in_progress", "waiting"]);

export function computeSlaState(ticket, nowIso) {
  if (ticket.status === "resolved") {
    if (!ticket.sla_due_at) return "met";
    return ticket.resolved_at && ticket.resolved_at > ticket.sla_due_at ? "breached" : "met";
  }
  if (!ticket.sla_due_at) return "ok";
  const now = Date.parse(nowIso || new Date().toISOString());
  const due = Date.parse(ticket.sla_due_at);
  const created = Date.parse(ticket.created_at || nowIso);
  if (Number.isNaN(due)) return "ok";
  if (now >= due) return "breached";
  const total = due - created;
  if (total > 0 && (due - now) / total <= 0.25) return "at_risk";
  return "ok";
}

export function computeMetrics(snapshot) {
  const intake = snapshot.intake || [];
  const tickets = snapshot.tickets || [];
  const proposals = snapshot.dispatch_proposals || [];
  const resolved = tickets.filter((ticket) => ticket.status === "resolved");
  const resolutionHours = resolved
    .filter((ticket) => ticket.created_at && ticket.resolved_at)
    .map((ticket) => (Date.parse(ticket.resolved_at) - Date.parse(ticket.created_at)) / 3600000)
    .filter((hours) => Number.isFinite(hours) && hours >= 0);
  const byChannel = {};
  for (const item of intake) {
    byChannel[item.channel] = (byChannel[item.channel] || 0) + 1;
  }
  return {
    intake_count: intake.length,
    unclassified_intake: intake.filter((item) => item.triage_state === "new").length,
    ticket_count: tickets.length,
    open_tickets: tickets.filter((ticket) => OPEN_TICKET_STATUSES.has(ticket.status)).length,
    resolved_tickets: resolved.length,
    avg_resolution_hours: resolutionHours.length
      ? Math.round((resolutionHours.reduce((sum, hours) => sum + hours, 0) / resolutionHours.length) * 10) / 10
      : 0,
    sla_at_risk: tickets.filter(
      (ticket) => OPEN_TICKET_STATUSES.has(ticket.status) && ["at_risk", "breached"].includes(ticket.sla_state),
    ).length,
    proposal_count: proposals.length,
    needs_review: proposals.filter((proposal) => proposal.status === "needs_review").length,
    intake_by_channel: byChannel,
  };
}

export function maskContact(value) {
  return String(value || "").replace(
    /\d{5,}/g,
    (run) => `${run.slice(0, 3)}${"*".repeat(Math.max(run.length - 5, 2))}${run.slice(-2)}`,
  );
}

export function slaHoursFor(config, category, urgency) {
  const rules = Array.isArray(config?.sla_rules) ? config.sla_rules : [];
  const exact = rules.find((rule) => rule.category === category && rule.urgency === urgency);
  if (exact) return Number(exact.hours) || 0;
  const wildcard = rules.find((rule) => rule.category === "*" && rule.urgency === urgency);
  if (wildcard) return Number(wildcard.hours) || 0;
  return Number(config?.sla_default_hours) || 72;
}

export function mergeSnapshot(
  snapshot: Snapshot,
  decisions: DecisionsFile | null,
  executionReport: ExecutionReport | null,
): Snapshot {
  const verdicts = decisions?.decisions || {};
  const execById = new Map();
  for (const result of executionReport?.results || []) {
    if (result?.id) execById.set(result.id, result);
  }
  const dispatch_proposals = (snapshot.dispatch_proposals || []).map((proposal) => {
    const decision = verdicts[proposal.id] || proposal.decision || null;
    const reportEntry = execById.get(proposal.id);
    const execution =
      proposal.execution ||
      (reportEntry
        ? {
            status: reportEntry.status,
            operations: reportEntry.operations || [],
            detail: reportEntry.detail || "",
            executed_at: executionReport?.generated_at || "",
          }
        : null);
    let status = proposal.status;
    if (decision?.action === "approve") status = "approved";
    if (decision?.action === "request_changes") status = "changes_requested";
    if (decision?.action === "block") status = "blocked";
    if (execution?.status === "executed") status = "done";
    return {
      ...proposal,
      status,
      decision,
      note_to_crew: decision?.draft ?? proposal.note_to_crew,
      execution,
    };
  });
  const intake = (snapshot.intake || []).map((item) => {
    const decision = verdicts[item.id] || item.decision || null;
    let triage_state = item.triage_state;
    if (decision?.action === "ignore") triage_state = "ignored";
    return decision ? { ...item, triage_state, decision } : item;
  });
  const tickets = (snapshot.tickets || []).map((ticket) => {
    const decision = verdicts[ticket.id] || null;
    if (!decision) return ticket;
    return {
      ...ticket,
      decision,
      resolution_note: decision.action === "revise" && decision.note ? decision.note : ticket.resolution_note,
    };
  });
  return { ...snapshot, intake, tickets, dispatch_proposals };
}

export async function loadDotenvFiles(files: string[]): Promise<void> {
  for (const file of files) {
    try {
      const raw = await fs.readFile(file, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const index = trimmed.indexOf("=");
        const key = trimmed.slice(0, index).trim();
        let value = trimmed.slice(index + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (key && process.env[key] === undefined) process.env[key] = value;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export function configSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_TICKETS_CONFIG) paths.push(process.env.KELLY_TICKETS_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-tickets", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_TICKETS_ENV_FILE) paths.push(process.env.KELLY_TICKETS_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-tickets", ".env"));
  return paths;
}

export async function readConfig(): Promise<ConfigResult> {
  for (const file of configSearchPaths()) {
    const config = await readJson<Config | null>(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: { crews: [] }, path: "", is_example: false };
}

export function summarizeConfig(configResult: ConfigResult): ConfigSummary {
  const config = configResult.config || {};
  const crews = Array.isArray(config.crews) ? config.crews : [];
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    property: {
      name: config.property?.name || "",
      buildings: config.property?.buildings || 0,
      timezone: config.property?.timezone || "",
    },
    channels: Array.isArray(config.channels) ? config.channels : [],
    categories: Array.isArray(config.categories) ? config.categories : [],
    crews: crews.map((crew) => ({
      crew_id: crew.crew_id || "",
      name: crew.name || crew.crew_id || "",
      skills: Array.isArray(crew.skills) ? crew.skills : [],
      contact_env: crew.contact_env || "",
      contact_ready: Boolean(crew.contact_env && process.env[crew.contact_env]),
    })),
    sla_rules: (Array.isArray(config.sla_rules) ? config.sla_rules : []).map((rule) => ({
      category: rule.category || "*",
      urgency: rule.urgency || "*",
      hours: Number(rule.hours) || 0,
    })),
    sla_default_hours: Number(config.sla_default_hours) || 72,
  };
}

// Named-export barrel of the ticket type kept alongside the compute so the
// execute script can `import type { Ticket }` from the same module family.
export type { Ticket };
