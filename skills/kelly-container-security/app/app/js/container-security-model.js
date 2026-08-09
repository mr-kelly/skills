export function scanContainerRegistry(images = []) {
  const criticalCves = images.reduce((acc, img) => acc + (img.criticalCount || 0), 0);
  const highCves = images.reduce((acc, img) => acc + (img.highCount || 0), 0);
  const nonCompliant = images.filter((img) => img.criticalCount > 0 || img.runAsRoot);
  return {
    totalImagesScanned: images.length,
    criticalCveTotal: criticalCves,
    highCveTotal: highCves,
    blockedImagesCount: nonCompliant.length,
    registryPosture: criticalCves === 0 ? "PASSED_SECURITY_GATE" : "DEPLOYMENT_BLOCK_ACTIVE",
  };
}
