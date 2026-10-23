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

type CrashPoint = 'db-commit' | 'db-ack' | 'destroy-key' | 'key-ack' | 'finish-commit';
function fixture(options: {
  failFirstKeyDestroy?: boolean;
  siblingRight?: boolean;
  crashAt?: CrashPoint;
  loseLeaseOnce?: boolean;
  invalidRecoveredKey?: boolean;
  regressManifestAfterErase?: boolean;
  loseLeaseBeforeLedger?: boolean;
  sqlFailureAt?: 'list' | 'delivery-schema' | 'delivery-prune';
} = {}) {
  const events: string[]=[];
  let dbErased=false;
  let finished=false;
  let keyDestroyed=false;
  let initialKeyFailure=options.failFirstKeyDestroy === true;
  let transactionOpen=false;
  let crashAt=options.crashAt;
  let loseLeaseOnce=options.loseLeaseOnce === true;
  let loseLeaseBeforeLedger=options.loseLeaseBeforeLedger === true;
  let pendingCommit: 'db-commit' | 'finish-commit' | undefined;
  function interrupt(point: CrashPoint) {
    if(crashAt===point) {
      crashAt=undefined;
      throw new Error('synthetic interrupted port response');
    }
  }
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
        if(sql==='COMMIT' || sql==='ROLLBACK') {
          transactionOpen=false;
          if(sql==='COMMIT' && pendingCommit!==undefined) {
            const point=pendingCommit;
            pendingCommit=undefined;
            interrupt(point);
          }
          return {rows:[]};
        }
        if(sql.startsWith('SET LOCAL ROLE ')) return {rows:[]};
        const result=(rows: unknown[])=>({rows:rows as T[]});
        if(sql.includes('internal_list_official_reader_paid_answer_purge_jobs_v1')) {
          events.push('list');
          if(options.sqlFailureAt==='list') {
            throw new Error('synthetic SQL failed: subject=' + SUBJECT + ', key=' + KEY);
          }
          return result(finished ? [] : [{jobId:JOB}]);
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
          } : dbErased && options.regressManifestAfterErase === true ? {
            state:'eligible',subjectId:SUBJECT,readingId:READING,
            readerCharacterId:READER,
            entries:[{bodyId:BODY,encryptionKeyRef:KEY}],
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
          events.push('db-delete'); dbErased=true;
          if(crashAt==='db-commit') pendingCommit='db-commit';
          return result([{deletedCount:'1'}]);
        }
        if(sql.includes('internal_renew_official_reader_paid_answer_purge_lease_v1')) {
          events.push('lease');
          if(loseLeaseBeforeLedger) {
            loseLeaseBeforeLedger=false;
            return result([{renewed:false}]);
          }
          if(loseLeaseOnce && dbErased) {
            loseLeaseOnce=false;
            return result([{renewed:false}]);
          }
          return result([{renewed:true}]);
        }
        if(sql.includes('internal_finish_official_reader_paid_answer_purge_v1')) {
          if(!dbErased || !keyDestroyed) throw Error('premature completion');
          events.push('finish'); finished=true;
          if(crashAt==='finish-commit') pendingCommit='finish-commit';
          return result([{done:true}]);
        }
        if(sql.includes('internal_release_official_reader_paid_answer_purge_v1')) {
          events.push('sibling-release'); return result([{released:true}]);
        }
        if(sql.includes('internal_prune_official_reader_paid_delivery_v1(integer)')) {
          if(options.sqlFailureAt==='delivery-schema') {
            throw new Error('synthetic SQL schema failed: receipt=' + SUBJECT + ', key=' + KEY);
          }
          return result([{installed:options.sqlFailureAt==='delivery-prune'}]);
        }
        if(sql.includes('internal_prune_official_reader_paid_delivery_v1(')) {
          if(options.sqlFailureAt==='delivery-prune') {
            throw new Error('synthetic SQL pruning failed: receipt=' + SUBJECT + ', key=' + KEY);
          }
          return result([{deletedCount:'0'}]);
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
    interrupt('destroy-key');
  });
  const scopeLedger = {
    recordScopeDeletionFence: vi.fn(async () => {
      events.push('durable-tombstone'); return fence;
    }),
    readScopeDeletionFence: vi.fn(async () => {
      events.push('resume-tombstone');
      return options.invalidRecoveredKey
        ? {...fence,keyRefs:['reader-dek-v1:invalid']} : fence;
    }),
    acknowledgeScopeDatabaseErasure: vi.fn(async () => {
      if(!dbErased) throw Error('db ACK before deletion');
      events.push('ack-db');
      interrupt('db-ack');
    }),
    acknowledgeScopeKeyErasure: vi.fn(async () => {
      if(!keyDestroyed) throw Error('key ACK before destruction');
      events.push('ack-key');
      interrupt('key-ack');
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

  for (const point of ['db-commit', 'db-ack', 'destroy-key', 'key-ack'] as const) {
    it(`recovers from ${point} lost response without repeating physical DB deletion`, async () => {
      const x=fixture({crashAt:point});
      await expect(x.run('synthetic-worker-1')).rejects.toThrow(
        'Protected Reader revocation cleanup is unavailable.',
      );
      expect(x.current()).toMatchObject({dbErased:true,finished:false});
      const resumed=await x.run('synthetic-worker-2');
      expect(resumed).toMatchObject({
        completed:1,failed:0,rowsDeleted:0,publicPaidReadEnabled:false,
      });
      expect(x.events.filter(event=>event==='db-delete')).toHaveLength(1);
      expect(x.events.filter(event=>event==='finish')).toHaveLength(1);
      expect(x.scopeLedger.recordScopeDeletionFence).toHaveBeenCalledTimes(1);
      expect(x.current()).toEqual({dbErased:true,keyDestroyed:true,finished:true});
      if(point==='destroy-key' || point==='key-ack') {
        expect(x.destroyKey).toHaveBeenCalledTimes(1);
      }
    });
  }

  it('treats a lost completion acknowledgement as finished, not a second purge', async () => {
    const x=fixture({crashAt:'finish-commit'});
    await expect(x.run('synthetic-worker-1')).rejects.toThrow(
      'Protected Reader revocation cleanup is unavailable.',
    );
    expect(x.current()).toEqual({dbErased:true,keyDestroyed:true,finished:true});
    const replay=await x.run('synthetic-worker-2');
    expect(replay).toMatchObject({discovered:0,completed:0,rowsDeleted:0});
    expect(x.events.filter(e=>e==='db-delete')).toHaveLength(1);
    expect(x.events.filter(e=>e==='finish')).toHaveLength(1);
    expect(x.destroyKey).toHaveBeenCalledTimes(1);
  });

  it('halts when a lease is lost after DB erasure and recovers under a new owner', async () => {
    const x=fixture({loseLeaseOnce:true});
    await expect(x.run('stale-owner')).rejects.toThrow(
      'Protected Reader revocation cleanup is unavailable.',
    );
    expect(x.current()).toEqual({dbErased:true,keyDestroyed:false,finished:false});
    expect(x.destroyKey).not.toHaveBeenCalled();
    expect(x.events).not.toContain('ack-db');
    await expect(x.run('new-owner')).resolves.toMatchObject({
      completed:1,rowsDeleted:0,keysDestroyed:1,
    });
    expect(x.events.filter(e=>e==='db-delete')).toHaveLength(1);
  });

  it('rejects a mismatched DB-erased manifest instead of re-deleting protected bytes', async () => {
    const x=fixture({failFirstKeyDestroy:true,regressManifestAfterErase:true});
    await expect(x.run('synthetic-worker-1')).rejects.toThrow(
      'Protected Reader revocation cleanup is unavailable.',
    );
    await expect(x.run('synthetic-worker-2')).rejects.toThrow(
      'Protected Reader revocation cleanup is unavailable.',
    );
    expect(x.events.filter(e=>e==='db-delete')).toHaveLength(1);
    expect(x.events.filter(e=>e==='finish')).toHaveLength(0);
  });

  it('rejects invalid off-primary recovered DEK references before any retry ACK', async () => {
    const x=fixture({failFirstKeyDestroy:true,invalidRecoveredKey:true});
    await expect(x.run('synthetic-worker-1')).rejects.toThrow(
      'Protected Reader revocation cleanup is unavailable.',
    );
    const before=x.events.filter(e=>e==='ack-db').length;
    await expect(x.run('synthetic-worker-2')).rejects.toThrow(
      'Protected Reader revocation cleanup is unavailable.',
    );
    expect(x.events.filter(e=>e==='ack-db')).toHaveLength(before);
    expect(x.destroyKey).toHaveBeenCalledTimes(1);
    expect(x.current()).toEqual({dbErased:true,keyDestroyed:false,finished:false});
  });

  it('does not publish an independent deletion tombstone after losing ownership', async () => {
    const x=fixture({loseLeaseBeforeLedger:true});
    await expect(x.run('stale-worker')).rejects.toThrow(
      'Protected Reader revocation cleanup is unavailable.',
    );
    expect(x.scopeLedger.recordScopeDeletionFence).not.toHaveBeenCalled();
    expect(x.events).not.toContain('db-delete');
    expect(x.destroyKey).not.toHaveBeenCalled();
    await expect(x.run('reclaimed-worker')).resolves.toMatchObject({
      completed:1,rowsDeleted:1,keysDestroyed:1,
    });
  });

  for (const point of ['list','delivery-schema','delivery-prune'] as const) {
    it(`redacts raw ${point} DB failures from exported Worker errors`, async () => {
      const x=fixture({sqlFailureAt:point});
      const outcome=await x.run('synthetic-worker').catch(error=>error);
      expect(outcome).toBeInstanceOf(Error);
      expect(outcome.message).toBe(
        'Protected Reader revocation cleanup is unavailable.',
      );
      expect(String(outcome)).not.toContain(SUBJECT);
      expect(String(outcome)).not.toContain(KEY);
      expect(String(outcome)).not.toContain('receipt=');
    });
  }

});
