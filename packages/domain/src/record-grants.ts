export interface RecordAccessGrantDraft {
  readonly granteeCharacterId: string;
}

export function snapshotCurrentCharacterGrants(
  eligibleCharacterIds: readonly string[],
): readonly RecordAccessGrantDraft[] {
  const normalized = [...new Set(eligibleCharacterIds.map((id) => id.trim()))]
    .filter((id) => id.length > 0)
    .sort();
  return Object.freeze(
    normalized.map((granteeCharacterId) =>
      Object.freeze({ granteeCharacterId }),
    ),
  );
}
