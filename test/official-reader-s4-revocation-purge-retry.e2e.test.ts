import { describe, expect, it, vi } from 'vitest';
import {
  runOfficialReaderPrivateRevocationPurgeBatchV1,
} from '../apps/api/src/official-reader-private-revocation-purge-worker-v1.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import type {
  OfficialReaderOffPrimaryStoreV1,
  OfficialReaderScopeDeletionFenceV1,
} from '../apps/api/src/official-reader-node-offprimary-privacy-store-v1.js';

// Disposable SQL-port + immutable ledger simulator only. The production S4
// Worker itself runs; no DB, production provider, filesystem or real DEK.
const JOB='a1111111-1111-4111-8111-111111111111';
const SUBJECT='b2222222-2222-4222-8222-222222222222';
const READING='c3333333-3333-4333-8333-333333333333';
const BODY='d4444444-4444-4444-8444-444444444444';
const FENCE='e5555555-5555-4555-8555-555555555555';
const KEY='reader-dek-v1:f6666666-6666-4666-8666-666666666666';
const READER='test-reader';

function fixture(options: { failFirstKeyDestroy?: boolean; siblingRight?: boolean } = {}) {
  const events: string[]=[];
  let dbErased=false;
  let finished=false;
  let keyDestroyed=false;
  let initialKeyFailure=options.failFirstKeyDestroy === true;
  let transactionOpen=false;
  const fence: OfficialReaderScopeDeletionFenceV1 = Object.freeze({
    version:'official-reader-scope-deletion-fence-v1',
    fenceId:FENCE, jobId:JOB, subjectId:SUBJECT,
    officialReadingId:READING, readerCharacterId:READER,
    bodyIds:[BODY], keyRefs:[KEY],
  });
  const pool: PostgresSubjectPoolV1 = {
    connect: async () => ({
      query: async <T = Record<string, unknown>>(sql: string): Promise<{ rows: T[] }> => {
        if(sql==='BEGIN') { if(transactionOpen) throw Error('nested transaction'); transactionOpen=true; return {rows:[]}; }
        if(sql==='COMMIT' || sql==='ROLLBACK') { transactionOpen=false; return {rows:[]}; }
        if(sql.startsWith('SET LOCAL ROLE ')) return {rows:[]};
        const result=(rows: unknown[])=>({rows:rows as T[]});
        if(sql.includes('internal_list_official_reader_paid_answer_purge_jobs_v1')) {
          events.push('list'); return result([{jobId:JOB}]);
        }
        if(sql.includes('internal_claim_official_reader_paid_answer_purge_v1')) {
          events.push('claim');
          return result([{subjectId:SUBJECT,readingId:READING,
            readerCharacterId:READER,jobStatus:dbErased?'db_erased':'claimed'}]);
        }
        if(sql.includes('internal_qry_official_reader_paid_answer_purge_manifest_v1')) {
          events.push('manifest');
          return result([{result:options.siblingRight ? {
            state:'sibling_right_present',subjectId:SUBJECT,
            readingId:READING,readerCharacterId:READER,
          } : dbErased ? {
            state:'db_erased',subjectId:SUBJECT,readingId:READING,
            readerCharacterId:READER,externalFenceId:FENCE,
          } : {
            state:'eligible',subjectId:SUBJECT,readingId:READING,
            readerCharacterId:READER,
            entries:[{bodyId:BODY,encryptionKeyRef:KEY}],
          }}]);
        }
        if(sql.includes('internal_commit_official_reader_paid_answer_purge_v1')) {
          events.push('db-delete'); dbErased=true; return result([{deletedCount:'1'}]);
        }
        if(sql.includes('internal_renew_official_reader_paid_answer_purge_lease_v1')) {
          events.push('lease'); return result([{renewed:true}]);
        }
        if(sql.includes('internal_finish_official_reader_paid_answer_purge_v1')) {
          if(!dbErased || !keyDestroyed) throw Error('premature completion');
          events.push('finish'); finished=true; return result([{done:true}]);
        }
        if(sql.includes('internal_release_official_reader_paid_answer_purge_v1')) {
          events.push('sibling-release'); return result([{released:true}]);
        }
        if(sql.includes('internal_prune_official_reader_paid_delivery_v1(integer)')) {
          return result([{installed:false}]);
        }
        throw Error('unexpected SQL binding');
      },
      release: () => {
        if(transactionOpen) throw Error('transaction leaked');
      },
    }),
  } as PostgresSubjectPoolV1;
  const destroyKey=vi.fn(async (ref:string) => {
    expect(ref).toBe(KEY);
    events.push('destroy-key');
    if(initialKeyFailure) {
      initialKeyFailure=false;
      throw Error('synthetic key mount interruption');
    }
    keyDestroyed=true;
  });
  const scopeLedger = {
    recordScopeDeletionFence: vi.fn(async () => {
      events.push('durable-tombstone'); return fence;
    }),
    readScopeDeletionFence: vi.fn(async () => {
      events.push('resume-tombstone'); return fence;
    }),
    acknowledgeScopeDatabaseErasure: vi.fn(async () => {
      if(!dbErased) throw Error('db ACK before deletion');
      events.push('ack-db');
    }),
    acknowledgeScopeKeyErasure: vi.fn(async () => {
      if(!keyDestroyed) throw Error('key ACK before destruction');
      events.push('ack-key');
    }),
  };
  const store = {
    scopeLedger, keys: {
      isKeyDestroyed: vi.fn(async () => keyDestroyed), destroyKey,
    },
  } as unknown as OfficialReaderOffPrimaryStoreV1;
  const run = (workerId:string) => runOfficialReaderPrivateRevocationPurgeBatchV1({
    pool,store,workerId,limit:1,
  });
  return {run, events, destroyKey, scopeLedger,
    current:()=>({dbErased,finished,keyDestroyed})};
}

describe('Privacy #2318 official Reader protected purge Worker retry seam', () => {
  it('requires irreversible DB deletion before key destruction and ACK completion', async () => {
    const x=fixture();
    const report=await x.run('synthetic-worker-1');
    expect(report).toMatchObject({
      discovered:1,completed:1,failed:0,rowsDeleted:1,
      keysDestroyed:1,publicPaidReadEnabled:false,
    });
    const at=(s:string)=>x.events.indexOf(s);
    expect(at('durable-tombstone')).toBeLessThan(at('db-delete'));
    expect(at('db-delete')).toBeLessThan(at('ack-db'));
    expect(at('ack-db')).toBeLessThan(at('destroy-key'));
    expect(at('destroy-key')).toBeLessThan(at('ack-key'));
    expect(at('ack-key')).toBeLessThan(at('finish'));
    expect(x.current()).toEqual({dbErased:true,keyDestroyed:true,finished:true});
  });

  it('does not ACK key erasure after failure and resumes DB-erased lease without deleting twice', async () => {
    const x=fixture({failFirstKeyDestroy:true});
    await expect(x.run('synthetic-worker-1')).rejects.toThrow(
      'Protected Reader revocation cleanup is unavailable.',
    );
    expect(x.current()).toEqual({dbErased:true,keyDestroyed:false,finished:false});
    expect(x.events).not.toContain('ack-key');
    expect(x.events).not.toContain('finish');
    const second=await x.run('synthetic-worker-2');
    expect(second).toMatchObject({
      completed:1,failed:0,rowsDeleted:0,keysDestroyed:1,
      publicPaidReadEnabled:false,
    });
    expect(x.events.filter(e=>e==='db-delete')).toHaveLength(1);
    expect(x.events).toContain('resume-tombstone');
    expect(x.events.filter(e=>e==='finish')).toHaveLength(1);
    expect(x.destroyKey).toHaveBeenCalledTimes(2);
    expect(x.current()).toEqual({dbErased:true,keyDestroyed:true,finished:true});
  });

  it('never destroys an independently purchased sibling scope', async () => {
    const x=fixture({siblingRight:true});
    const report=await x.run('synthetic-worker-3');
    expect(report).toMatchObject({
      completed:0,deferredForSiblingRight:1,keysDestroyed:0,rowsDeleted:0,
      publicPaidReadEnabled:false,
    });
    expect(x.events).toContain('sibling-release');
    expect(x.events).not.toContain('db-delete');
    expect(x.destroyKey).not.toHaveBeenCalled();
    expect(x.current()).toEqual({dbErased:false,keyDestroyed:false,finished:false});
  });
});
