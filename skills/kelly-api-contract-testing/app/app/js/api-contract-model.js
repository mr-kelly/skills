export function testApiContractCompatibility(specs = []) {
  const breakingChanges = specs.filter((s) => s.hasRemovedField || s.hasTypeChange).length;
  return {
    totalEndpointsTested: specs.length,
    breakingChangesCount: breakingChanges,
    contractStatus: breakingChanges > 0 ? "BREAKING_API_CHANGE_DETECTED" : "BACKWARD_COMPATIBLE",
  };
}
