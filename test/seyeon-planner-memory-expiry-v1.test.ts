// Watchtower-Track: security
import { describe,expect,it,vi } from 'vitest';
import {
  expireSeyeonPendingPlannerMemoryBatchV1,
  SEYEON_PLANNER_PENDING_EXPIRY_V1,
} from '../apps/api/src/postgres-seyeon-planner-memory-pending-expiry-v1.js';

const CUTOFF='2026-10-01T00:00:00.000Z';
const PROPOSAL='11111111-1111-4111-8111-111111111111';
const SUBJECT='22222222-2222-4222-8222-222222222222';

describe('S0 UC-06 expired Planner candidate privacy cleanup',()=>{
  it('defaults DENY before touching any DB role, even with a valid cutoff',async()=>{
    const query=vi.fn();
    await expect(expireSeyeonPendingPlannerMemoryBatchV1({
      client:{query} as never,cutoffUtc:CUTOFF,maxRows:1,
    })).rejects.toMatchObject({code:'SEYEON_PLANNER_PENDING_EXPIRY_HOLD'});
    expect(query).not.toHaveBeenCalled();
    expect(SEYEON_PLANNER_PENDING_EXPIRY_V1.ordinaryApiExecuteGranted).toBe(false);
    expect(SEYEON_PLANNER_PENDING_EXPIRY_V1.productionMounted).toBe(false);
  });

  it('rejects bad, future and over-broad retention inputs before DB',async()=>{
    const query=vi.fn();
    for(const input of [
      {cutoffUtc:'invalid',maxRows:1},
      {cutoffUtc:'2999-01-01T00:00:00.000Z',maxRows:1},
      {cutoffUtc:CUTOFF,maxRows:0},
      {cutoffUtc:CUTOFF,maxRows:101},
      {cutoffUtc:CUTOFF,maxRows:1.5},
    ]){
      await expect(expireSeyeonPendingPlannerMemoryBatchV1({
        client:{query} as never,...input,
        approvedInternalRetentionPolicy:()=>true,
      })).rejects.toMatchObject({code:'SEYEON_PLANNER_PENDING_EXPIRY_HOLD'});
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('only trusted internal approval permits a bounded owner RPC',async()=>{
    const query=vi.fn(async(_sql:string,_params?:readonly unknown[])=>({
      rows:[{proposalId:PROPOSAL,subjectId:SUBJECT,payloadPurged:true}],
    }));
    const result=await expireSeyeonPendingPlannerMemoryBatchV1({
      client:{query} as never,
      cutoffUtc:CUTOFF,maxRows:7,
      approvedInternalRetentionPolicy:()=>true,
    });
    expect(result).toEqual([{proposalId:PROPOSAL,subjectId:SUBJECT,payloadPurged:true}]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0])
      .toContain('seyeon_private.cmd_expire_pending_planner_memory_batch_v1');
    expect(query.mock.calls[0]?.[1]).toEqual([CUTOFF,7]);
  });

  it('rejects malformed, duplicate or exceeding DB owner receipts',async()=>{
    const cases=[
      [{proposalId:PROPOSAL,subjectId:SUBJECT,payloadPurged:false}],
      [{proposalId:'not-id',subjectId:SUBJECT,payloadPurged:true}],
      [{proposalId:PROPOSAL,subjectId:SUBJECT,payloadPurged:true},
       {proposalId:PROPOSAL,subjectId:SUBJECT,payloadPurged:true}],
    ];
    for(const rows of cases){
      const query=vi.fn(async()=>({rows}));
      await expect(expireSeyeonPendingPlannerMemoryBatchV1({
        client:{query} as never,
        cutoffUtc:CUTOFF,maxRows:1,
        approvedInternalRetentionPolicy:async()=>true,
      })).rejects.toMatchObject({code:'SEYEON_PLANNER_PENDING_EXPIRY_HOLD'});
    }
  });
});
