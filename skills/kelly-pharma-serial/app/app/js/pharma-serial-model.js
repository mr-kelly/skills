export function verifyDscsaSerials(serialBatch = []) {
  const verified = serialBatch.filter((b) => b.gtinValid && b.serialUnique && b.expiryValid);
  const counterfeitAlerts = serialBatch.filter((b) => b.isDuplicateSerial || !b.gtinValid).length;
  const verificationRate = serialBatch.length > 0 ? (verified.length / serialBatch.length) * 100 : 100;
  return {
    totalSerialsScanned: serialBatch.length,
    verifiedUnits: verified.length,
    counterfeitAlerts,
    verificationRate: Math.round(verificationRate * 10) / 10,
    dscsaStatus: counterfeitAlerts === 0 ? "PASSED_VERIFICATION" : "QUARANTINE_HOLD",
  };
}
