import { CANDIDATE_SEEDS } from "../../lib/demo-candidates.ts";
import { DEFAULT_RUBRIC, computeScore } from "../../lib/scoring.ts";
import type { Batch, Candidate } from "./types.ts";

interface DemoQuery {
  demo?: string | boolean;
  lang?: string;
}

const now = "2026-07-01T15:00:00.000Z";

export function isDemoQuery(query: DemoQuery = {}): boolean {
  return Boolean(query.demo);
}

function localizedName(id: string, zh: boolean): string {
  if (!zh) return "";
  const names: Record<string, string> = {
    "cand-001": "枫糖百里香厨房",
    "cand-002": "北区健身联盟",
    "cand-003": "海岸儿童学习中心",
    "cand-004": "余烬橡木烧烤",
    "cand-005": "线迹精品店",
    "cand-006": "像素印刷工坊",
    "cand-007": "河湾 CrossFit",
    "cand-008": "光途辅导中心",
  };
  return names[id] || "";
}

function localizedCity(id: string, zh: boolean): string {
  if (!zh) return "";
  const cities: Record<string, string> = {
    "cand-001": "德克萨斯州 奥斯汀",
    "cand-002": "科罗拉多州 丹佛",
    "cand-003": "加利福尼亚州 圣地亚哥",
    "cand-004": "田纳西州 纳什维尔",
    "cand-005": "南卡罗来纳州 查尔斯顿",
    "cand-006": "俄勒冈州 波特兰",
    "cand-007": "爱达荷州 博伊西",
    "cand-008": "北卡罗来纳州 罗利",
  };
  return cities[id] || "";
}

function demoBatch(zh = false): Batch {
  const items: Candidate[] = CANDIDATE_SEEDS.map((seed, index) => {
    const score = computeScore(seed, DEFAULT_RUBRIC);
    const status: Candidate["status"] = index === 0 ? "approved" : index === 3 ? "blocked" : "needs_review";
    const candidate: Candidate = {
      id: seed.id,
      business_name: zh ? localizedName(seed.id, true) || seed.business_name : seed.business_name,
      category: seed.category,
      city: zh ? localizedCity(seed.id, true) || seed.city : seed.city,
      requested_principal: seed.requested_principal,
      monthly_revenue: seed.monthly_revenue,
      red_flags: seed.red_flags,
      status,
      score,
    };
    if (status === "approved") {
      candidate.decision = {
        action: "approve_term_sheet",
        comment: "Strong stable revenue, low ratio.",
        decided_at: now,
      };
    }
    if (status === "blocked") {
      candidate.decision = {
        action: "reject",
        comment: "Six-month revenue downtrend, high principal ask.",
        decided_at: now,
      };
    }
    return candidate;
  });

  const scores = items.map((item) => item.score.composite_score);
  const high = scores.filter((s) => s >= DEFAULT_RUBRIC.decision_thresholds.high_confidence_min).length;
  const low = scores.filter((s) => s < DEFAULT_RUBRIC.decision_thresholds.needs_review_min).length;
  const review = items.length - high - low;
  const metrics = {
    needs_review: items.filter((i) => i.status === "needs_review" || i.status === "changes_requested").length,
    approved: items.filter((i) => i.status === "approved").length,
    done: items.filter((i) => i.status === "done").length,
    blocked: items.filter((i) => i.status === "blocked").length,
  };

  return {
    batch_id: "demo-2026-07-01",
    generated_at: now,
    source: "kelly-deal-scorer-demo",
    mode: "app-in-skill",
    metrics,
    distribution: {
      high_confidence: high,
      needs_review: review,
      low_confidence: low,
      average_score: Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 10) / 10,
    },
    items,
  };
}

export function demoStatePayload(query: DemoQuery = {}): Record<string, unknown> {
  const zh = String(query.lang || "")
    .toLowerCase()
    .startsWith("zh");
  const batch = demoBatch(zh);
  return {
    demo: true,
    demo_scenario: String(query.demo || "overview"),
    app: "kelly-deal-scorer",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: now, config_version: "demo" },
    lock: null,
    config_summary: {
      config_path: "demo://kelly-deal-scorer/config.json",
      is_example: false,
      base_currency: "USD",
      rubric: {
        weights: DEFAULT_RUBRIC.weights,
        decision_thresholds: DEFAULT_RUBRIC.decision_thresholds,
      },
    },
    batch,
  };
}
