export function processAdverseEvents(events = []) {
  const seriousEvents = events.filter((e) => e.severity === "SERIOUS" || e.isLifeThreatening);
  const pendingFDA3500A = events.filter((e) => !e.fdaFiled && e.daysOpen > 15).length;
  return {
    totalEventsLogged: events.length,
    seriousEventsCount: seriousEvents.length,
    pendingFdaFilings: pendingFDA3500A,
    reportingStatus: pendingFDA3500A > 0 ? "OVERDUE_FDA_REPORTING" : "UP_TO_DATE",
  };
}
