export function auditTradeSettlements(trades = []) {
  const settled = trades.filter((t) => t.settlementStatus === "SETTLED");
  const failed = trades.filter((t) => t.settlementStatus === "FAILED");
  const failValue = failed.reduce((acc, t) => acc + (t.tradeValue || 0), 0);
  return {
    totalTrades: trades.length,
    settledCount: settled.length,
    failedCount: failed.length,
    failedTradeValueUsd: Math.round(failValue),
    settlementRatePct: trades.length > 0 ? Math.round((settled.length / trades.length) * 1000) / 10 : 100,
  };
}
