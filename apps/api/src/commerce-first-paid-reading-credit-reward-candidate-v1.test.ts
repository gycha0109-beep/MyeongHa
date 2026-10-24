import {describe,expect,it} from 'vitest';
import {
  fulfillFirstPaidReadingCreditRewardCandidateV1,
} from './commerce-first-paid-reading-credit-reward-candidate-v1.js';
import type {PostgresTransactionQueryV1} from './postgres-subject-execution.js';

const subject='11111111-1111-4111-8111-111111111111';
const receipt='22222222-2222-4222-8222-222222222222';
const offer='33333333-3333-4333-8333-333333333333';
const lot='44444444-4444-4444-8444-444444444444';
function db(row:Record<string,unknown>) {
  const calls: {sql:string,args:readonly unknown[]|undefined}[]=[];
  const client:PostgresTransactionQueryV1={
    async query<Row>(sql:string,args?:readonly unknown[]) {
      calls.push({sql,args});
      return {rows:[row] as unknown as readonly Row[]};
    },
  };
  return {client,calls};
}
describe('first paid Reading reward private SQL adapter',()=>{
  const base={canonicalSubjectId:subject,verifiedReadingReceiptId:receipt};
  it('cannot award without approved Reading Offer',async()=>{
    const t=db({});
    expect(await fulfillFirstPaidReadingCreditRewardCandidateV1({
      ...base,client:t.client,approvedEligibleReadingOfferId:null,
    })).toEqual({kind:'not_activated'});
    expect(t.calls).toHaveLength(0);
  });
  it('awards exactly 150 for an admitted paid Reading Receipt',async()=>{
    const t=db({lotId:lot,outcome:'issued',availableCredits:'150',totalCredits:'150'});
    expect(await fulfillFirstPaidReadingCreditRewardCandidateV1({
      ...base,client:t.client,approvedEligibleReadingOfferId:offer,
    })).toEqual({kind:'issued',lotId:lot,creditQuantity:150,
      availableCredits:150,totalCredits:150});
    expect(t.calls[0]?.args).toEqual([subject,receipt,offer]);
    expect(t.calls[0]?.sql).toContain('internal_cmd_chat_first_paid_reading_reward_v1');
  });
  it('returns awarded source instead of minting another for subsequent purchases',async()=>{
    const t=db({lotId:lot,outcome:'already_awarded',availableCredits:'110',totalCredits:'110'});
    expect((await fulfillFirstPaidReadingCreditRewardCandidateV1({
      ...base,client:t.client,approvedEligibleReadingOfferId:offer,
    })).kind).toBe('already_awarded');
  });
  it('rejects invalid authoritative DB responses',async()=>{
    const t=db({lotId:lot,outcome:'issued',availableCredits:'151',totalCredits:'150'});
    await expect(fulfillFirstPaidReadingCreditRewardCandidateV1({
      ...base,client:t.client,approvedEligibleReadingOfferId:offer,
    })).rejects.toThrow('exceeds total');
  });
});
