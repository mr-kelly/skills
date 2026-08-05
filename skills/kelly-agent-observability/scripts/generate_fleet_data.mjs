#!/usr/bin/env node
// Trusted seed step. Generates a deterministic mock fleet (8 agent
// archetypes, 48h of hourly buckets, and a capped number of traces per agent
// — NOT real telemetry, NOT a real gateway) with generateFleetData() ported
// verbatim from the retired lib/generate.ts, and writes it into the Busabase
// `agents` and `traces` Bases. This replaces "the app generates fresh mock
// data on every request" with "an operator runs this generator once (or
// periodically) to refresh the Busabase-backed snapshot" — the AirApp itself
// only ever reads whatever was last generated here.
//
// tracesPerAgent defaults to 10 (8 agents * 10 = 80 traces), deliberately
// smaller than the retired seed script's 16 (8 * 16 = 128), so the total stays
// safely under the traces Base's 100-record readLimit — the same
// scale-down-a-seeded-generator-while-keeping-determinism precedent used by
// kelly-behavior-predict.
//
// Never touches the `handoffs` Base (the AirApp's own append-only human log)
// and never resets one when re-run.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { appConfig } from "../app/app/js/config.js";
import { baseAgentFields, baseTraceFields, generateFleetData, summarizeFleet } from "../app/app/js/fleet-model.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";

const DEFAULT_TRACES_PER_AGENT = 10;
const DEFAULT_SEED = 7;

function help() {
  console.log(`Usage: node scripts/generate_fleet_data.mjs [--apply] [options]

Without --apply this is a dry run that only prints what would be written.
With --apply it (re)writes the mock fleet snapshot to the Busabase "agents"
and "traces" Bases, and refreshes the "settings" "fleet_meta" row. Never
touches the "handoffs" Base.

Options:
  --seed <number>              Generator seed (default: ${DEFAULT_SEED})
  --traces-per-agent <number>  Traces per agent (default: ${DEFAULT_TRACES_PER_AGENT}; keep agents*traces <= 100)
  --now <iso>                  Override "now" for the hourly window (default: current time)`);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

async function readAll(client, declared) {
  const rows = [];
  let cursor;
  for (let page = 0; page < 20; page += 1) {
    const result = await client.records.list({
      baseId: declared.baseId,
      limit: declared.readLimit,
      ...(cursor ? { cursor } : {}),
    });
    const records = Array.isArray(result) ? result : result.records || [];
    for (const record of records) {
      rows.push({
        ...normalizeFields(record.headCommit?.fields || record.fields),
        __recordId: record.id,
        __headCommitId: record.headCommitId || record.headCommit?.id,
      });
    }
    cursor = Array.isArray(result) ? null : result.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

async function upsert(client, declared, idFieldSlug, idValue, existingRows, fields, message) {
  const existing = existingRows.find((row) => row[idFieldSlug.replaceAll("-", "_")] === idValue);
  const normalized = toBusabaseFields(fields);
  if (!existing) {
    return client.bases.createChangeRequest({
      baseId: declared.baseId,
      fields: normalized,
      message,
      submittedBy: "kelly-agent-observability-generator",
      autoMerge: true,
    });
  }
  return client.records.changeRequest({
    recordId: existing.__recordId,
    operation: "update",
    fields: normalized,
    message,
    author: "kelly-agent-observability-generator",
    baseCommitId: existing.__headCommitId,
    autoMerge: true,
  });
}

function parseArgs(argv) {
  const args = { apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--seed") args.seed = Number(argv[++i]);
    else if (arg === "--traces-per-agent") args.tracesPerAgent = Number(argv[++i]);
    else if (arg === "--now") args.now = argv[++i];
  }
  return args;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) return help();
  const args = parseArgs(argv);

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error(
      "Kelly Agent Observability Busabase resources are not provisioned yet; run the AirApp setup first.",
    );
  }
  const agentsBase = resources.bases.find((base) => base.key === "agents");
  const tracesBase = resources.bases.find((base) => base.key === "traces");
  const settingsBase = resources.bases.find((base) => base.key === "settings");

  const seed = Number.isFinite(args.seed) ? args.seed : DEFAULT_SEED;
  const tracesPerAgent = Number.isFinite(args.tracesPerAgent) ? args.tracesPerAgent : DEFAULT_TRACES_PER_AGENT;
  const now = args.now ? new Date(args.now) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`Invalid --now value: ${args.now}`);

  const fleet = generateFleetData({ now, seed, tracesPerAgent });
  const summary = summarizeFleet(fleet);

  console.log(
    JSON.stringify(
      {
        dry_run: !args.apply,
        seed,
        traces_per_agent: tracesPerAgent,
        generated_at: fleet.generated_at,
        agents: fleet.agents.length,
        traces: fleet.traces.length,
        summary,
      },
      null,
      2,
    ),
  );

  if (fleet.traces.length > 100) {
    throw new Error(
      `agents(${fleet.agents.length}) * tracesPerAgent(${tracesPerAgent}) = ${fleet.traces.length} exceeds the traces Base readLimit (100); lower --traces-per-agent.`,
    );
  }

  if (!args.apply) {
    console.log("Dry run only. Re-run with --apply to write the fleet snapshot to Busabase.");
    return;
  }

  const [existingAgents, existingTraces, existingSettings] = await Promise.all([
    readAll(client, agentsBase),
    readAll(client, tracesBase),
    readAll(client, settingsBase),
  ]);

  const agentMetricsById = new Map(fleet.metrics.map((m) => [m.agent_id, m]));
  await Promise.all(
    fleet.agents.map((agent) => {
      const metrics = agentMetricsById.get(agent.agent_id) || {};
      return upsert(
        client,
        agentsBase,
        "agent-id",
        agent.agent_id,
        existingAgents,
        baseAgentFields({ ...agent, ...metrics }),
        `Generate mock fleet (seed=${seed}): agent ${agent.agent_id}`,
      );
    }),
  );

  await Promise.all(
    fleet.traces.map((trace) =>
      upsert(
        client,
        tracesBase,
        "trace-id",
        trace.trace_id,
        existingTraces,
        baseTraceFields(trace),
        `Generate mock fleet (seed=${seed}): trace ${trace.trace_id}`,
      ),
    ),
  );

  const meta = {
    schema_version: fleet.schema_version,
    generated_at: fleet.generated_at,
    seed,
    traces_per_agent: tracesPerAgent,
  };
  await upsert(
    client,
    settingsBase,
    "record-id",
    "fleet_meta",
    existingSettings,
    { record_id: "fleet_meta", kind: "fleet_meta", payload: JSON.stringify(meta), updated_at: fleet.generated_at },
    `Generate mock fleet (seed=${seed}): fleet_meta`,
  );

  console.log(
    `Wrote ${fleet.agents.length} agents and ${fleet.traces.length} traces to Busabase (seed=${seed}, tracesPerAgent=${tracesPerAgent}).`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
