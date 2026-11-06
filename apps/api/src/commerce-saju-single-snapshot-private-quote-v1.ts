import type {
  PostgresSubjectPoolV1,
  PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';
import { executePostgresCommerceInternalTransactionV1 }
  from './postgres-commerce-internal-execution.js';
import type { SajuProductKeyV1, SajuUpgradeQuoteV1 }
  from './commerce-saju-upgrade-pricing-v1.js';
import {
  quoteSajuFromPostgresVerifiedLedgerV1,
  type SajuVerifiedLedgerOwnedFieldsProofV1,
} from './commerce-saju-verified-ledger-source-v1.js';

/**
 * Non-saleable internal snapshot candidate. The future DB-owned field reader
 * MUST read active effective Grants scoped to the exact Saju Record, not
 * infer ownership from products or paid receipts. There is currently no
 * approved Saju field->Capability Grant mapping; this remains unmounted.
 */
export interface SajuPrivateOwnedFieldSnapshotReaderV1 {
  readOwnedFields(input: {
    readonly client: PostgresTransactionQueryV1;
    readonly subjectId: string;
    readonly sajuRecordId: string;
    readonly natalVersion: string;
  }): Promise<SajuVerifiedLedgerOwnedFieldsProofV1>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
function requireId(value: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw Error('SAJU_PRIVATE_QUOTE_ID_INVALID');
  }
  return value.toLowerCase();
}

/**
 * One connection, REPEATABLE READ + READ ONLY, and one privileged private role
 * for the record, real receipt/refund rows and future effective Grant source.
 *
 * The trusted ownership reader is intentionally a required dependency instead
 * of a guessed mapping from the historical Product ledger. This does not
 * create that reader, grant authority, payment admission, or a public route.
 */
export async function quoteSajuFromOnePrivateSnapshotV1(input: {
  readonly pool: PostgresSubjectPoolV1;
  readonly ownedFieldsAuthority: SajuPrivateOwnedFieldSnapshotReaderV1;
  readonly subjectId: string;
  readonly sajuRecordId: string;
  readonly natalVersion: string;
  readonly targetProductKey: SajuProductKeyV1;
}): Promise<SajuUpgradeQuoteV1> {
  const subjectId = requireId(input.subjectId);
  const sajuRecordId = requireId(input.sajuRecordId);
  const natalVersion = requireId(input.natalVersion);
  if (typeof input.ownedFieldsAuthority?.readOwnedFields !== 'function') {
    throw Error('SAJU_PRIVATE_QUOTE_EFFECTIVE_GRANT_SOURCE_REQUIRED');
  }

  return executePostgresCommerceInternalTransactionV1({
    pool: input.pool,
    transactionMode: 'read_only_repeatable_read',
    execute: async ({ client }) => {
      // The same transaction client is passed to both independent authorities.
      const verifiedOwnedFields = await input.ownedFieldsAuthority.readOwnedFields({
        client, subjectId, sajuRecordId, natalVersion,
      });
      if (!verifiedOwnedFields || typeof verifiedOwnedFields !== 'object') {
        throw Error('SAJU_PRIVATE_QUOTE_EFFECTIVE_GRANT_SOURCE_UNAVAILABLE');
      }
      return quoteSajuFromPostgresVerifiedLedgerV1({
        client, subjectId, sajuRecordId, natalVersion,
        targetProductKey: input.targetProductKey,
        verifiedOwnedFields,
      });
    },
  });
}
