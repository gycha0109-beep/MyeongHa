import { describe, expect, it, vi } from 'vitest';
import {
  deliverOnePrivateCancelAlertV1,
  type PrivateCancelAlertOutboxPortV1,
  type PrivateCancelAlertTransportV1,
} from '../apps/api/src/official-reader-portone-cancel-private-alert-delivery-v1.js';
import { createPrivateCancelAlertOutboxTestV1 } from './support/private-official-reader-cancel-alert-outbox-store-v1.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

const ID='00000000-0000-4000-8000-000000000001';
const TOKEN='00000000-0000-4000-8000-000000000002';
const CODE='HELD_REVIEW_REQUIRED';
function setup(options:{
  idle?:boolean;delivery?:'success'|'fail'|'throw'|'malformed';
  finalState?:'delivered'|'retry_wait'|'dead_letter';
  badClaim?:boolean;badEnqueue?:boolean;badFinalize?:boolean;
}={}){
  const calls:string[]=[];
  const claimed={
    alertId:ID,alertKind:CODE,deliveryToken:TOKEN,
    deliveryAttempt:1,effectAuthorized:false,
  };
  const outbox:PrivateCancelAlertOutboxPortV1={
    enqueueCurrentAlerts:async()=>{
      calls.push('enqueue');
      if(options.badEnqueue)return {enqueuedCount:6,effectAuthorized:false};
      return {enqueuedCount:1,effectAuthorized:false};
    },
    claimNext:async()=>{
      calls.push('claim');
      if(options.idle)return null;
      if(options.badClaim)return {...claimed,effectAuthorized:true};
      return claimed;
    },
    finalize:async(_id,_owner,_token,wasAcknowledged)=>{
      calls.push('finalize:'+wasAcknowledged);
      if(options.badFinalize)throw new Error('synthetic durable finalize failure');
      return {
        finalState:options.finalState??(wasAcknowledged?'delivered':'retry_wait'),
        effectAuthorized:false,
      };
    },
  };
  const transport:PrivateCancelAlertTransportV1={
    deliver:vi.fn(async ({idempotencyKey,alertId,alertCode})=>{
      calls.push('deliver');
      expect(idempotencyKey).toBe('myeongha-private-cancel-alert-v1:'+ID);
      expect(alertId).toBe(ID);
      expect(alertCode).toBe(CODE);
      if(options.delivery==='throw')throw new Error('provider token SHOULD NEVER PERSIST');
      if(options.delivery==='malformed')return {} as never;
      return {acknowledged:options.delivery!=='fail'};
    }),
  };
  const tick=()=>deliverOnePrivateCancelAlertV1({
    outbox,transport,workerId:'synthetic_owner',leaseSeconds:120,
  });
  return {tick,calls,transport};
}
describe('D3e7 private cancellation durable alert delivery',()=>{
  it('commits enqueue and claim before any external transport, then fences accepted acknowledgement',async()=>{
    const rig=setup();
    expect(await rig.tick()).toEqual({
      kind:'delivered',enqueued:1,alertCode:CODE,attempt:1,
      effectAuthorized:false,providerRefundAuthorized:false,
      entitlementMutationAuthorized:false,
    });
    expect(rig.calls).toEqual(['enqueue','claim','deliver','finalize:true']);
  });
  it('idle never invokes a transport or finalization',async()=>{
    const rig=setup({idle:true});
    expect(await rig.tick()).toEqual({kind:'idle',enqueued:1,effectAuthorized:false});
    expect(rig.calls).toEqual(['enqueue','claim']);
    expect(rig.transport.deliver).not.toHaveBeenCalled();
  });
  it('negative receipt, thrown error and malformed reply cannot be treated as delivery',async()=>{
    for (const delivery of ['fail','throw','malformed'] as const){
      const rig=setup({delivery});
      expect(await rig.tick()).toMatchObject({
        kind:'retry_wait',providerRefundAuthorized:false,entitlementMutationAuthorized:false,
      });
      expect(rig.calls).toEqual(['enqueue','claim','deliver','finalize:false']);
    }
  });
  it('fifth unsuccessful attempt can become durable dead letter',async()=>{
    const rig=setup({delivery:'fail',finalState:'dead_letter'});
    expect((await rig.tick()).kind).toBe('dead_letter');
  });
  it('rejects malformed SQL enqueue/claim before contacting a transport',async()=>{
    for (const bad of [{badEnqueue:true},{badClaim:true}]){
      const rig=setup(bad);
      await expect(rig.tick()).rejects.toThrow();
      expect(rig.transport.deliver).not.toHaveBeenCalled();
    }
  });
  it('never declares success when DB finalization does not COMMIT',async()=>{
    const rig=setup({badFinalize:true});
    await expect(rig.tick()).rejects.toThrow('synthetic durable finalize failure');
  });
  it('rejects DB false acknowledgements of successful provider delivery',async()=>{
    const rig=setup({finalState:'retry_wait'});
    await expect(rig.tick()).rejects.toThrow('invalid state');
  });
  it('requires explicit injected transport, safe worker ID and finite lease',async()=>{
    const rig=setup();
    await expect(deliverOnePrivateCancelAlertV1({
      outbox:{enqueueCurrentAlerts:async()=>null,claimNext:async()=>null,finalize:async()=>null},
      transport:null as never,workerId:'synthetic_owner',leaseSeconds:120,
    })).rejects.toThrow('configuration');
    expect(rig.transport.deliver).not.toHaveBeenCalled();
  });
  it('owner-only PostgreSQL adapter uses exact functions and no HTTP/side-effect APIs',async()=>{
    const queries:string[]=[];
    const connection={
      query:async (sql:string)=>{
        queries.push(sql);
        if(sql.includes('enqueue_alerts'))return {rows:[{enqueuedCount:1,effectAuthorized:false}]};
        if(sql.includes('claim_alert'))return {rows:[]};
        return {rows:[{finalState:'retry_wait',effectAuthorized:false}]};
      },
      release:()=>undefined,
    };
    const pool={connect:async()=>connection} as unknown as PostgresSubjectPoolV1;
    const outbox=createPrivateCancelAlertOutboxTestV1(pool);
    expect(await outbox.enqueueCurrentAlerts()).toMatchObject({enqueuedCount:1});
    expect(await outbox.claimNext('owner',120)).toBe(null);
    expect(await outbox.finalize(ID,'owner',TOKEN,false)).toMatchObject({finalState:'retry_wait'});
    expect(queries).toHaveLength(3);
    expect(queries.join(' ')).not.toMatch(/select\s+\*|entitlement_events|revoke.*grant/iu);
  });
});
