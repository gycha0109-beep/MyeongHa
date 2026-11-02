// The archive's source-owned supporting interpretation is not evidence.
// Preview keeps its existing combined secondary presentation until its
// independent, non-persisted source model is migrated.
export function readingStepSourceCategoriesV1(step, isStoredRecord) {
  const structure = step.structure;
  const supporting = step.supporting;
  return Object.freeze({
    structure: Object.freeze(isStoredRecord ? [...structure] : [...structure, ...supporting]),
    supporting: Object.freeze(isStoredRecord ? [...supporting] : []),
  });
}
