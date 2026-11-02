// Watchtower-Track: security
import {beforeEach,describe,expect,it,vi} from 'vitest';

const state=vi.hoisted(()=>({
  query:vi.fn(),
  transaction:vi.fn(async({execute}:{execute:(scope:unknown)=>Promise<unknown>})=>
    execute({client:{query:state.query}})),
}));
vi.mock('./postgres-commerce-internal-execution.js',()=>({
  executePostgresCommerceInternalTransactionV1:state.transaction,
}));
import {
  recoverSeyeonG5ReceivedCreditsCandidateV1,
  SEYEON_G5_RECEIVED_CREDIT_RECOVERY_CANDIDATE_V1,
} from './seyeon-g5-received-credit-recovery-candidate-v1.js';

const a='cb180000-0000-4000-8000-000000000001';
const b='cd180000-0000-4000-8000-000000000001';
const pool={connect:async()=>{throw Error('mock must own transaction');}};
const query=(rows:unknown[])=>state.query.mockImplementation(async(sql:string)=>{
  if(sql.includes('internal_qry_seyeon_g5_unsettled_received_attempts_v1'))
    return {rows};
  return {rows:[{state:'settled'}]};
});
beforeEach(()=>{
  state.query.mockReset();state.transaction.mockClear();
  query([{attemptId:a}]);
});
describe('G5 received-only bounded Commerce recovery candidate',()=>{
  it('keeps production and automatic scheduling disabled',()=>{
    expect(SEYEON_G5_RECEIVED_CREDIT_RECOVERY_CANDIDATE_V1).toMatchObject({
      productionMounted:false,scheduled:false,minimumReceiptAgeMinutes:5,
    });
  });
  it('selects and settles using only the private Commerce transaction',async()=>{
    expect(await recoverSeyeonG5ReceivedCreditsCandidateV1({
      privateCreditPool:pool as never,mode:'apply',maxBatch:1,
    })).toEqual({status:'completed',found:1,settled:1,failed:0});
    expect(state.transaction).toHaveBeenCalledTimes(2);
    expect(state.transaction).toHaveBeenCalledWith(expect.objectContaining({pool}));
    expect(state.query).toHaveBeenCalledWith(
      expect.stringContaining('internal_qry_seyeon_g5_unsettled_received_attempts_v1'),
      [1,null],
    );
    expect(state.query).toHaveBeenCalledWith(
      'select public.internal_cmd_seyeon_g4_receipt_credit_settle_v1($1::uuid) as "state"',
      [a],
    );
  });
  it('previews received-only recovery counts without settling or exposing original identities',async()=>{
    const before=await recoverSeyeonG5ReceivedCreditsCandidateV1({
      privateCreditPool:pool as never,mode:'preview',maxBatch:1,
    });
    expect(before).toEqual({status:'preview',found:1,settled:0,failed:0});
    expect(Object.keys(before).sort()).toEqual(['failed','found','settled','status']);
    expect(state.transaction).toHaveBeenCalledTimes(1);
    expect(state.query).toHaveBeenCalledTimes(1);
    expect(state.query.mock.calls[0]?.[0]).toContain('internal_qry_seyeon_g5_');
  });
  it('rejects omitted or unknown run mode before touching Commerce DB',async()=>{
    for(const mode of [undefined,null,'auto','execute','dry-run']){
      await expect(recoverSeyeonG5ReceivedCreditsCandidateV1({
        privateCreditPool:pool as never,mode:mode as never,
      })).rejects.toThrow('explicit preview or apply');
    }
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it('returns empty and performs zero settlement for no original received candidates',async()=>{
    query([]);
    expect(await recoverSeyeonG5ReceivedCreditsCandidateV1({
      privateCreditPool:pool as never,mode:'apply',
    })).toEqual({status:'empty',found:0,settled:0,failed:0});
    expect(state.transaction).toHaveBeenCalledTimes(1);
  });
  it('rejects missing credentials and unbounded requests before opening DB',async()=>{
    for(const maxBatch of [0,-1,26,2.5,NaN,Infinity]){
      await expect(recoverSeyeonG5ReceivedCreditsCandidateV1({
        privateCreditPool:pool as never,mode:'apply',maxBatch,
      })).rejects.toThrow();
    }
    await expect(recoverSeyeonG5ReceivedCreditsCandidateV1({
      privateCreditPool:undefined as never,mode:'apply',
    })).rejects.toThrow();
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it('fails closed if the private DB catalog returns forged or duplicate Attempts',async()=>{
    for(const rows of [[{attemptId:'not-a-uuid'}],
      [{attemptId:a},{attemptId:a}],
      [{attemptId:a},{attemptId:b}]]){
      query(rows);
      await expect(recoverSeyeonG5ReceivedCreditsCandidateV1({
        privateCreditPool:pool as never,mode:'apply',maxBatch:1,
      })).rejects.toThrow();
    }
    expect(state.query.mock.calls.every(c=>
      String(c[0]).includes('internal_qry_seyeon_g5_unsettled_received_attempts_v1'),
    )).toBe(true);
  });
  it('continues independently after a failed settlement and reports partial recovery',async()=>{
    let attempts=0;
    state.query.mockImplementation(async(sql:string)=>{
      if(sql.includes('internal_qry_'))return {rows:[{attemptId:a},{attemptId:b}]};
      attempts++;
      if(attempts===1)throw Error('private ledger temporarily unavailable');
      return {rows:[{state:'settled'}]};
    });
    expect(await recoverSeyeonG5ReceivedCreditsCandidateV1({
      privateCreditPool:pool as never,mode:'apply',maxBatch:2,
    })).toEqual({status:'partial',found:2,settled:1,failed:1});
    expect(state.transaction).toHaveBeenCalledTimes(3);
  });
});
