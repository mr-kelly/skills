export function evaluateInstructionDataset(dataset = []) {
  const verifiedPairs = dataset.filter((d) => d.humanVerified && d.tokenCount <= 2048);
  const toxicExamples = dataset.filter((d) => d.toxicityScore > 0.05).length;
  return {
    totalExamples: dataset.length,
    verifiedInstructionPairs: verifiedPairs.length,
    toxicExamplesCount: toxicExamples,
    datasetQualityScore:
      dataset.length > 0 ? Math.round(((verifiedPairs.length - toxicExamples * 2) / dataset.length) * 100) : 0,
  };
}
