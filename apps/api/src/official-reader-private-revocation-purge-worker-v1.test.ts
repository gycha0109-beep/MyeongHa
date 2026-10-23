import { describe, expect, it, vi } from 'vitest';
import { runOfficialReaderPrivateRevocationPurgeBatchV1 } from './official-reader-private-revocation-purge-worker-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type {
  OfficialReaderOffPrimaryStoreV1,
  OfficialReaderScopeDeletionFenceV1,
} from './official-reader-node-offprimary-privacy-store-v1.js';

const JOB = '11111111-1111-4111-8111-111111111111';
const SUBJECT = '22222222-2222-4222-8222-222222222222';
const READING = '33333333-3333-4333-8333-333333333333';
const FENCE = '44444444-4444-4444-8444-444444444444';
const B1 = '55555555-5555-4555-8555-555555555555';
const B2 = '66666666-6666-4666-8666-666666666666';
const K1 = 'reader-dek-v1:77777777-7777-4777-8777-777777777777';
const K2 = 'reader-dek-v1:88888888-8888-4888-8888-888888888888';

const BASE: OfficialReaderScopeDeletionFenceV1 = {
  version: 'official-reader-scope-deletion-fence-v1',
  jobId: JOB,
  subjectId: SUBJECT,
  officialReadingId: READING,
  readerCharacterId: 'reader_a',
  fenceId: FENCE,
  bodyIds: [B1, B2],
  keyRefs: [K1, K2],
};

function fixture(overrides: Partial<OfficialReaderScopeDeletionFenceV1> = {}) {
  const fence = { ...BASE, ...overrides };
  const query = vi.fn(async (sql: string) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK'
        || sql.startsWith('SET LOCAL ROLE')) return { rows: [] };
    if (sql.includes('internal_list_official_reader_paid_answer_purge_jobs_v1')) {
      return { rows: [{ jobId: JOB }] };
    }
    if (sql.includes('internal_claim_official_reader_paid_answer_purge_v1')) {
      return { rows: [{
        subjectId: SUBJECT, readingId: READING,
        readerCharacterId: 'reader_a', jobStatus: 'db_erased',
      }] };
    }
    if (sql.includes('internal_qry_official_reader_paid_answer_purge_manifest_v1')) {
      return { rows: [{ result: {
        state: 'db_erased', subjectId: SUBJECT, readingId: READING,
        readerCharacterId: 'reader_a', externalFenceId: FENCE,
      } }] };
    }
    if (sql.includes('internal_renew_official_reader_paid_answer_purge_lease_v1')) {
      return { rows: [{ renewed: true }] };
    }
    if (sql.includes('internal_finish_official_reader_paid_answer_purge_v1')) {
      return { rows: [{ done: true }] };
    }
    if (sql.includes('to_regprocedure')) return { rows: [{ installed: false }] };
    throw new Error('Unexpected worker SQL');
  });
  const release = vi.fn();
  const pool = {
    connect: vi.fn(async () => ({ query, release })),
  } as unknown as PostgresSubjectPoolV1;
  const destroyKey = vi.fn(async () => undefined);
  const isKeyDestroyed = vi.fn(async () => true);
  const ackDb = vi.fn(async () => undefined);
  const ackKeys = vi.fn(async () => undefined);
  const store = {
    keys: { destroyKey, isKeyDestroyed },
    scopeLedger: {
      readScopeDeletionFence: vi.fn(async () => fence),
      acknowledgeScopeDatabaseErasure: ackDb,
      acknowledgeScopeKeyErasure: ackKeys,
    },
  } as unknown as OfficialReaderOffPrimaryStoreV1;
  const run = () => runOfficialReaderPrivateRevocationPurgeBatchV1({
    pool, store, workerId: 'privacy-worker-1', limit: 1,
  });
  return { run, destroyKey, isKeyDestroyed, ackDb, ackKeys, query };
}

describe('S4 resumed refund purge fence must be valid before key erasure', () => {
  it('accepts an exact authenticated-looking, unique and well-formed fence', async () => {
    const { run, ackDb, ackKeys, destroyKey } = fixture();
    const result = await run();
    expect(result).toMatchObject({
      discovered: 1, completed: 1, failed: 0,
      publicPaidReadEnabled: false, rowsDeleted: 0,
    });
    expect(ackDb).toHaveBeenCalledWith(JOB, FENCE);
    expect(ackKeys).toHaveBeenCalledWith(JOB, FENCE);
    expect(destroyKey).not.toHaveBeenCalled();
  });

  it.each([
    ['duplicate body', { bodyIds: [B1, B1] }],
    ['duplicate DEK', { keyRefs: [K1, K1] }],
    ['non-UUID body', { bodyIds: [B1, 'browser-forged-body'] }],
    ['non-Reader key', { keyRefs: [K1, 'different-product-key'] }],
    ['null body', { bodyIds: [B1, null] }],
    ['wrong key array count', { keyRefs: [K1] }],
    ['empty key array', { keyRefs: [] }],
  ])('fails closed for a corrupted external fence: %s', async (_label, patch) => {
    // A compromised record must never drive DEK destruction, key-erasure
    // acknowledgement or the SQL completion of a resumed purge job.
    const { run, destroyKey, isKeyDestroyed, ackDb, ackKeys, query } =
      fixture(patch as Partial<OfficialReaderScopeDeletionFenceV1>);
    await expect(run()).rejects.toThrow(
      'Protected Reader revocation cleanup is unavailable.',
    );
    expect(destroyKey).not.toHaveBeenCalled();
    expect(isKeyDestroyed).not.toHaveBeenCalled();
    expect(ackDb).not.toHaveBeenCalled();
    expect(ackKeys).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) =>
      typeof sql === 'string'
      && sql.includes('internal_finish_official_reader_paid_answer_purge_v1'),
    )).toBe(false);
  });
});
