export function monitorApiGatewaySecurity(requests = []) {
  const schemaViolations = requests.filter((r) => r.isSchemaViolation).length;
  const rateLimitBreaches = requests.filter((r) => r.isRateLimited).length;
  return {
    totalRequestsMonitored: requests.length,
    schemaViolations,
    rateLimitBreaches,
    apiHealthStatus: schemaViolations > 5 ? "SCHEMA_ATTACK_DETECTED" : "HEALTHY",
  };
}
