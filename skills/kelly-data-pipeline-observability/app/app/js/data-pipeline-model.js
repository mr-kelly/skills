export function auditDataPipelineQuality(dagRuns = []) {
  const staleTables = dagRuns.filter((d) => d.hoursStale > 24).length;
  const nullViolations = dagRuns.filter((d) => d.nullRatePct > 5.0).length;
  return {
    totalPipelinesMonitored: dagRuns.length,
    staleTablesCount: staleTables,
    nullRatioViolationsCount: nullViolations,
    pipelineHealthScore:
      dagRuns.length > 0 ? Math.round(((dagRuns.length - staleTables - nullViolations) / dagRuns.length) * 100) : 100,
  };
}
