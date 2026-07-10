import { computeFunnelSummary } from "../../lib/funnel-summary.ts";
import { generateMockLeads } from "../../lib/mock-leads.ts";
import { DEFAULT_SCORING_CRITERIA } from "../../lib/scoring.ts";
import type { Lead } from "../../lib/types.ts";

interface DemoQuery {
  demo?: string | boolean;
  lang?: string;
}

const now = new Date("2026-07-01T15:00:00.000Z");

export function isDemoQuery(query: DemoQuery = {}): boolean {
  return Boolean(query.demo);
}

export function demoStatePayload(query: DemoQuery = {}): Record<string, unknown> {
  const scenario = String(query.demo || "board");
  const zh = String(query.lang || "")
    .toLowerCase()
    .startsWith("zh");
  const leads = zh ? localizeZh(generateMockLeads(now)) : generateMockLeads(now);
  return {
    demo: true,
    demo_scenario: scenario,
    app: "kelly-lead-funnel",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: now.toISOString(), config_version: "demo" },
    lock: null,
    config_summary: {
      config_path: "demo://kelly-lead-funnel/config.json",
      is_example: false,
      base_currency: "USD",
      fund_profile: {
        display_name: "Example Lending Fund",
        product: "SME merchant cash advance / revenue-based financing",
        target_check_size: "USD 50,000 - 2,000,000 monthly revenue equivalent",
      },
      scoring_criteria: DEFAULT_SCORING_CRITERIA,
    },
    leads,
    summary: computeFunnelSummary(leads),
  };
}

const CITY_NAMES: Record<string, string> = {
  Austin: "奥斯汀",
  Denver: "丹佛",
  Phoenix: "凤凰城",
  Charlotte: "夏洛特",
  Portland: "波特兰",
  Seattle: "西雅图",
  "Las Vegas": "拉斯维加斯",
  "San Diego": "圣地亚哥",
  Miami: "迈阿密",
  Chicago: "芝加哥",
  Dallas: "达拉斯",
  "Los Angeles": "洛杉矶",
  "Salt Lake City": "盐湖城",
  Nashville: "纳什维尔",
  Atlanta: "亚特兰大",
  Boston: "波士顿",
  Houston: "休斯顿",
  "San Jose": "圣何塞",
  Memphis: "孟菲斯",
  "New Orleans": "新奥尔良",
  "Kansas City": "堪萨斯城",
};

function localizeZh(leads: Lead[]): Lead[] {
  return leads.map((lead) => ({
    ...lead,
    city: CITY_NAMES[lead.city] || lead.city,
  }));
}
