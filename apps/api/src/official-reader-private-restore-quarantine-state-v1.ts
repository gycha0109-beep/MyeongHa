/**
 * Privacy/DB Owner-facing, non-identifying S4 OFFLINE restore state.
 * PostgreSQL 2230 returns only a categorical constraint on rejected replay.
 * No restored subject, message, original ciphertext, key, purchase receipt,
 * row count or provider metadata may escape into the operator report.
 *
 * Tombstone replay is NOT the full P30D restore / owner release gate.
 * General Memory, Search/Summary and all public paid Reader services stay OFF
 * when a replay has not completed or independent owner acceptance is absent.
 */
export const OFFICIAL_READER_RESTORE_QUARANTINE_STATE_VERSION_V1 =
  'official-reader-restore-quarantine-state-v1' as const;

export type OfficialReaderRestoreDerivedCategoryV1 =
  | 'ordinary_memory'
  | 'ordinary_memory_proposal'
  | 'ordinary_life_fact'
  | 'ordinary_chat_outbox';

export type OfficialReaderRestoreOperatorReportV1 = Readonly<{
  schemaVersion: typeof OFFICIAL_READER_RESTORE_QUARANTINE_STATE_VERSION_V1;
  restoreState: 'quarantined_derived_data' | 'blocked_unclassified';
  derivedCategory: OfficialReaderRestoreDerivedCategoryV1 | null;
  existingPrivacyOwnerCleanupRequired: true;
  /**
   * No implicit physical deletion. Memory revoke merely prevents future
   * access; it does NOT remove the historical row inspected by S4/2230.
   */
  automaticCleanupPerformed: false;
  existingPrivacyOwnerDispositionRoute: 'existing_privacy_db_owner_disposition' | null;
  resumeRequirement:
    | 'owner_reconcile_then_rerun_same_isolated_restore'
    | 'investigate_unknown_blocker_in_quarantine';
  restoreRetryAuthorizedByThisReport: false;
  restoreCompletionApproved: false;
  paidReaderServiceEnabled: false;
  ordinaryRestoreConsumersEnabled: false;
}>;

const CATEGORY_BY_DB_CONSTRAINT: Readonly<Record<string, OfficialReaderRestoreDerivedCategoryV1>> =
  Object.freeze({
    reader_restored_memory_items_quarantined: 'ordinary_memory',
    reader_restored_memory_proposals_quarantined: 'ordinary_memory_proposal',
    reader_restored_life_facts_quarantined: 'ordinary_life_fact',
    reader_restored_chat_outbox_quarantined: 'ordinary_chat_outbox',
  });

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Strict PG error code + known constraint; arbitrary messages are ignored. */
export function safeOfficialReaderRestoreQuarantineCategoryV1(
  failure: unknown,
): OfficialReaderRestoreDerivedCategoryV1 | null {
  if (!record(failure) || failure.code !== 'P0001'
      || typeof failure.constraint !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(
    CATEGORY_BY_DB_CONSTRAINT,
    failure.constraint,
  ) ? CATEGORY_BY_DB_CONSTRAINT[failure.constraint]! : null;
}

export class OfficialReaderRestoreQuarantinedV1 extends Error {
  readonly code = 'OFFICIAL_READER_RESTORE_DERIVED_QUARANTINE' as const;
  readonly restoreState = 'quarantined_derived_data' as const;
  readonly paidReaderServiceEnabled = false as const;

  constructor(readonly derivedCategory: OfficialReaderRestoreDerivedCategoryV1) {
    super('Restored paid Reader-derived ordinary data remains in privacy quarantine.');
    this.name = 'OfficialReaderRestoreQuarantinedV1';
  }
}

/**
 * Operator projections never print thrown SQL text or the private ledger.
 * Non-classified errors also block release, without misreporting them as
 * Privacy-approved or attributing them to a fictitious derived category.
 */
export function officialReaderRestoreFailureReportV1(
  failure: unknown,
): OfficialReaderRestoreOperatorReportV1 {
  const category = failure instanceof OfficialReaderRestoreQuarantinedV1
    ? failure.derivedCategory
    : safeOfficialReaderRestoreQuarantineCategoryV1(failure);

  return Object.freeze({
    schemaVersion: OFFICIAL_READER_RESTORE_QUARANTINE_STATE_VERSION_V1,
    restoreState: category ? 'quarantined_derived_data' : 'blocked_unclassified',
    derivedCategory: category,
    existingPrivacyOwnerCleanupRequired: true,
    automaticCleanupPerformed: false,
    existingPrivacyOwnerDispositionRoute: category ? 'existing_privacy_db_owner_disposition' : null,
    resumeRequirement: category
      ? 'owner_reconcile_then_rerun_same_isolated_restore'
      : 'investigate_unknown_blocker_in_quarantine',
    restoreRetryAuthorizedByThisReport: false,
    restoreCompletionApproved: false,
    paidReaderServiceEnabled: false,
    ordinaryRestoreConsumersEnabled: false,
  });
}
