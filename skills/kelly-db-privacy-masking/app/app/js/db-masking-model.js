export function auditDbMaskingPolicies(tables = []) {
  const unmaskedPiiColumns = tables.filter((t) => t.hasPii && !t.isMasked).length;
  return {
    totalTablesAudited: tables.length,
    unmaskedPiiViolations: unmaskedPiiColumns,
    maskingCompliancePct:
      tables.length > 0 ? Math.round(((tables.length - unmaskedPiiColumns) / tables.length) * 100) : 100,
  };
}
