// Deterministic, explicitly-labeled, read-only demo data. Never reads or
// writes Busabase, never claims a real connection, and never persists
// anything — matches the ?demo=1 contract used across Kelly App-in-Skills.
// Ported verbatim from the retired app/server/demo.ts dataset.
import { demoVisualsForApp } from "../demo-visuals-data.js?v=0.1.0";
import { buildSnapshot, computeInsights } from "../fund-model.js?v=0.1.0";

const NOW = "2026-06-30T09:30:00.000Z";
const DEMO_DEVIATION_THRESHOLD = 20;
const MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];

function demoSnapshot() {
  const fund = {
    name: "家庭统筹基金",
    steward: "老大 · 张伟",
    note: "祖父母退休金统筹，支付养老院费用，结余按各家庭分摊。",
  };

  const beneficiaries = [
    { id: "elder-grandpa", name: "祖父 张国强", relation: "祖父", pension_monthly: 16000 },
    { id: "elder-grandma", name: "祖母 李秀英", relation: "祖母", pension_monthly: 14000 },
  ];

  const families = [
    { id: "fam-01", name: "老大 张伟家", head: "张伟", members_count: 4, note: "统筹人家庭" },
    { id: "fam-02", name: "老二 张丽家", head: "张丽", members_count: 3 },
    { id: "fam-03", name: "老三 张军家", head: "张军", members_count: 4 },
    { id: "fam-04", name: "老四 张敏家", head: "张敏", members_count: 2 },
  ];

  const income = [];
  for (const month of MONTHS) {
    income.push({
      id: `inc-${month}-grandpa`,
      month,
      beneficiary_id: "elder-grandpa",
      amount: 16000,
      note: "祖父退休金",
    });
    income.push({
      id: `inc-${month}-grandma`,
      month,
      beneficiary_id: "elder-grandma",
      amount: 14000,
      note: "祖母退休金",
    });
  }

  const expenses = [];
  for (const month of MONTHS) {
    expenses.push({
      id: `exp-${month}-care`,
      month,
      date: `${month}-05`,
      category: "care",
      amount: 20000,
      payee: "康乐养老院",
      occasion: "月度护理费",
      family_id: null,
      shared: false,
      note: "养老院固定护理费",
    });
    expenses.push({
      id: `exp-${month}-transport`,
      month,
      date: `${month}-08`,
      category: "transport",
      amount: 1000,
      payee: "网约车/加油",
      occasion: "探望往返",
      shared: true,
      note: "各家庭探望交通",
    });
  }

  const mealPlan = [
    ["2026-01", 1200],
    ["2026-02", 1300],
    ["2026-03", 1100],
    ["2026-05", 1250],
    ["2026-06", 1400],
  ];
  for (const [month, amount] of mealPlan) {
    expenses.push({
      id: `exp-${month}-meal`,
      month,
      date: `${month}-15`,
      category: "meal",
      amount,
      payee: "家庭聚餐",
      occasion: "团圆饭",
      shared: true,
      note: "全家聚餐，费用共享",
    });
  }

  // Skewed toward fam-01 so its cumulative benefit runs ~20-25% above average.
  const giftPlan = [
    ["2026-01", "fam-01", 900],
    ["2026-02", "fam-02", 750],
    ["2026-03", "fam-01", 800],
    ["2026-04", "fam-03", 800],
    ["2026-05", "fam-02", 600],
    ["2026-06", "fam-04", 850],
  ];
  for (const [month, family_id, amount] of giftPlan) {
    expenses.push({
      id: `exp-${month}-gift`,
      month,
      date: `${month}-20`,
      category: "gift",
      amount,
      payee: "生日礼物",
      occasion: "长辈生日",
      family_id,
      shared: false,
      note: "为长辈备生日礼物",
    });
  }

  const renqingPlan = [
    ["2026-02", "fam-03", 800, false],
    ["2026-04", null, 800, true],
    ["2026-06", "fam-01", 1200, false],
  ];
  for (const [month, family_id, amount, shared] of renqingPlan) {
    expenses.push({
      id: `exp-${month}-renqing`,
      month,
      date: `${month}-22`,
      category: "renqing",
      amount,
      payee: "人情往来",
      occasion: shared ? "共同随礼" : "亲友随礼",
      family_id,
      shared,
      note: shared ? "全家共同随礼" : "代表基金随礼",
    });
  }

  expenses.push({
    id: "exp-2026-03-medical",
    month: "2026-03",
    date: "2026-03-12",
    category: "medical",
    amount: 1500,
    payee: "社区医院",
    occasion: "祖母复诊",
    shared: true,
    note: "复诊挂号与药费",
  });
  expenses.push({
    id: "exp-2026-05-misc",
    month: "2026-05",
    date: "2026-05-18",
    category: "misc",
    amount: 500,
    payee: "日用采买",
    occasion: "养老院日用品",
    shared: true,
    note: "为祖父母添置日用品",
  });

  const snapshot = buildSnapshot({
    snapshot_id: "ff-demo-2026-06-30",
    generated_at: NOW,
    base_currency: "CNY",
    fund,
    beneficiaries,
    families,
    income,
    expenses,
  });
  snapshot.insights = computeInsights(snapshot, DEMO_DEVIATION_THRESHOLD);
  return snapshot;
}

export const demoProvider = {
  kind: "demo",

  async getState() {
    const params = new URLSearchParams(window.location.search);
    const scenario = String(params.get("demo") || "overview");
    const snapshot = demoSnapshot();
    return {
      app: "kelly-family-fund",
      demo: true,
      demo_scenario: scenario,
      data_provider: "demo",
      onboarding: { completed: true, completed_at: NOW, config_version: "demo" },
      lock: null,
      config_summary: {
        config_path: "demo://kelly-family-fund/config.json",
        is_example: false,
        base_currency: snapshot.base_currency,
        fund: snapshot.fund,
        beneficiaries: snapshot.beneficiaries,
        families: snapshot.families.map((f) => ({
          id: f.id,
          name: f.name,
          head: f.head,
          members_count: f.members_count,
        })),
        deviation_threshold_pct: DEMO_DEVIATION_THRESHOLD,
      },
      demo_visuals: demoVisualsForApp("kelly-family-fund"),
      snapshot: { ...snapshot, demo_visuals: demoVisualsForApp("kelly-family-fund") },
    };
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
