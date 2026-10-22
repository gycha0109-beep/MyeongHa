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
  }>): Promise<void>;
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

  const ids = new Set<string>();
  const refs = new Set<string>();
  for (const row of value.entries) {
    const id = normalizedUuid(row.bodyId);
    const ref = boundedRef(row.encryptionKeyRef);
    if (ids.has(id) || refs.has(ref)) {
      // Destroying a shared key would erase other content. All protected
      // answers MUST have dedicated, uniquely eradicable key references.
      return failed();
    }
    ids.add(id);
    refs.add(ref);
  }
  return Object.freeze({
    bodyIds: Object.freeze([...ids].sort()),
    keyRefs: Object.freeze([...refs].sort()),
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
      || value.fenceId.trim() === ''
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

function sameValues(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);
}

export function createOfficialReaderAccountPrivacyDeletionPortV1(input: {
  readonly ledger: OfficialReaderAccountDeletionLedgerPortV1;
  readonly keys: OfficialReaderProtectedKeyErasurePortV1;
}): OfficialReaderAccountPrivacyDeletionPortV1 {
  if (!input.ledger || !input.keys) return failed();

  return Object.freeze({
    async fenceBeforeDatabaseDeletion(preparation) {
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
      if (!sameValues(saved.bodyIds, manifest.bodyIds)
          || !sameValues(saved.keyRefs, manifest.keyRefs)) return failed();

      // A stale, uncommitted response is not a restore-independent fence.
      const reread = requireFence(
        await input.ledger.readAccountDeletionFence({ subjectId, deletionJobId }),
        subjectId, deletionJobId,
      );
      if (reread.fenceId !== saved.fenceId
          || !sameValues(reread.bodyIds, manifest.bodyIds)
          || !sameValues(reread.keyRefs, manifest.keyRefs)) return failed();
      return reread;
    },

    async finishAfterDatabaseDeletion(continuation) {
      const subjectId = normalizedUuid(continuation.subjectId);
      const deletionJobId = normalizedUuid(continuation.deletionJobId);
      const fence = await input.ledger.readAccountDeletionFence({
        subjectId, deletionJobId,
      });
      // No manifest was ever required for a legacy account that has never
      // stored protected Reader material. The DB finalizer separately refuses
      // to erase a protected row without its explicit external fence.
      if (fence === null) return;
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
    },
  });
}
