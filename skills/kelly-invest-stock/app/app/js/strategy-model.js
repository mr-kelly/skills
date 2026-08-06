const toNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const fieldsOf = (record) => record.fields || record;
const recordsFor = (records, key) => records.filter((record) => record.baseKey === key);
const STAGES = ["L1", "L2", "L3"];
const stageLabels = {
  L1: "基础观察",
  L2: "进阶观察",
  L3: "高置信观察",
};

const hasText = (value) => String(value || "").trim().length > 0;

const normalizeStrategy = (record) => {
  const fields = fieldsOf(record);
  const requestedStage = fields.stage || fields.status;
  const stage = STAGES.includes(requestedStage) ? requestedStage : "L1";
  const fieldCompleteness = {
    family: hasText(fields.family),
    thesis: hasText(fields.thesis),
    selectionRule: hasText(fields.selection_rule),
    invalidationRule: hasText(fields.invalidation_rule),
    rebalance: hasText(fields.rebalance),
    benchmark: hasText(fields.benchmark),
  };
  return {
    id: record.id || fields.key,
    baseCommitId: record.headCommit?.id || record.headCommitId || null,
    key: String(fields.key || record.id || ""),
    name: String(fields.name || "未命名策略"),
    family: String(fields.family || "独立策略"),
    stage,
    stageLabel: stageLabels[stage],
    thesis: String(fields.thesis || "尚未记录核心假设。"),
    selectionRule: String(fields.selection_rule || "尚未记录选股规则。"),
    invalidationRule: String(fields.invalidation_rule || "尚未记录失效条件。"),
    rebalance: String(fields.rebalance || "按需复核"),
    benchmark: String(fields.benchmark || "沪深300"),
    confidence: toNumber(fields.confidence),
    nextReviewAt: String(fields.next_review_at || ""),
    fieldCompleteness,
    isRuleComplete: Object.values(fieldCompleteness).every(Boolean),
  };
};

const normalizeAccount = (record) => {
  const fields = fieldsOf(record);
  const nominalCapital = toNumber(fields.nominal_capital, null);
  const nav = toNumber(fields.nav, null);
  const cash = toNumber(fields.cash, null);
  const baselineDate = String(fields.baseline_date || "");
  const hasPerformanceBasis = nominalCapital > 0 && nav !== null && hasText(baselineDate);
  const returnRate = hasPerformanceBasis ? nav / nominalCapital - 1 : null;
  const benchmarkReturn = toNumber(fields.benchmark_return, null);
  return {
    id: record.id || fields.strategy_key,
    name: String(fields.name || "虚拟账户"),
    strategyKey: String(fields.strategy_key || ""),
    nominalCapital,
    nav,
    cash,
    pnl: hasPerformanceBasis ? nav - nominalCapital : null,
    returnRate,
    benchmarkReturn,
    excessReturn: returnRate === null || benchmarkReturn === null ? null : returnRate - benchmarkReturn,
    cashRate: nav > 0 && cash !== null ? cash / nav : null,
    maxDrawdown: toNumber(fields.max_drawdown, null),
    updatedAt: String(fields.updated_at || "--"),
    baselineDate,
    hasCoreMetrics: nominalCapital !== null && nominalCapital > 0 && nav !== null && cash !== null,
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
    marketValue: toNumber(fields.market_value, latestPrice === null ? null : quantity * latestPrice),
    weight: toNumber(fields.weight, null),
    pnl: entryPrice === null || latestPrice === null ? null : quantity * (latestPrice - entryPrice),
    priceSource: String(fields.price_source || ""),
    priceAsOf: String(fields.price_as_of || ""),
    hasCompleteQuote: latestPrice !== null && hasText(fields.price_source) && hasText(fields.price_as_of),
  };
};

const normalizeReview = (record) => {
  const fields = fieldsOf(record);
  return {
    id: record.id || `${fields.strategy_key || ""}:${fields.review_date || ""}`,
    strategyKey: String(fields.strategy_key || ""),
    name: String(fields.name || "策略记录"),
    reviewDate: String(fields.review_date || ""),
    reviewType: String(fields.review_type || "research"),
    sourceNote: String(fields.source_note || ""),
    sourceAsOf: String(fields.source_as_of || ""),
    supportingEvidence: String(fields.supporting_evidence || ""),
    counterEvidence: String(fields.counter_evidence || ""),
    dataFreshness: String(fields.data_freshness || ""),
    snapshotNav: toNumber(fields.snapshot_nav, null),
    snapshotBenchmarkReturn: toNumber(fields.snapshot_benchmark_return, null),
    snapshotMaxDrawdown: toNumber(fields.snapshot_max_drawdown, null),
    fromStage: String(fields.from_stage || ""),
    toStage: String(fields.to_stage || ""),
    decision: String(fields.decision || ""),
    reason: String(fields.reason || ""),
    reviewer: String(fields.reviewer || ""),
    changeRequestId: String(fields.change_request_id || ""),
  };
};

const normalizeBacktest = (record) => {
  const fields = fieldsOf(record);
  return {
    id: record.id || `${fields.strategy_key || ""}:${fields.report_date || ""}`,
    strategyKey: String(fields.strategy_key || ""),
    reportDate: String(fields.report_date || ""),
    windowStart: String(fields.window_start || ""),
    windowEnd: String(fields.window_end || ""),
    windowLabel: String(fields.window_label || ""),
    method: String(fields.method || ""),
    coverage: String(fields.coverage || "--"),
    benchmark: String(fields.benchmark || "沪深300"),
    totalReturn: toNumber(fields.total_return, null),
    cagr: toNumber(fields.cagr, null),
    volatility: toNumber(fields.volatility, null),
    sharpe: toNumber(fields.sharpe, null),
    maxDrawdown: toNumber(fields.max_drawdown, null),
    benchmarkReturn: toNumber(fields.benchmark_return, null),
    excessReturn: toNumber(fields.excess_return, null),
    sourceNote: String(fields.source_note || ""),
  };
};

export function createStrategyDesk(records) {
  const accounts = recordsFor(records, "ledger-accounts").map(normalizeAccount);
  const positions = recordsFor(records, "ledger-positions").map(normalizePosition);
  const backtests = recordsFor(records, "strategy-backtests")
    .map(normalizeBacktest)
    .sort((left, right) => right.reportDate.localeCompare(left.reportDate));
  const reviews = recordsFor(records, "strategy-reviews")
    .map(normalizeReview)
    .sort((left, right) => right.reviewDate.localeCompare(left.reviewDate));
  const accountsByStrategy = new Map();
  for (const account of accounts) {
    const strategyAccounts = accountsByStrategy.get(account.strategyKey) || [];
    strategyAccounts.push(account);
    accountsByStrategy.set(account.strategyKey, strategyAccounts);
  }

  const strategies = recordsFor(records, "strategies")
    .map(normalizeStrategy)
    .map((strategy) => {
      const strategyAccounts = accountsByStrategy.get(strategy.key) || [];
      const strategyPositions = positions.filter((position) => position.strategyKey === strategy.key);
      const strategyReviews = reviews.filter((review) => review.strategyKey === strategy.key);
      const account = strategyAccounts[0] || null;
      const positionsComplete = strategyPositions.every(
        (position) => position.hasCompleteQuote && position.marketValue !== null,
      );
      const calculatedNav =
        !account || account.cash === null || !positionsComplete
          ? null
          : account.cash + strategyPositions.reduce((sum, position) => sum + position.marketValue, 0);
      const navDifference =
        calculatedNav === null || !account || account.nav === null ? null : account.nav - calculatedNav;
      const reconciliationTolerance =
        !account || account.nav === null ? 1 : Math.max(1, Math.abs(account.nav) * 0.0001);
      const latestResearch = strategyReviews.find((review) => review.reviewType === "research") || null;
      return {
        ...strategy,
        positions: strategyPositions,
        backtests: backtests.filter((backtest) => backtest.strategyKey === strategy.key),
        reviews: strategyReviews,
        latestResearch,
        account,
        accountCount: strategyAccounts.length,
        positionsComplete,
        calculatedNav,
        navDifference,
        isReconciled: navDifference !== null && Math.abs(navDifference) <= reconciliationTolerance,
        hasComparableBaseline: Boolean(account?.baselineDate && strategy.benchmark),
        isApprovalReady:
          strategy.isRuleComplete &&
          strategyAccounts.length === 1 &&
          Boolean(account?.hasCoreMetrics && account?.baselineDate) &&
          positionsComplete &&
          Math.abs(navDifference ?? Number.POSITIVE_INFINITY) <= reconciliationTolerance &&
          Boolean(latestResearch?.sourceAsOf && latestResearch?.supportingEvidence),
      };
    })
    .sort((left, right) => {
      const leftDue = left.nextReviewAt || "0000-00-00";
      const rightDue = right.nextReviewAt || "0000-00-00";
      return leftDue.localeCompare(rightDue) || left.name.localeCompare(right.name, "zh-CN");
    });

  const strategyKeys = new Set(strategies.map((strategy) => strategy.key));
  const duplicateStrategyKeys = [...strategyKeys].filter(
    (key) => strategies.filter((strategy) => strategy.key === key).length > 1,
  );
  const missingAccountStrategyKeys = strategies
    .filter((strategy) => strategy.accountCount === 0)
    .map((strategy) => strategy.key);
  const duplicateAccountStrategyKeys = strategies
    .filter((strategy) => strategy.accountCount > 1)
    .map((strategy) => strategy.key);
  const orphanAccountIds = accounts
    .filter((account) => !strategyKeys.has(account.strategyKey))
    .map((account) => account.id);
  const orphanPositionIds = positions
    .filter((position) => !strategyKeys.has(position.strategyKey))
    .map((position) => position.id);
  const orphanBacktestIds = backtests
    .filter((backtest) => !strategyKeys.has(backtest.strategyKey))
    .map((backtest) => backtest.id);
  const orphanReviewIds = reviews.filter((review) => !strategyKeys.has(review.strategyKey)).map((review) => review.id);
  const missingBaselineStrategyKeys = strategies
    .filter((strategy) => strategy.account && !strategy.account.baselineDate)
    .map((strategy) => strategy.key);
  const incompleteQuoteStrategyKeys = strategies
    .filter((strategy) => !strategy.positionsComplete)
    .map((strategy) => strategy.key);
  const unreconciledStrategyKeys = strategies
    .filter((strategy) => strategy.account && strategy.positionsComplete && !strategy.isReconciled)
    .map((strategy) => strategy.key);
  const canonicalAccounts = [
    ...new Map(
      strategies.filter((strategy) => strategy.account).map((strategy) => [strategy.account.id, strategy.account]),
    ).values(),
  ];

  const levels = Object.fromEntries(
    STAGES.map((stage) => [stage, strategies.filter((strategy) => strategy.stage === stage)]),
  );
  const accountMetricsComplete =
    strategies.length > 0 &&
    strategies.every(
      (strategy) =>
        strategy.accountCount === 1 &&
        strategy.account?.hasCoreMetrics &&
        strategy.account?.baselineDate &&
        strategy.positionsComplete &&
        strategy.isReconciled,
    );
  const benchmarkMetricsComplete =
    accountMetricsComplete && canonicalAccounts.every((account) => account.benchmarkReturn !== null);
  const nominalCapital = canonicalAccounts.reduce((sum, account) => sum + (account.nominalCapital || 0), 0);
  const nav = canonicalAccounts.reduce((sum, account) => sum + (account.nav || 0), 0);
  const cash = canonicalAccounts.reduce((sum, account) => sum + (account.cash || 0), 0);
  const benchmarkValue = canonicalAccounts.reduce(
    (sum, account) => sum + (account.nominalCapital || 0) * (account.benchmarkReturn || 0),
    0,
  );
  const returnRate = accountMetricsComplete && nominalCapital > 0 ? nav / nominalCapital - 1 : null;
  const benchmarkReturn = benchmarkMetricsComplete && nominalCapital > 0 ? benchmarkValue / nominalCapital : null;
  const integrity = {
    missingAccountStrategyKeys,
    duplicateAccountStrategyKeys,
    duplicateStrategyKeys,
    orphanAccountIds,
    orphanPositionIds,
    orphanBacktestIds,
    orphanReviewIds,
    missingBaselineStrategyKeys,
    incompleteQuoteStrategyKeys,
    unreconciledStrategyKeys,
  };
  integrity.issueCount = Object.values(integrity).reduce((sum, issues) => sum + issues.length, 0);
  integrity.isComplete = integrity.issueCount === 0;

  return {
    strategies,
    accounts,
    positions,
    backtests,
    reviews,
    levels,
    integrity,
    ledger: {
      nominalCapital,
      nav,
      pnl: accountMetricsComplete ? nav - nominalCapital : null,
      returnRate,
      benchmarkReturn,
      excessReturn: returnRate === null || benchmarkReturn === null ? null : returnRate - benchmarkReturn,
      cash,
      invested: accountMetricsComplete ? nav - cash : null,
      cashRate: accountMetricsComplete && nav > 0 ? cash / nav : null,
    },
    attention: {
      l1: levels.L1.length,
      l2: levels.L2.length,
      l3: levels.L3.length,
    },
  };
}

export function createRegressionSnapshot(desk, strategy) {
  const account = strategy?.account || null;
  const totalCapital = desk.ledger.nominalCapital;
  const totalNav = desk.ledger.nav;
  const strategyCapital = account?.nominalCapital || 0;
  const strategyNav = account?.nav || 0;
  const strategyPnl = account?.pnl ?? null;
  const remainderCapital = totalCapital - strategyCapital;
  const remainderNav = totalNav - strategyNav;

  return {
    strategy,
    totalReturn: desk.ledger.returnRate,
    strategyReturn: account?.returnRate ?? null,
    contribution: totalCapital > 0 && strategyPnl !== null ? strategyPnl / totalCapital : null,
    capitalWeight: totalCapital > 0 ? strategyCapital / totalCapital : null,
    returnWithoutStrategy: remainderCapital > 0 ? remainderNav / remainderCapital - 1 : null,
    remainderCapital,
    remainderNav,
  };
}
