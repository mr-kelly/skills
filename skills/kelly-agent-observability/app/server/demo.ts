import { generateFleetData, summarizeFleet } from "../../lib/generate.ts";
import type { FleetData } from "../../lib/types.ts";

interface DemoQuery {
  demo?: string | boolean;
  lang?: string;
}

const DEMO_NOW = new Date("2026-07-10T20:00:00.000Z");

export function isDemoQuery(query: DemoQuery = {}): boolean {
  return Boolean(query.demo);
}

let cachedDemoFleet: FleetData | null = null;

function demoFleet(): FleetData {
  if (!cachedDemoFleet) {
    cachedDemoFleet = generateFleetData({ now: DEMO_NOW, seed: 7, tracesPerAgent: 16 });
  }
  return cachedDemoFleet;
}

export function demoStatePayload(query: DemoQuery = {}): Record<string, unknown> {
  const scenario = String(query.demo || "overview");
  const fleet = demoFleet();
  return {
    demo: true,
    demo_scenario: scenario,
    app: "kelly-agent-observability",
    data_provider: "demo",
    fleet,
    summary: summarizeFleet(fleet),
  };
}

export function demoHandoffs(): [] {
  return [];
}
