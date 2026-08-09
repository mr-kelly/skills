export function evaluateDbMigrationSafety(migration = {}) {
  const hasLockingDdl = migration.statements?.some(
    (s) => s.toLowerCase().includes("drop column") || s.toLowerCase().includes("alter table"),
  );
  const isDualWriteActive = migration.isDualWriteActive || false;
  const safe = !hasLockingDdl || isDualWriteActive;
  return {
    migrationName: migration.name || "V2_Schema_Update",
    lockingDdlDetected: hasLockingDdl,
    dualWriteConfigured: isDualWriteActive,
    migrationSafetyStatus: safe ? "ZERO_DOWNTIME_APPROVED" : "BLOCK_LOCKING_DDL_DETECTED",
  };
}
