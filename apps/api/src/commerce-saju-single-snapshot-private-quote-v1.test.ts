import { describe, expect, it, vi } from 'vitest';
import type { PostgresSubjectPoolV1, PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import {
  COMMERCE_SAJU_VERIFIED_LEDGER_SQL_V1,
  COMMERCE_SAJU_VERIFIED_RECORD_SQL_V1,
} from './commerce-saju-verified-ledger-source-v1.js';
import { quoteSajuFromOnePrivateSnapshotV1 }
  from './commerce-saju-single-snapshot-private-quote-v1.js';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const subjectId = id(801), sajuRecordId = id(802), natalVersion = id(803);
function fixture() {
  const query = vi.fn(async (sql: string, params?: readonly unknown[]) => {
    if (sql === COMMERCE_SAJU_VERIFIED_RECORD_SQL_V1) {
      expect(params).toEqual([sajuRecordId, subjectId]);
      return { rows:[{ recordId:sajuRecordId, subjectId, birthRevisionId:natalVersion }] };
    }
    if (sql === COMMERCE_SAJU_VERIFIED_LEDGER_SQL_V1) {
      expect(params).toEqual([subjectId, sajuRecordId]);
      return { rows:[] };
    }
    return { rows:[] };
  });
  const release = vi.fn();
  const connection = { query, release };
  const connect = vi.fn(async () => connection);
  const pool = {connect} as unknown as PostgresSubjectPoolV1;
  const readOwnedFields = vi.fn(async ({client}: {client:PostgresTransactionQueryV1}) => {
    expect(client).toBe(connection);
    await client.query('select current record-scoped effective Grant evidence');
    return { authority:'record_scoped_current_effective_entitlements' as const,
      subjectId, sajuRecordId, natalVersion, fields:[] as const };
  });
  return {pool, query, release, connect, readOwnedFields};
}

describe('non-saleable Saju same-snapshot private quote bridge', () => {
  it('reads current rights then real receipts from one repeatable-read read-only transaction', async () => {
    const x=fixture();
    const quote=await quoteSajuFromOnePrivateSnapshotV1({
      pool:x.pool, ownedFieldsAuthority:{readOwnedFields:x.readOwnedFields},
      subjectId, sajuRecordId, natalVersion, targetProductKey:'standard.career',
    });
    expect(quote.status).toBe('quoted');
    expect(quote.additionalPaymentMinor).toBe(9900);
    expect(quote.checkoutAuthorized).toBe(false);
    expect(x.connect).toHaveBeenCalledTimes(1);
    expect(x.readOwnedFields).toHaveBeenCalledTimes(1);
    expect(x.query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
      'SET LOCAL ROLE myeongha_commerce_internal_executor',
      'select current record-scoped effective Grant evidence',
      COMMERCE_SAJU_VERIFIED_RECORD_SQL_V1,
      COMMERCE_SAJU_VERIFIED_LEDGER_SQL_V1,
      'COMMIT',
    ]);
    expect(x.release).toHaveBeenCalledWith(undefined);
  });

  it('refuses cross-record rights and rolls back the entire snapshot', async () => {
    const x=fixture();
    x.readOwnedFields.mockImplementationOnce(async ({client}) => {
      await client.query('select current record-scoped effective Grant evidence');
      return { authority:'record_scoped_current_effective_entitlements' as const,
        subjectId, sajuRecordId:id(999), natalVersion, fields:[] as const };
    });
    await expect(quoteSajuFromOnePrivateSnapshotV1({
      pool:x.pool, ownedFieldsAuthority:{readOwnedFields:x.readOwnedFields},
      subjectId,sajuRecordId,natalVersion,targetProductKey:'standard.career',
    })).rejects.toThrow('SAJU_LEDGER_SOURCE_HOLD_OWNED_FIELDS_UNPROVEN');
    expect(x.query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
      'SET LOCAL ROLE myeongha_commerce_internal_executor',
      'select current record-scoped effective Grant evidence',
      'ROLLBACK',
    ]);
    expect(x.release).toHaveBeenCalledWith(undefined);
  });

  it('holds if no current DB-backed Grant reader exists, before any DB connection', async () => {
    const x=fixture();
    await expect(quoteSajuFromOnePrivateSnapshotV1({
      pool:x.pool,
      ownedFieldsAuthority:null as never,
      subjectId,sajuRecordId,natalVersion,targetProductKey:'standard.career',
    })).rejects.toThrow('SAJU_PRIVATE_QUOTE_EFFECTIVE_GRANT_SOURCE_REQUIRED');
    expect(x.connect).not.toHaveBeenCalled();
  });

  it('does not accept a failed/absent effective rights read as owned', async () => {
    const x=fixture();
    x.readOwnedFields.mockRejectedValueOnce(Error('current Grant source missing'));
    await expect(quoteSajuFromOnePrivateSnapshotV1({
      pool:x.pool, ownedFieldsAuthority:{readOwnedFields:x.readOwnedFields},
      subjectId,sajuRecordId,natalVersion,targetProductKey:'standard.career',
    })).rejects.toThrow('current Grant source missing');
    expect(x.query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
      'SET LOCAL ROLE myeongha_commerce_internal_executor',
      'ROLLBACK',
    ]);
  });
});
