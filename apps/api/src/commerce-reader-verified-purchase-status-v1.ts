import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

/**
 * Narrow Commerce evidence read in the SAME owner-scoped DB transaction.
 * Does not return Receipt/Grant/provider IDs, money, plaintext, or policy
 * decisions. The private DB helper uses the S1 Reader lock and checks
 * independent currently verified production Receipts before declaring rights.
 *
 * Neither this port nor D-05 permits paid answer read, paid generation, new
 * Chat/Memory insertion, user-visible refund authorization, or SDK action.
 */
export type CommerceReaderVerifiedPurchaseStateV1 =
  | 'current_verified_purchase'
  | 'verified_full_cancellation'
  | 'not_confirmed';

export interface CommerceReaderVerifiedPurchaseStatusV1 {
  readonly state: CommerceReaderVerifiedPurchaseStateV1;
  readonly currentVerifiedPurchaseGrantCount: number;
}

export interface CommerceReaderVerifiedPurchaseStatusAuthorityPortV1 {
  readExactCurrentPurchase(input: Readonly<{
    subjectId: string;
    readingId: string;
    readerCharacterId: string;
  }>): Promise<CommerceReaderVerifiedPurchaseStatusV1>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const READER = /^[a-z][a-z0-9_-]{0,63}$/u;
const READ_SQL = `
select
  state,
  current_verified_purchase_grant_count::text as "grantCount"
from public.internal_qry_official_reader_verified_cancellation_status_v1(
  $1::uuid,$2::uuid,$3::text
)
`;

export class CommerceReaderVerifiedPurchaseStatusErrorV1 extends Error {
  constructor() {
    super('Exact Commerce Reader verified purchase status is unavailable.');
    this.name = 'CommerceReaderVerifiedPurchaseStatusErrorV1';
  }
}
function fail(): never {
  throw new CommerceReaderVerifiedPurchaseStatusErrorV1();
}

function requireUuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) return fail();
  return value.toLowerCase();
}

/**
 * Private-only adapter: no new grant to the regular API executor. A future
 * Owner-owned caller must supply the already-governed DB transaction role;
 * until then this unavailable function is an intentional deployment HOLD.
 */
export function createPostgresCommerceReaderVerifiedPurchaseStatusPortV1(
  client: PostgresTransactionQueryV1,
): CommerceReaderVerifiedPurchaseStatusAuthorityPortV1 {
  if (!client || typeof client.query !== 'function') return fail();
  return Object.freeze({
    async readExactCurrentPurchase(input): Promise<CommerceReaderVerifiedPurchaseStatusV1> {
      try {
        const subjectId = requireUuid(input.subjectId);
        const readingId = requireUuid(input.readingId);
        if (!READER.test(input.readerCharacterId)) return fail();

        const result = await client.query<{
          state: unknown;
          grantCount: unknown;
        }>(READ_SQL,[subjectId,readingId,input.readerCharacterId]);
        const row = result.rows[0];
        if (result.rows.length !== 1 || !row
            || typeof row.grantCount !== 'string'
            || !/^(0|[1-9][0-9]*)$/u.test(row.grantCount)) return fail();

        const count = Number(row.grantCount);
        if (!Number.isSafeInteger(count) || count < 0) return fail();

        if (row.state === 'current_verified_purchase' && count > 0) {
          return Object.freeze({
            state: row.state,
            currentVerifiedPurchaseGrantCount: count,
          });
        }
        if ((row.state === 'verified_full_cancellation' ||
             row.state === 'not_confirmed') && count === 0) {
          return Object.freeze({
            state: row.state,
            currentVerifiedPurchaseGrantCount: 0,
          });
        }
        return fail();
      } catch {
        return fail();
      }
    },
  });
}
