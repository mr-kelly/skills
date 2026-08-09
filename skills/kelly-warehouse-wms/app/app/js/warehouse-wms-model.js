export function computeWmsEfficiency(tasks = []) {
  const completedPicking = tasks.filter((t) => t.type === "PICKING" && t.status === "COMPLETED").length;
  const binDiscrepancies = tasks.filter((t) => t.cycleCountMismatch).length;
  const avgPickTimeMins = tasks.reduce((acc, t) => acc + (t.durationMinutes || 0), 0) / (tasks.length || 1);
  return {
    totalTasks: tasks.length,
    completedPicking,
    binDiscrepancies,
    avgPickTimeMins: Math.round(avgPickTimeMins * 10) / 10,
    inventoryAccuracyPct:
      tasks.length > 0 ? Math.round(((tasks.length - binDiscrepancies) / tasks.length) * 1000) / 10 : 100,
  };
}
