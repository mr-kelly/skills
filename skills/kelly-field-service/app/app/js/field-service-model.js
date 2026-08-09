export function dispatchFieldService(workOrders = []) {
  const slaBreached = workOrders.filter((w) => w.arrivalTimeMins > w.slaMins).length;
  const completed = workOrders.filter((w) => w.status === "COMPLETED").length;
  return {
    totalWorkOrders: workOrders.length,
    completedWorkOrders: completed,
    slaBreachedCount: slaBreached,
    firstTimeFixRatePct:
      workOrders.length > 0 ? Math.round(((workOrders.length - slaBreached) / workOrders.length) * 100) : 100,
  };
}
