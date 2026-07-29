const toNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const fieldsOf = (record) => record.fields || record;
const recordsFor = (records, key) => records.filter((record) => record.baseKey === key);

const normalizeStrategy = (record) => {
  const fields = fieldsOf(record);
  return {
    id: record.id || fields.key,
    key: String(fields.key || record.id || ""),
    name: String(fields.name || "未命名策略"),
    family: String(fields.family || "独立策略"),
    status: String(fields.status || "观察中"),
    thesis: String(fields.thesis || "尚未记录核心假设。"),
    selectionRule: String(fields.selection_rule || "尚未记录选股规则。"),
    invalidationRule: String(fields.invalidation_rule || "尚未记录失效条件。"),
    rebalance: String(fields.rebalance || "按需复核"),
    benchmark: String(fields.benchmark || "--"),
    confidence: toNumber(fields.confidence),
  };
};

const normalizeCandidate = (record) => {
  const fields = fieldsOf(record);
  const stage = ["L1", "L2", "L3"].includes(fields.stage) ? fields.stage : "L1";
  return {
    id: record.id || `${fields.exchange || ""}:${fields.code || ""}`,
    name: String(fields.name || "未命名证券"),
    code: String(fields.code || ""),
    exchange: String(fields.exchange || ""),
    strategyKey: String(fields.strategy_key || ""),
    stage,
    confidence: toNumber(fields.confidence),
    valueScore: toNumber(fields.value_score),
    qualityScore: toNumber(fields.quality_score),
    catalystScore: toNumber(fields.catalyst_score),
    latestPrice: toNumber(fields.latest_price, null),
    dailyChange: toNumber(fields.daily_change, null),
    thesis: String(fields.thesis || "尚未记录入选理由。"),
    evidence: String(fields.evidence || "尚未记录关键证据。"),
    invalidation: String(fields.invalidation || "尚未记录失效条件。"),
    nextReview: String(fields.next_review || "待安排"),
    freshness: String(fields.freshness_status || "unknown"),
  };
};

const normalizeAccount = (record) => {
  const fields = fieldsOf(record);
  const nominalCapital = toNumber(fields.nominal_capital);
  const nav = toNumber(fields.nav, nominalCapital);
  const returnRate = nominalCapital > 0 ? nav / nominalCapital - 1 : null;
  const benchmarkReturn = toNumber(fields.benchmark_return, null);
  return {
    id: record.id || fields.strategy_key,
    name: String(fields.name || "虚拟账户"),
    strategyKey: String(fields.strategy_key || ""),
    nominalCapital,
    nav,
    cash: toNumber(fields.cash),
    pnl: nav - nominalCapital,
    returnRate,
    benchmarkReturn,
    excessReturn: returnRate === null || benchmarkReturn === null ? null : returnRate - benchmarkReturn,
    cashRate: nav > 0 ? toNumber(fields.cash) / nav : null,
    maxDrawdown: toNumber(fields.max_drawdown, null),
    updatedAt: String(fields.updated_at || "--"),
  };
};

const normalizePosition = (record) => {
  const fields = fieldsOf(record);
  const quantity = toNumber(fields.quantity);
  const entryPrice = toNumber(fields.entry_price, null);
  const latestPrice = toNumber(fields.latest_price, null);
  return {
    id: record.id || `${fields.strategy_key || ""}:${fields.code || ""}`,
    name: String(fields.name || "未命名证券"),
    strategyKey: String(fields.strategy_key || ""),
    code: String(fields.code || ""),
    quantity,
    entryPrice,
    latestPrice,
    marketValue: toNumber(fields.market_value, latestPrice === null ? 0 : quantity * latestPrice),
    weight: toNumber(fields.weight, null),
    pnl: entryPrice === null || latestPrice === null ? null : quantity * (latestPrice - entryPrice),
  };
};

export function createStrategyDesk(records) {
  const candidates = recordsFor(records, "candidates").map(normalizeCandidate);
  const accounts = recordsFor(records, "ledger-accounts").map(normalizeAccount);
  const positions = recordsFor(records, "ledger-positions").map(normalizePosition);
  const accountByStrategy = new Map(accounts.map((account) => [account.strategyKey, account]));

  const strategies = recordsFor(records, "strategies")
    .map(normalizeStrategy)
    .map((strategy) => {
      const strategyCandidates = candidates.filter((candidate) => candidate.strategyKey === strategy.key);
      return {
        ...strategy,
        candidates: strategyCandidates,
        positions: positions.filter((position) => position.strategyKey === strategy.key),
        account: accountByStrategy.get(strategy.key) || null,
        stageCounts: Object.fromEntries(
          ["L1", "L2", "L3"].map((stage) => [
            stage,
            strategyCandidates.filter((candidate) => candidate.stage === stage).length,
          ]),
        ),
      };
    })
    .sort(
      (left, right) =>
        (right.account?.returnRate ?? Number.NEGATIVE_INFINITY) -
        (left.account?.returnRate ?? Number.NEGATIVE_INFINITY),
    );

  const levels = Object.fromEntries(
    ["L1", "L2", "L3"].map((stage) => [
      stage,
      candidates.filter((candidate) => candidate.stage === stage).sort((a, b) => b.confidence - a.confidence),
    ]),
  );
  const nominalCapital = accounts.reduce((sum, account) => sum + account.nominalCapital, 0);
  const nav = accounts.reduce((sum, account) => sum + account.nav, 0);
  const cash = accounts.reduce((sum, account) => sum + account.cash, 0);
  const benchmarkValue = accounts.reduce(
    (sum, account) => sum + account.nominalCapital * (account.benchmarkReturn || 0),
    0,
  );
  const returnRate = nominalCapital > 0 ? nav / nominalCapital - 1 : null;
  const benchmarkReturn = nominalCapital > 0 ? benchmarkValue / nominalCapital : null;

  return {
    strategies,
    candidates,
    accounts,
    positions,
    levels,
    ledger: {
      nominalCapital,
      nav,
      pnl: nav - nominalCapital,
      returnRate,
      benchmarkReturn,
      excessReturn: returnRate === null || benchmarkReturn === null ? null : returnRate - benchmarkReturn,
      cash,
      invested: nav - cash,
      cashRate: nav > 0 ? cash / nav : null,
    },
    attention: {
      l1: levels.L1.filter((candidate) => candidate.freshness !== "fresh").length,
      l2: levels.L2.length,
      l3: levels.L3.length,
    },
  };
}
