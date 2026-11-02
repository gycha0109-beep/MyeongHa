export interface ReadingStepSourcePartsV1 {
  readonly structure: readonly string[];
  readonly supporting: readonly string[];
}
export declare function readingStepSourceCategoriesV1(
  step: Readonly<{ structure: readonly string[]; supporting: readonly string[] }>,
  isStoredRecord: boolean,
): Readonly<ReadingStepSourcePartsV1>;