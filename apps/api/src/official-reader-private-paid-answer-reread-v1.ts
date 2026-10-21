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
export async function readPrivateOfficialReaderPaidAnswerV1(input: {
  readonly pool: PostgresSubjectPoolV1;
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly bodyId: string;
  readonly keyResolver: PrivateOfficialReaderPaidAnswerKeyResolverV1;
}): Promise<PrivateOfficialReaderPaidAnswerReadV1> {
  const bodyId = asUuid(input.bodyId);
  try {
    return await executePostgresSubjectTransactionV1({
      pool: input.pool,
      verifiedEvidence: input.verifiedEvidence,
      execute: async (scope) => {
        const subjectId = asUuid(scope.resolvedSubject.subjectId);
        const result = await scope.client.query<CiphertextRow>(
          READ_SQL, [subjectId, bodyId],
        );
        const row = result.rows[0];
        if (result.rows.length !== 1 || row === undefined
            || asUuid(row.bodyId) !== bodyId) return unavailable();

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
        return Object.freeze({
          bodyId,
          officialReadingId: identity.officialReadingId,
          readerCharacterId: identity.readerCharacterId,
          committedAt,
          body,
        });
      },
    });
  } catch {
    return unavailable();
  }
}
