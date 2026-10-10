import {
  resolveOfficialReadingReaderThreadV1,
  OfficialReadingReaderThreadResolutionErrorV1,
  type ResolvedOfficialReadingReaderThreadV1,
} from './official-reading-reader-thread-resolution-v1.js';
import { createPostgresCharacterStandardReadingKnowledgePortsV1 } from './postgres-character-standard-reading-knowledge.js';
import { createPostgresChatThreadRuntimeBindingAuthorityPortV1 } from './postgres-chat-thread-runtime-binding.js';
import { createPostgresOfficialReaderThreadLocatorAuthorityPortV1 } from './postgres-official-reader-thread-locator-v1.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
  type PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';
import type { ProductReaderEligibilityAuthorityPortV1 } from './product-reader-eligibility-policy-v1.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

/**
 * Dormant D-05 server-only, existing-Thread lookup. This is NOT a public HTTP
 * endpoint, paid admission, chat-opening command, or a source of Reader content.
 *
 * Product/Commerce must supply its independently approved authority port from
 * the SAME transaction scope. There is intentionally no guessed approved
 * Product SKU or hardcoded universal Reader eligibility.
 */
export interface ResolvePostgresOfficialReadingReaderThreadInputV1 {
  readonly pool: PostgresSubjectPoolV1;
  /** Auth middleware-verified server evidence; never request JSON. */
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly readingId: unknown;
  readonly readerCharacterId: unknown;
  readonly createProductReaderPolicyAuthorityPort: (
    client: PostgresTransactionQueryV1,
  ) => ProductReaderEligibilityAuthorityPortV1;
}

type TransactionClockRowV1 = Readonly<{ effectiveAt: unknown }>;

/** Exact transaction timestamp; no client clock or cached browser value. */
const DB_TRANSACTION_CLOCK_SQL =
  'select transaction_timestamp() as "effectiveAt"';

function serverEffectiveAt(rows: readonly TransactionClockRowV1[]): string {
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new OfficialReadingReaderThreadResolutionErrorV1('ACCESS_DENIED');
  }
  const value = rows[0]?.effectiveAt;
  const parsed = value instanceof Date
    ? value
    : typeof value === 'string' ? new Date(value) : null;
  if (parsed === null || !Number.isFinite(parsed.getTime())) {
    throw new OfficialReadingReaderThreadResolutionErrorV1('ACCESS_DENIED');
  }
  return parsed.toISOString();
}

/**
 * Binds Subject, purchase-backed access, Product policy, bounded Member Thread
 * discovery and known-Thread runtime binding to one PostgreSQL transaction.
 *
 * An existing Thread is returned ONLY when all independent authorities agree
 * on exact Reading + Reader + pinned bundle. No first-Thread create-or-reuse
 * fallback: that remains blocked by D05-A/C and Product #1828.
 *
 * This read-only result expires as soon as the transaction finishes. It MUST
 * NOT be used as an admission ticket, Chat send/reveal authorization or grant
 * after a refund; A2 / T2 must recheck current DB authority.
 */
export async function resolvePostgresOfficialReadingReaderThreadV1(
  input: ResolvePostgresOfficialReadingReaderThreadInputV1,
): Promise<ResolvedOfficialReadingReaderThreadV1> {
  if (typeof input.readingId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(input.readingId) ||
      typeof input.readerCharacterId !== 'string' ||
      input.readerCharacterId.length === 0 ||
      input.readerCharacterId !== input.readerCharacterId.trim() ||
      input.readerCharacterId.length > 64) {
    throw new OfficialReadingReaderThreadResolutionErrorV1('ACCESS_DENIED');
  }

  // Do not start a Guest DB Reader lookup. Verified Member identity is still
  // resolved authoritatively in the transaction below.
  if (input.verifiedEvidence?.kind !== 'member') {
    throw new OfficialReadingReaderThreadResolutionErrorV1('ACCESS_DENIED');
  }

  return executePostgresSubjectTransactionV1({
    pool: input.pool,
    verifiedEvidence: input.verifiedEvidence,
    execute: async ({ resolvedSubject, client }) => {
      if (resolvedSubject.subjectKind !== 'member') {
        throw new OfficialReadingReaderThreadResolutionErrorV1('ACCESS_DENIED');
      }
      const clock = await client.query<TransactionClockRowV1>(DB_TRANSACTION_CLOCK_SQL);
      const effectiveAt = serverEffectiveAt(clock.rows);

      // Only internal API code can provide this Product-owned port factory.
      // The factory is called AFTER the authenticated Subject is bound.
      const policyPort = input.createProductReaderPolicyAuthorityPort(client);
      if (!policyPort || typeof policyPort.readApprovedRule !== 'function') {
        throw new OfficialReadingReaderThreadResolutionErrorV1('POLICY_HOLD');
      }
      return resolveOfficialReadingReaderThreadV1({
        resolvedSubjectId: resolvedSubject.subjectId,
        resolvedSubjectKind: resolvedSubject.subjectKind,
        readingId: input.readingId,
        readerCharacterId: input.readerCharacterId,
        effectiveAt,
        accessAuthorityPort: createPostgresCharacterStandardReadingKnowledgePortsV1(client),
        productReaderEligibilityAuthorityPort: policyPort,
        threadLocatorAuthorityPort: createPostgresOfficialReaderThreadLocatorAuthorityPortV1(client),
        threadBindingAuthorityPort: createPostgresChatThreadRuntimeBindingAuthorityPortV1(client),
      });
    },
  });
}
