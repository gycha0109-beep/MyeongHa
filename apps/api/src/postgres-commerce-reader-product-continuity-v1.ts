import {
  resolveCommerceReaderRecordContinuityV1,
  type CommerceReaderRecordContinuityV1,
} from './commerce-reader-product-continuity-v1.js';
import { createPostgresOfficialReadingRecordAuthorityPortV1 } from './official-reading-record-http.js';
import {
  createPostgresCommerceReaderVerifiedPurchaseStatusPortV1,
} from './commerce-reader-verified-purchase-status-v1.js';
import { createPostgresCharacterStandardReadingKnowledgePortsV1 } from './postgres-character-standard-reading-knowledge.js';
import { createPostgresOfficialReaderThreadLocatorAuthorityPortV1 } from './postgres-official-reader-thread-locator-v1.js';
import { createPostgresChatThreadRuntimeBindingAuthorityPortV1 } from './postgres-chat-thread-runtime-binding.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
  type PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';
import type { ProductReaderEligibilityAuthorityPortV1 } from './product-reader-eligibility-policy-v1.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

/**
 * Commerce/Records server composition for the existing product sequence:
 * verified purchase -> Reader short delivery (Saju/Reader-owned, still HOLD)
 * -> existing Member x Reader follow-up -> ONE Official Reading in Records.
 *
 * This does not activate any Public API or prompt. The same Subject
 * transaction supplies existing Records and Reader D-05 authority ports.
 * Only this verified DB Subject, not a browser receipt or cached purchase,
 * decides whether the owned Reading is present. Reader follow-up must
 * independently obtain a fresh exact Grant/Policy/Thread candidate; even
 * that candidate is NOT a paid content read or a Chat send capability.
 */

const DB_CLOCK_SQL = 'select clock_timestamp() as "effectiveAt"';

function requireServerTime(value: unknown): string {
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) {
    throw new Error('Commerce Reader product transaction clock is unavailable.');
  }
  return date.toISOString();
}

export interface PostgresCommerceReaderRecordContinuityInputV1 {
  readonly pool: PostgresSubjectPoolV1;
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  /** Selectors only, not stored Source Truth or a Reader Grant. */
  readonly readingId: string;
  readonly readerCharacterId: string;
  /** Reuse Product-owned eligibility port from this SAME Subject transaction. */
  readonly createProductReaderPolicyAuthorityPort: (
    client: PostgresTransactionQueryV1,
  ) => ProductReaderEligibilityAuthorityPortV1;
}

export async function resolvePostgresCommerceReaderRecordContinuityV1(
  input: PostgresCommerceReaderRecordContinuityInputV1,
): Promise<CommerceReaderRecordContinuityV1> {
  if (!input || !input.pool || !input.verifiedEvidence
      || typeof input.createProductReaderPolicyAuthorityPort !== 'function') {
    throw new Error('Commerce Reader owner-scoped continuity is unavailable.');
  }
  return executePostgresSubjectTransactionV1({
    pool: input.pool,
    verifiedEvidence: input.verifiedEvidence,
    execute: async ({ client, resolvedSubject }) => {
      const tick = await client.query<{ effectiveAt: unknown }>(DB_CLOCK_SQL);
      if (tick.rows.length !== 1) {
        throw new Error('Commerce Reader transaction clock is ambiguous.');
      }
      const effectiveAt = requireServerTime(tick.rows[0]?.effectiveAt);
      const policyPort = input.createProductReaderPolicyAuthorityPort(client);
      if (!policyPort || typeof policyPort.readApprovedRule !== 'function') {
        throw new Error('Commerce Reader Product policy authority is unavailable.');
      }
      return resolveCommerceReaderRecordContinuityV1({
        resolvedSubjectId: resolvedSubject.subjectId,
        resolvedSubjectKind: resolvedSubject.subjectKind,
        readingId: input.readingId,
        readerCharacterId: input.readerCharacterId,
        effectiveAt,
        recordAuthorityPort: createPostgresOfficialReadingRecordAuthorityPortV1(client),
        // Fail closed if the privately held S1/status function has not
        // been Owner-applied or the DB role lacks its explicit permission.
        verifiedPurchaseStatusAuthorityPort:
          createPostgresCommerceReaderVerifiedPurchaseStatusPortV1(client),
        readerAuthorities: {
          accessAuthorityPort:
            createPostgresCharacterStandardReadingKnowledgePortsV1(client).accessAuthorityPort,
          productReaderEligibilityAuthorityPort: policyPort,
          threadLocatorAuthorityPort:
            createPostgresOfficialReaderThreadLocatorAuthorityPortV1(client),
          threadBindingAuthorityPort:
            createPostgresChatThreadRuntimeBindingAuthorityPortV1(client),
        },
      });
    },
  });
}
