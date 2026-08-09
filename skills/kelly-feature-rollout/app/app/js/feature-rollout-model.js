export function evaluateCanaryRollout(canary = {}) {
  const errorRatePct = canary.requestsCount > 0 ? (canary.errorsCount / canary.requestsCount) * 100 : 0;
  const isBreached = errorRatePct > (canary.errorThresholdPct || 1.0);
  return {
    flagName: canary.flagName || "new-checkout-flow",
    rolloutPercentage: canary.currentRolloutPct || 10,
    errorRatePct: Math.round(errorRatePct * 100) / 100,
    canaryAction: isBreached ? "AUTOMATED_CANARY_ROLLBACK_TRIGGERED" : "PROCEED_TO_NEXT_STEP",
  };
}
