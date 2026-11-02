export declare function blockTexts(block: unknown): string[];
export declare function issuedSectionSourcePartsV1(
  blocks: unknown,
  options?: Readonly<{ isStoredRecord?: boolean; structurePrefix?: string }>,
): Readonly<{
  structure: readonly string[];
  interpretation: readonly string[];
}>;