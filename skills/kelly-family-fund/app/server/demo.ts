import { computeInsights } from "./insights.ts";
import { buildSnapshot } from "./portfolio.ts";
import type { Beneficiary, ExpenseInput, Family, FundSnapshot, IncomeInput } from "./types.ts";

const now = "2026-06-30T09:30:00.000Z";
const DEMO_DEVIATION_THRESHOLD = 20;

export function isDemoQuery(query: Record<string, string> = {}): boolean {
  return Boolean(query.demo);
}

export function demoStatePayload(query: Record<string, string> = {}): Record<string, unknown> {
  const scenario = String(query.demo || "overview");
  const snapshot = demoSnapshot(scenario);
  snapshot.insights = computeInsights(snapshot, DEMO_DEVIATION_THRESHOLD);
  return {
    demo: true,
    demo_scenario: scenario,
    app: "kelly-family-fund",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: now, config_version: "demo" },
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
    snapshot,
  };
}

const MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];

function demoSnapshot(_scenario: string): FundSnapshot {
  const fund = {
    name: "家庭统筹基金",
    steward: "老大 · 张伟",
    note: "祖父母退休金统筹，支付养老院费用，结余按各家庭分摊。",
  };

  const beneficiaries: Beneficiary[] = [
    { id: "elder-grandpa", name: "祖父 张国强", relation: "祖父", pension_monthly: 16000 },
    { id: "elder-grandma", name: "祖母 李秀英", relation: "祖母", pension_monthly: 14000 },
  ];

  const families: Family[] = [
    { id: "fam-01", name: "老大 张伟家", head: "张伟", members_count: 4, note: "统筹人家庭" },
    { id: "fam-02", name: "老二 张丽家", head: "张丽", members_count: 3 },
    { id: "fam-03", name: "老三 张军家", head: "张军", members_count: 4 },
    { id: "fam-04", name: "老四 张敏家", head: "张敏", members_count: 2 },
  ];

  const income: IncomeInput[] = [];
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

  const expenses: ExpenseInput[] = [];
  for (const month of MONTHS) {
    // Fixed care cost (parents' cost — excluded from family benefit).
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
    // Shared transport every month.
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

  // Rotating shared meal gatherings (~1200), most months.
  const mealPlan: Array<[string, number]> = [
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

  // Directed birthday gifts — one family's elder-birthday reimbursement each month.
  // Skewed toward fam-01 so its cumulative benefit runs ~20-25% above average.
  const giftPlan: Array<[string, string, number]> = [
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

  // Renqing (social gifts) — mix of directed and shared.
  const renqingPlan: Array<[string, string | null, number, boolean]> = [
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

  // Occasional medical + misc.
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

  return buildSnapshot({
    snapshot_id: "ff-demo-2026-06-30",
    generated_at: now,
    base_currency: "CNY",
    fund,
    beneficiaries,
    families,
    income,
    expenses,
    source: "kelly-family-fund-demo",
  });
}
