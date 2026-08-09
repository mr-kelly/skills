export function auditVendorDpas(vendors = []) {
  const missingDpa = vendors.filter((v) => !v.hasSignedDpa);
  const invalidTransferMechanism = vendors.filter((v) => v.isEuDataTransfer && !v.hasSignedScc);
  return {
    totalVendorsAudited: vendors.length,
    missingDpaCount: missingDpa.length,
    invalidTransferCount: invalidTransferMechanism.length,
    gdprDpaCompliancePct:
      vendors.length > 0
        ? Math.round(((vendors.length - missingDpa.length - invalidTransferMechanism.length) / vendors.length) * 100)
        : 100,
  };
}
