export function auditDamAssetLicensing(assets = []) {
  const expiredRights = assets.filter((a) => a.daysToLicenseExpiry <= 0).length;
  const unapprovedLogos = assets.filter((a) => !a.isBrandApproved).length;
  return {
    totalAssetsInDam: assets.length,
    expiredLicenseCount: expiredRights,
    unapprovedBrandAssetsCount: unapprovedLogos,
    damComplianceStatus:
      expiredRights > 0 || unapprovedLogos > 0 ? "EXPIRED_ASSETS_NEED_TAKEDOWN" : "ALL_ASSETS_APPROVED",
  };
}
