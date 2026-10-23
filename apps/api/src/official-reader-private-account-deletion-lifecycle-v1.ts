/**
 * S4 private, owner-injected account-deletion lifecycle.
 *
 * The off-primary ledger owns deletion tombstones and the restore fence;
 * the per-answer key authority owns irreversible key destruction. Neither
 * is implemented by the backed-up service PostgreSQL database.
 *
 * The ledger MUST durably persist the complete manifest BEFORE DB deletion,
 * and retain it across a Worker crash or backup restore. This module does not
 * issue a user-facing operation, create a new vendor, or activate paid reads.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_KEYS_PER_ACCOUNT = 50_000;

export interface OfficialReaderAccountDeletionIdentityV1 {
  readonly subjectId: string;
  readonly deletionJobId: string;
  readonly lockOwner: string;
}

export interface OfficialReaderProtectedDeletionEntryV1 {
  readonly bodyId: string;
  readonly encryptionKeyRef: string;
}

export interface OfficialReaderProtectedDeletionManifestV1 {
  readonly entries: readonly OfficialReaderProtectedDeletionEntryV1[];
}

export interface OfficialReaderDurableDeletionFenceV1 {
  readonly version: 'official-reader-account-deletion-fence-v1';
  readonly subjectId: string;
  readonly deletionJobId: string;
  /** Opaque durable checkpoint owned by the external, backup-independent ledger. */
  readonly fenceId: string;
  /** Must match the EXACT manifest recorded before DB finalization. */
  readonly bodyIds: readonly string[];
  readonly keyRefs: readonly string[];
}

export interface OfficialReaderAccountDeletionLedgerPortV1 {
  /** Idempotently record the irreversible account tombstone and full key manifest. */
  recordAccountDeletionFence(input: Readonly<{
    subjectId: string;
    deletionJobId: string;
    bodyIds: readonly string[];
    keyRefs: readonly string[];
  }>): Promise<OfficialReaderDurableDeletionFenceV1>;
  /** Re-read after restart; no local in-memory or backed-up DB fallback. */
  readAccountDeletionFence(input: Readonly<{
    subjectId: string;
    deletionJobId: string;
  }>): Promise<OfficialReaderDurableDeletionFenceV1 | null>;
  /** Durable acknowledgment AFTER every original key is irreversibly erased. */
  acknowledgeAccountKeyErasure(input: Readonly<{
    subjectId: string;
    deletionJobId: string;
    fenceId: string;
  }>): Promise<boolean>;
}

export interface OfficialReaderProtectedKeyErasurePortV1 {
  /** Must be idempotent for retries and invalidate all key read caches. */
  destroyKey(keyRef: string): Promise<void>;
  /** Must check the authoritative key owner, not a local cache. */
  isKeyDestroyed(keyRef: string): Promise<boolean>;
}

export interface OfficialReaderAccountPrivacyDeletionPortV1 {
  fenceBeforeDatabaseDeletion(input: Readonly<{
    subjectId: string;
    deletionJobId: string;
    manifest: OfficialReaderProtectedDeletionManifestV1;
  }>): Promise<OfficialReaderDurableDeletionFenceV1>;
  finishAfterDatabaseDeletion(input: Readonly<{
    subjectId: string;
    deletionJobId: string;
  }>): Promise<OfficialReaderDurableDeletionFenceV1 | null>;
}

function failed(): never {
  throw new Error('Protected Reader account deletion privacy authority is unavailable.');
}

function normalizedUuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) return failed();
  return value.toLowerCase();
}

function boundedRef(value: unknown): string {
  if (typeof value !== 'string'
      || value.length === 0 || value.trim() !== value || value.length > 256) {
    return failed();
  }
  return value;
}

function normalizeManifest(value: OfficialReaderProtectedDeletionManifestV1) {
  if (!value || !Array.isArray(value.entries)
      || value.entries.length === 0
      || value.entries.length > MAX_KEYS_PER_ACCOUNT) return failed();

  const pairs = value.entries.map(row => ({
    id: normalizedUuid(row.bodyId),
    key: boundedRef(row.encryptionKeyRef),
  })).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(pairs.map(pair => pair.id)).size !== pairs.length
      || new Set(pairs.map(pair => pair.key)).size !== pairs.length) {
    // A key may not be shared, and each immutable body must retain its
    // original key reference through account deletion and backup replay.
    return failed();
  }
  return Object.freeze({
    bodyIds: Object.freeze(pairs.map(pair => pair.id)),
    keyRefs: Object.freeze(pairs.map(pair => pair.key)),
  });
}

function requireFence(
  value: OfficialReaderDurableDeletionFenceV1 | null,
  subjectId: string,
  deletionJobId: string,
): OfficialReaderDurableDeletionFenceV1 {
  if (!value
      || value.version !== 'official-reader-account-deletion-fence-v1'
      || value.subjectId !== subjectId || value.deletionJobId !== deletionJobId
      || typeof value.fenceId !== 'string'
      || value.fenceId.trim() !== value.fenceId
      || value.fenceId.length === 0 || value.fenceId.length > 256
      || !Array.isArray(value.bodyIds)
      || !Array.isArray(value.keyRefs)
      || value.bodyIds.length !== value.keyRefs.length
      || value.bodyIds.length === 0
      || value.bodyIds.length > MAX_KEYS_PER_ACCOUNT) return failed();
  const ids = value.bodyIds.map(normalizedUuid);
  const keys = value.keyRefs.map(boundedRef);
  if (new Set(ids).size !== ids.length || new Set(keys).size !== keys.length) {
    return failed();
  }
  return value;
}

function sameManifestPairs(
  expectedBodyIds: readonly string[],
  expectedKeyRefs: readonly string[],
  actualBodyIds: readonly string[],
  actualKeyRefs: readonly string[],
): boolean {
  if (expectedBodyIds.length !== actualBodyIds.length
      || expectedBodyIds.length !== expectedKeyRefs.length
      || actualBodyIds.length !== actualKeyRefs.length) return false;
  const known = new Map(expectedBodyIds.map((bodyId, index) =>
    [bodyId, expectedKeyRefs[index]] as const));
  return actualBodyIds.every((bodyId, index) =>
    known.get(bodyId) === actualKeyRefs[index]);
}

export function createOfficialReaderAccountPrivacyDeletionPortV1(input: {
  readonly ledger: OfficialReaderAccountDeletionLedgerPortV1;
  readonly keys: OfficialReaderProtectedKeyErasurePortV1;
}): OfficialReaderAccountPrivacyDeletionPortV1 {
  if (!input.ledger || !input.keys) return failed();

  return Object.freeze({
    async fenceBeforeDatabaseDeletion(preparation: Parameters<OfficialReaderAccountPrivacyDeletionPortV1['fenceBeforeDatabaseDeletion']>[0]) {
      const subjectId = normalizedUuid(preparation.subjectId);
      const deletionJobId = normalizedUuid(preparation.deletionJobId);
      const manifest = normalizeManifest(preparation.manifest);

      const saved = requireFence(
        await input.ledger.recordAccountDeletionFence({
          subjectId, deletionJobId,
          bodyIds: manifest.bodyIds,
          keyRefs: manifest.keyRefs,
        }),
        subjectId, deletionJobId,
      );
      if (!sameManifestPairs(
        manifest.bodyIds, manifest.keyRefs, saved.bodyIds, saved.keyRefs,
      )) return failed();

      // A stale, uncommitted response is not a restore-independent fence.
      const reread = requireFence(
        await input.ledger.readAccountDeletionFence({ subjectId, deletionJobId }),
        subjectId, deletionJobId,
      );
      if (reread.fenceId !== saved.fenceId
          || !sameManifestPairs(
            manifest.bodyIds, manifest.keyRefs, reread.bodyIds, reread.keyRefs,
          )) return failed();
      return reread;
    },

    async finishAfterDatabaseDeletion(continuation: Parameters<OfficialReaderAccountPrivacyDeletionPortV1['finishAfterDatabaseDeletion']>[0]) {
      const subjectId = normalizedUuid(continuation.subjectId);
      const deletionJobId = normalizedUuid(continuation.deletionJobId);
      const fence = await input.ledger.readAccountDeletionFence({
        subjectId, deletionJobId,
      });
      // No manifest was ever required for a legacy account that has never
      // stored protected Reader material. The DB finalizer separately refuses
      // to erase a protected row without its explicit external fence.
      if (fence === null) return null;
      const saved = requireFence(fence, subjectId, deletionJobId);

      for (const keyRef of saved.keyRefs) {
        if (!(await input.keys.isKeyDestroyed(keyRef))) {
          await input.keys.destroyKey(keyRef);
        }
        if (!(await input.keys.isKeyDestroyed(keyRef))) return failed();
      }

      if (await input.ledger.acknowledgeAccountKeyErasure({
        subjectId, deletionJobId, fenceId: saved.fenceId,
      }) !== true) return failed();
      return saved;
    },
  });
}
