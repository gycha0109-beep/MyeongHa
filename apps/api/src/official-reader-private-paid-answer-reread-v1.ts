import {
  decryptOfficialReaderProtectedBodyV1,
  OFFICIAL_READER_PROTECTED_CIPHER_VERSION_V1,
  type OfficialReaderProtectedBodyIdentityV1,
  type OfficialReaderProtectedBodyKeyV1,
} from './official-reader-protected-body-crypto-v1.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';
import {
  currentOfficialReaderPrivacyReadLeaseV1,
  type OfficialReaderPrivatePrivacyLedgerPortV1,
} from './official-reader-private-privacy-ledger-v1.js';
import {
  prepareOfficialReaderPrivateDeliveryV1,
  type OfficialReaderPrivateDeliveryPreparedV1,
  type OfficialReaderPrivateDeliveryReservationV1,
} from './official-reader-private-delivery-journal-v1.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const READ_SQL = `
select
  body_id::text as "bodyId",
  thread_id::text as "threadId",
  turn_id::text as "turnId",
  attempt_id::text as "attemptId",
  safe_message_id::text as "safeMessageId",
  official_reading_id::text as "officialReadingId",
  reader_character_id as "readerCharacterId",
  reader_content_bundle_id::text as "readerContentBundleId",
  content_release_id::text as "contentReleaseId",
  originating_entitlement_grant_id::text as "originatingGrantId",
  product_id::text as "productId",
  source_response_hash as "sourceResponseHash",
  encryption_scheme_version as "encryptionSchemeVersion",
  encryption_key_ref as "encryptionKeyRef",
  encryption_iv as "encryptionIv",
  encryption_auth_tag as "encryptionAuthTag",
  encrypted_body as "encryptedBody",
  committed_at::text as "committedAt"
from public.internal_qry_official_reader_paid_answer_ciphertext_v1(
  $1::uuid, $2::uuid
)
`;
const READ_CHAT_MARKER_SQL = READ_SQL.replace(
  'from public.internal_qry_official_reader_paid_answer_ciphertext_v1(\n  $1::uuid, $2::uuid\n)',
  'from public.internal_qry_official_reader_paid_chat_marker_ciphertext_v1(\n  $1::uuid, $2::uuid, $3::uuid\n)',
);

type CiphertextRow = Readonly<{
  bodyId: unknown;
  threadId: unknown;
  turnId: unknown;
  attemptId: unknown;
  safeMessageId: unknown;
  officialReadingId: unknown;
  readerCharacterId: unknown;
  readerContentBundleId: unknown;
  contentReleaseId: unknown;
  originatingGrantId: unknown;
  productId: unknown;
  sourceResponseHash: unknown;
  encryptionSchemeVersion: unknown;
  encryptionKeyRef: unknown;
  encryptionIv: unknown;
  encryptionAuthTag: unknown;
  encryptedBody: unknown;
  committedAt: unknown;
}>;

export interface PrivateOfficialReaderPaidAnswerReadV1 {
  readonly bodyId: string;
  readonly officialReadingId: string;
  readonly readerCharacterId: string;
  readonly committedAt: string;
  /** Protected private value: NEVER pass to ordinary Chat/Memory/log/HTTP. */
  readonly body: string;
  /** Prepared != delivered. No client ACK is implied by this field. */
  readonly delivery?: OfficialReaderPrivateDeliveryPreparedV1;
}

/**
 * S6 private, SYNCHRONOUS in-memory key resolution.
 * No network or external key-service I/O while the S1 lock is held.
 * A production key provider/erase/restore contract is still Owner-blocked.
 */
export interface PrivateOfficialReaderPaidAnswerKeyResolverV1 {
  resolveCachedKey(keyRef: string): OfficialReaderProtectedBodyKeyV1 | null;
}

export class PrivateOfficialReaderPaidAnswerReadErrorV1 extends Error {
  readonly code = 'PAID_READER_READ_UNAVAILABLE' as const;
  constructor() {
    super('Official Reader protected answer is not available.');
    this.name = 'PrivateOfficialReaderPaidAnswerReadErrorV1';
  }
}

function unavailable(): never {
  throw new PrivateOfficialReaderPaidAnswerReadErrorV1();
}
function asUuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) return unavailable();
  return value.toLowerCase();
}
function asString(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) return unavailable();
  return value;
}
function asBytes(value: unknown): Uint8Array {
  if (!(value instanceof Uint8Array)) return unavailable();
  return value;
}

/**
 * Server-only S6 Reader ciphertext retrieval + private decryption while the
 * same S1 current-entitlement advisory lock still belongs to this transaction.
 * The database independently rejects revoked, expired, wrong-Reader and
 * ambiguous-bundle access; it does NOT expose or reactivate a prior Grant.
 *
 * NO HTTP route, Memory injection, or user-visible release is authorized by
 * this result. The backing SQL remains ungranted to application roles until
 * Privacy recovery ledger/erase and Saju proof receive Owner acceptance.
 */
type ReaderPaidPrivateReadInputV1 = Readonly<{
  pool: PostgresSubjectPoolV1;
  verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  keyResolver: PrivateOfficialReaderPaidAnswerKeyResolverV1;
  /** Owner-supplied off-primary Privacy ledger, mandatory even for rerender. */
  privacyLedgerPort: OfficialReaderPrivatePrivacyLedgerPortV1;
  /** Private-only S7, never accepted as a browser-authored release flag. */
  deliveryReservation?: OfficialReaderPrivateDeliveryReservationV1;
}>;
type ReaderPaidPrivateSelectorV1 =
  | Readonly<{ kind: 'body'; bodyId: string }>
  | Readonly<{ kind: 'chat_marker'; threadId: string; safeMessageId: string }>;

export async function readPrivateOfficialReaderPaidAnswerV1(input:
  ReaderPaidPrivateReadInputV1 & Readonly<{ bodyId: string }>,
): Promise<PrivateOfficialReaderPaidAnswerReadV1> {
  return readPrivateOfficialReaderPaidAnswerCoreV1(
    input, { kind: 'body', bodyId: asUuid(input.bodyId) },
  );
}

/**
 * The public Chat gives the browser ONLY a safe message ID and a Thread ID.
 * This server-only bridge resolves the stored paid body ID after binding both
 * identifiers to the authenticated Subject and current Reader Grant.
 */
export async function readPrivateOfficialReaderPaidChatMessageV1(input:
  ReaderPaidPrivateReadInputV1 & Readonly<{
    threadId: string;
    safeMessageId: string;
  }>,
): Promise<PrivateOfficialReaderPaidAnswerReadV1> {
  return readPrivateOfficialReaderPaidAnswerCoreV1(
    input, {
      kind: 'chat_marker',
      threadId: asUuid(input.threadId),
      safeMessageId: asUuid(input.safeMessageId),
    },
  );
}

async function readPrivateOfficialReaderPaidAnswerCoreV1(
  input: ReaderPaidPrivateReadInputV1,
  selector: ReaderPaidPrivateSelectorV1,
): Promise<PrivateOfficialReaderPaidAnswerReadV1> {
  try {
    // Read Subject authority in a separate short transaction. Do not hold a
    // PostgreSQL Reader scope lock while consulting the independent ledger.
    const subjectId = await executePostgresSubjectTransactionV1({
      pool: input.pool,
      verifiedEvidence: input.verifiedEvidence,
      execute: async ({ resolvedSubject }) => asUuid(resolvedSubject.subjectId),
    });
    const selectorKey = selector.kind === 'body'
      ? `body:${selector.bodyId}`
      : `chat:${selector.threadId}:${selector.safeMessageId}`;
    if (!input.privacyLedgerPort
        || typeof input.privacyLedgerPort.acquireReadLease !== 'function') {
      return unavailable();
    }
    const lease = await input.privacyLedgerPort.acquireReadLease({
      subjectId, selector: selectorKey,
    });
    if (!currentOfficialReaderPrivacyReadLeaseV1({
      port: input.privacyLedgerPort, lease, subjectId, selector: selectorKey,
    })) return unavailable();

    return await executePostgresSubjectTransactionV1({
      pool: input.pool,
      verifiedEvidence: input.verifiedEvidence,
      execute: async (scope) => {
        const refreshedSubjectId = asUuid(scope.resolvedSubject.subjectId);
        if (refreshedSubjectId !== subjectId) return unavailable();
        if (!currentOfficialReaderPrivacyReadLeaseV1({
          port: input.privacyLedgerPort, lease, subjectId, selector: selectorKey,
        })) return unavailable();
        const result = await scope.client.query<CiphertextRow>(
          selector.kind === 'body' ? READ_SQL : READ_CHAT_MARKER_SQL,
          selector.kind === 'body'
            ? [subjectId, selector.bodyId]
            : [subjectId, selector.threadId, selector.safeMessageId],
        );
        const row = result.rows[0];
        if (result.rows.length !== 1 || row === undefined) return unavailable();
        const bodyId = asUuid(row.bodyId);
        if (selector.kind === 'body') {
          if (bodyId !== selector.bodyId) return unavailable();
        } else if (asUuid(row.threadId) !== selector.threadId
            || asUuid(row.safeMessageId) !== selector.safeMessageId) {
          return unavailable();
        }

        const identity: OfficialReaderProtectedBodyIdentityV1 = {
          subjectId,
          threadId: asUuid(row.threadId),
          turnId: asUuid(row.turnId),
          attemptId: asUuid(row.attemptId),
          safeMessageId: asUuid(row.safeMessageId),
          officialReadingId: asUuid(row.officialReadingId),
          readerCharacterId: asString(row.readerCharacterId),
          readerContentBundleId: asUuid(row.readerContentBundleId),
          contentReleaseId: asUuid(row.contentReleaseId),
          originatingEntitlementGrantId: asUuid(row.originatingGrantId),
          productId: asUuid(row.productId),
          sourceResponseHash: asString(row.sourceResponseHash),
        };
        const keyRef = asString(row.encryptionKeyRef);
        if (row.encryptionSchemeVersion !== OFFICIAL_READER_PROTECTED_CIPHER_VERSION_V1
            || !input.keyResolver
            || typeof input.keyResolver.resolveCachedKey !== 'function') {
          return unavailable();
        }
        const key = input.keyResolver.resolveCachedKey(keyRef);
        if (key === null || key === undefined || key.keyRef !== keyRef) {
          return unavailable();
        }

        // This synchronous work completes before transaction COMMIT, while
        // the SQL helper still holds its S1 advisory transaction lock.
        const body = decryptOfficialReaderProtectedBodyV1({
          identity,
          encrypted: {
            version: OFFICIAL_READER_PROTECTED_CIPHER_VERSION_V1,
            keyRef,
            iv: asBytes(row.encryptionIv),
            authTag: asBytes(row.encryptionAuthTag),
            ciphertext: asBytes(row.encryptedBody),
          },
          key,
        });
        const committedAt = asString(row.committedAt);
        if (!Number.isFinite(Date.parse(committedAt))) return unavailable();
        // Final off-primary restore/deletion fence before decrypted text can
        // leave the T2 S1-scoped Reader transaction. Never trust a DB backup's
        // self-declared "restored" flag.
        if (!currentOfficialReaderPrivacyReadLeaseV1({
          port: input.privacyLedgerPort, lease, subjectId, selector: selectorKey,
        })) return unavailable();

        // S7 response preparation is written under the SAME S1 current-right
        // lock, but is distinct from the S5 immutable answer commit and from
        // a client delivery acknowledgment. A SQL error rolls the receipt
        // back; it cannot rewrite the ciphertext or safe Chat message.
        const delivery=input.deliveryReservation === undefined
          ? undefined
          : await prepareOfficialReaderPrivateDeliveryV1({
              scope,subjectId,
              threadId:identity.threadId,
              safeMessageId:identity.safeMessageId,
              bodyId,
              reservation:input.deliveryReservation,
            });
        // The independent outside-backup erasure ledger can change while
        // waiting for SQL; deny plaintext and ROLLBACK prepared receipts if
        // the subject was tombstoned during that interval.
        if (!currentOfficialReaderPrivacyReadLeaseV1({
          port: input.privacyLedgerPort, lease, subjectId, selector: selectorKey,
        })) return unavailable();
        return Object.freeze({
          bodyId,
          officialReadingId: identity.officialReadingId,
          readerCharacterId: identity.readerCharacterId,
          committedAt,
          body,
          ...(delivery === undefined ? {} : { delivery }),
        });
      },
    });
  } catch {
    return unavailable();
  }
}
