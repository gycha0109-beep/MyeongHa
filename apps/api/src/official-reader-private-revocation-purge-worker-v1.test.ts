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

function fixture(
  overrides: Partial<OfficialReaderScopeDeletionFenceV1> = {},
  phase: { claim?: 'claimed' | 'db_erased'; manifest?: 'eligible' | 'no_content' | 'sibling_right_present' | 'db_erased'; loseLeaseAtRenewal?: number; keysInitiallyDestroyed?: boolean; uppercaseEligibleKey?: boolean } = {},
) {
  const fence = { ...BASE, ...overrides };
  let renewals=0;
  const destroyed=new Set<string>(phase.keysInitiallyDestroyed===false ? [] : [K1,K2]);
  const query = vi.fn(async (sql: string) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK'
        || sql.startsWith('SET LOCAL ROLE')) return { rows: [] };
    if (sql.includes('internal_list_official_reader_paid_answer_purge_jobs_v1')) {
      return { rows: [{ jobId: JOB }] };
    }
    if (sql.includes('internal_claim_official_reader_paid_answer_purge_v1')) {
      return { rows: [{
        subjectId: SUBJECT, readingId: READING,
        readerCharacterId: 'reader_a', jobStatus: phase.claim ?? 'db_erased',
      }] };
    }
    if (sql.includes('internal_qry_official_reader_paid_answer_purge_manifest_v1')) {
      return { rows: [{ result: {
        state: phase.manifest ?? 'db_erased', subjectId: SUBJECT, readingId: READING,
        readerCharacterId: 'reader_a', externalFenceId: FENCE,
        ...(phase.manifest==='eligible' ? { entries:[
          {bodyId:B1,encryptionKeyRef:phase.uppercaseEligibleKey
            ? 'reader-dek-v1:ABCDEF12-3456-4789-8abc-def012345678' : K1},
          {bodyId:B2,encryptionKeyRef:K2},
        ]} : {}),
      } }] };
    }
    if (sql.includes('internal_renew_official_reader_paid_answer_purge_lease_v1')) {
      renewals++;
      return { rows: [{ renewed: renewals!==phase.loseLeaseAtRenewal }] };
    }
    if (sql.includes('internal_finish_official_reader_paid_answer_purge_v1')
        || sql.includes('internal_finish_empty_official_reader_paid_answer_purge_v1')) {
      return { rows: [{ done: true }] };
    }
    if (sql.includes('internal_release_official_reader_paid_answer_purge_v1')) {
      return { rows: [{ released: true }] };
    }
    if (sql.includes('to_regprocedure')) return { rows: [{ installed: false }] };
    throw new Error('Unexpected worker SQL');
  });
  const release = vi.fn();
  const pool = {
    connect: vi.fn(async () => ({ query, release })),
  } as unknown as PostgresSubjectPoolV1;
  const destroyKey = vi.fn(async (keyRef:string) => { destroyed.add(keyRef); });
  const isKeyDestroyed = vi.fn(async (keyRef:string) => destroyed.has(keyRef));
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
  return { run, destroyKey, isKeyDestroyed, ackDb, ackKeys, query,
    renewals:()=>renewals, destroyedKeys:()=>[...destroyed] };
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

  it('renews the live DB lease once per DEK and again before ACK',async()=>{
    const x=fixture();
    await expect(x.run()).resolves.toMatchObject({completed:1,failed:0});
    // Resume/entry + DB-erased ACK + TWO independent keys + final ACK.
    expect(x.renewals()).toBe(5);
  });

  it('stops before the second key when a competing worker reclaims ownership',async()=>{
    const x=fixture({}, {loseLeaseAtRenewal:4,keysInitiallyDestroyed:false});
    await expect(x.run()).rejects.toThrow(
      'Protected Reader revocation cleanup is unavailable.',
    );
    expect(x.renewals()).toBe(4);
    expect(x.destroyKey).toHaveBeenCalledTimes(1);
    expect(x.destroyKey).toHaveBeenCalledWith(K1);
    expect(x.destroyedKeys()).toEqual([K1]);
    expect(x.ackKeys).not.toHaveBeenCalled();
    expect(x.query.mock.calls.some(([sql])=>typeof sql==='string'
      && sql.includes('internal_finish_official_reader_paid_answer_purge_v1'),
    )).toBe(false);
  });

  it('rejects noncanonical eligible DEK references before creating a new fence',async()=>{
    const x=fixture({}, {claim:'claimed',manifest:'eligible',uppercaseEligibleKey:true});
    await expect(x.run()).rejects.toThrow(
      'Protected Reader revocation cleanup is unavailable.',
    );
    expect(x.destroyKey).not.toHaveBeenCalled();
    expect(x.ackKeys).not.toHaveBeenCalled();
    expect(x.ackDb).not.toHaveBeenCalled();
  });

  it.each([
    ['no_content', { empty: 1, deferredForSiblingRight: 0 }],
    ['sibling_right_present', { empty: 0, deferredForSiblingRight: 1 }],
  ] as const)('preserves safe claimed-job %s path without key destruction',
    async (manifest, expected) => {
      const { run, destroyKey, isKeyDestroyed, ackDb, ackKeys } =
        fixture({}, { claim: 'claimed', manifest });
      expect(await run()).toMatchObject({
        discovered: 1, completed: 0, failed: 0, ...expected,
        publicPaidReadEnabled: false,
      });
      expect(destroyKey).not.toHaveBeenCalled();
      expect(isKeyDestroyed).not.toHaveBeenCalled();
      expect(ackDb).not.toHaveBeenCalled();
      expect(ackKeys).not.toHaveBeenCalled();
    });

  it.each([
    ['db_erased claim with active sibling decision', 'db_erased', 'sibling_right_present'],
    ['db_erased claim with no-content decision', 'db_erased', 'no_content'],
    ['fresh claim with historical db-erased fence', 'claimed', 'db_erased'],
  ] as const)('rejects purge claim / journal phase contradictions: %s',
    async (_label, claim, manifest) => {
      const { run, destroyKey, isKeyDestroyed, ackDb, ackKeys, query } =
        fixture({}, { claim, manifest });
      await expect(run()).rejects.toThrow(
        'Protected Reader revocation cleanup is unavailable.',
      );
      expect(destroyKey).not.toHaveBeenCalled();
      expect(isKeyDestroyed).not.toHaveBeenCalled();
      expect(ackDb).not.toHaveBeenCalled();
      expect(ackKeys).not.toHaveBeenCalled();
      expect(query.mock.calls.some(([sql]) =>
        typeof sql === 'string'
        && (
          sql.includes('internal_release_official_reader_paid_answer_purge_v1')
          || sql.includes('internal_finish_official_reader_paid_answer_purge_v1')
          || sql.includes('internal_finish_empty_official_reader_paid_answer_purge_v1')
        ),
      )).toBe(false);
    });

  it.each([
    ['duplicate body', { bodyIds: [B1, B1] }],
    ['duplicate DEK', { keyRefs: [K1, K1] }],
    ['non-UUID body', { bodyIds: [B1, 'browser-forged-body'] }],
    ['non-Reader key', { keyRefs: [K1, 'different-product-key'] }],
    ['null body', { bodyIds: [B1, null] }],
    ['wrong key array count', { keyRefs: [K1] }],
    ['empty key array', { keyRefs: [] }],
    ['noncanonical uppercase DEK reference', {
      keyRefs:['reader-dek-v1:ABCDEF12-3456-4789-8abc-def012345678',K2],
    }],
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
