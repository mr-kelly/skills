#!/usr/bin/env node
// Seeds mock telemetry for the Agent Fleet Observability Desk into
// app/.data/fleet.json (gitignored, local-only). Safe to re-run; deterministic
// for a given day.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateFleetData } from "../lib/generate.ts";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(skillDir, "app", ".data");
const outFile = path.join(outDir, "fleet.json");

async function main(): Promise<void> {
  const fleet = generateFleetData({ now: new Date(), seed: 7, tracesPerAgent: 16 });
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(outFile, `${JSON.stringify(fleet, null, 2)}\n`, "utf8");
  const totalTraces = fleet.traces.length;
  const brokenTraces = fleet.traces.filter((t) => t.status === "error").length;
  console.log(`Wrote ${outFile}`);
  console.log(`Agents: ${fleet.agents.length}, traces: ${totalTraces} (${brokenTraces} broken chains)`);
}

await main();
