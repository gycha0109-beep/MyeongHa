import { describe, expect, it, vi } from 'vitest';
import {
  runPrivateCancelBoundedWindowV1,
  classifyPrivateCancelHealthAlertsV1,
  validatePrivateCancelHealthV1,
  type PrivateCancelHealthSnapshotV1,
} from '../apps/api/src/official-reader-portone-cancel-private-ops-window-v1.js';
import type { PrivateCancelWorkTickResultV1 } from '../apps/api/src/official-reader-portone-cancel-durable-worker-private-v1.js';
import { createPrivateCancelQueueHealthTestV1 } from './support/private-official-reader-cancel-ops-health-v1.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

const health: PrivateCancelHealthSnapshotV1 = Object.freeze({
  queuedDue: 2,retryDue: 1,leasedActive: 1,leasedExpired: 0,
  held: 0,deadLetter: 0,completed: 4,oldestUnresolvedAgeSeconds: 58,
  effectAuthorized: false,
});
const done: PrivateCancelWorkTickResultV1 = {
  kind: 'completed',attemptCount: 1,failureCode: null,nextAttemptAt: null,
  effectAuthorized: false,providerRefundAuthorized: false,
  entitlementMutationAuthorized: false,
};
const holding: PrivateCancelWorkTickResultV1 = {
  kind: 'held',attemptCount: 1,failureCode:'SOURCE_MISMATCH',nextAttemptAt:null,
  effectAuthorized:false,providerRefundAuthorized:false,
  entitlementMutationAuthorized:false,
};
const dead: PrivateCancelWorkTickResultV1 = {
  kind:'dead_letter',attemptCount:8,failureCode:'LOOKUP_TIMEOUT',nextAttemptAt:null,
  effectAuthorized:false,providerRefundAuthorized:false,
  entitlementMutationAuthorized:false,
};
const retried: PrivateCancelWorkTickResultV1 = {
  kind:'retry_wait',attemptCount:2,failureCode:'LOOKUP_TIMEOUT',
  nextAttemptAt:'2026-10-14T00:01:00.000Z',
  effectAuthorized:false,providerRefundAuthorized:false,
  entitlementMutationAuthorized:false,
};
const idle: PrivateCancelWorkTickResultV1 = {kind:'idle',effectAuthorized:false};

describe('D3e6 private cancel queue monitoring and bounded window',()=>{
  it('stops on idle without an infinite loop; never returns identifiers or rights authority',async()=>{
    const tick=vi.fn()
      .mockResolvedValueOnce(done).mockResolvedValueOnce(retried)
      .mockResolvedValueOnce(holding).mockResolvedValueOnce(dead)
      .mockResolvedValue(idle);
    const result=await runPrivateCancelBoundedWindowV1({
      health:{snapshot:async()=>health},tick,maxTicks:20,staleThresholdSeconds:60,
    });
    expect(result.attempts).toBe(4);
    expect(result.outcomes).toEqual({
      completed:1,held:1,retryWait:1,deadLetter:1,
    });
    expect(tick).toHaveBeenCalledTimes(5);
    expect(result.before).toMatchObject(health);
    expect(result.after).toMatchObject(health);
    expect(result.alerts).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('webhook');
    expect(result).toMatchObject({
      providerRefundAuthorized:false,entitlementMutationAuthorized:false,
    });
  });

  it('cannot process more than explicitly authorized maxTicks',async()=>{
    const tick=vi.fn(async()=>done);
    const result=await runPrivateCancelBoundedWindowV1({
      health:{snapshot:async()=>health},tick,maxTicks:3,staleThresholdSeconds:60,
    });
    expect(result.attempts).toBe(3);
    expect(tick).toHaveBeenCalledTimes(3);
  });

  it('surfaces only typed aggregate alert categories',()=>{
    const sample:PrivateCancelHealthSnapshotV1={
      ...health,held:2,deadLetter:1,leasedExpired:1,oldestUnresolvedAgeSeconds:3600,
    };
    expect(classifyPrivateCancelHealthAlertsV1(sample,3600)).toEqual([
      'HELD_REVIEW_REQUIRED','DEAD_LETTER_REVIEW_REQUIRED',
      'EXPIRED_LEASES_PRESENT','UNRESOLVED_AGE_EXCEEDED',
    ]);
    const data=validatePrivateCancelHealthV1({
      ...sample,webhookId:'secret-webhook-id',paymentId:'secret-payment-id',
    });
    expect(JSON.stringify(data)).not.toContain('secret');
    expect(Object.keys(data)).toHaveLength(9);
  });

  it('rejects malformed aggregate snapshots instead of leaking row payloads',()=>{
    for(const bad of [
      null,[],{...health,held:-1},
      {...health,deadLetter:'3'},
      {...health,completed:Number.MAX_SAFE_INTEGER+10},
      {...health,effectAuthorized:true},
    ]){
      expect(()=>validatePrivateCancelHealthV1(bad)).toThrow();
    }
  });

  it('blocks effects, invalid ticks and missing/unsafe execution config',async()=>{
    const unsafeEffect={...done,entitlementMutationAuthorized:true} as never;
    await expect(runPrivateCancelBoundedWindowV1({
      health:{snapshot:async()=>health},tick:async()=>unsafeEffect,
      maxTicks:1,staleThresholdSeconds:60,
    })).rejects.toThrow('effect');
    await expect(runPrivateCancelBoundedWindowV1({
      health:{snapshot:async()=>health},tick:async()=>({kind:'bogus',effectAuthorized:false}) as never,
      maxTicks:1,staleThresholdSeconds:60,
    })).rejects.toThrow('unknown');
    await expect(runPrivateCancelBoundedWindowV1({
      health:{snapshot:async()=>health},tick:async()=>done,
      maxTicks:21,staleThresholdSeconds:60,
    })).rejects.toThrow('config');
  });

  it('propagates DB or provider exceptions; no fabricated success',async()=>{
    await expect(runPrivateCancelBoundedWindowV1({
      health:{snapshot:async()=>health},
      tick:async()=>{throw new Error('synthetic local test failure');},
      maxTicks:1,staleThresholdSeconds:60,
    })).rejects.toThrow('synthetic local test failure');
  });

  it('uses owner-only aggregate query with validated bigint conversion',async()=>{
    const query=vi.fn(async(_text:string)=>({rows:[{
      queuedDue:'2',retryDue:'1',leasedActive:'1',leasedExpired:'0',
      held:'0',deadLetter:'0',completed:'4',oldestUnresolvedAgeSeconds:'58',
      effectAuthorized:false,
    }]}));
    const pool={
      connect:async()=>({query,release:()=>undefined}),
    } as unknown as PostgresSubjectPoolV1;
    const adapter=createPrivateCancelQueueHealthTestV1(pool);
    expect(await adapter.snapshot()).toEqual(health);
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain('internal_private_cancel_queue_health_v1');
    expect(query.mock.calls[0]?.[0]).not.toMatch(/select\s+\*/iu);
  });
});
