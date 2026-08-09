export function auditIncidentActionItems(postmortems = []) {
  const openActionItems = postmortems.reduce((acc, p) => acc + (p.openActionItemCount || 0), 0);
  const overdueActionItems = postmortems.reduce((acc, p) => acc + (p.overdueActionItemCount || 0), 0);
  return {
    totalPostmortemsCompleted: postmortems.length,
    openActionItemsCount: openActionItems,
    overdueActionItemsCount: overdueActionItems,
    engineeringReliabilityStatus: overdueActionItems > 0 ? "ACTION_ITEMS_OVERDUE" : "HEALTHY_POSTMORTEM_TRACKING",
  };
}
