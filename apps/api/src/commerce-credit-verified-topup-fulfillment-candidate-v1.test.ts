import { describe, expect, it } from 'vitest';
import { fulfillVerifiedCreditTopUpCandidateV1 } from './commerce-credit-verified-topup-fulfillment-candidate-v1.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

const owner='11111111-1111-4111-8111-111111111111';
const receipt='22222222-2222-4222-8222-222222222222';
const offer='33333333-3333-4333-8333-333333333333';
const lot='44444444-4444-4444-8444-444444444444';

function db(eligible: boolean, issued = true) {
  const calls: Array<{sql:string;values:readonly unknown[]|undefined}> = [];
  const client: PostgresTransactionQueryV1 = {
    async query<Row>(sql:string,values?:readonly unknown[]) {
      calls.push({sql,values});
      const rows = calls.length===1
        ? eligible ? [{receiptId:receipt}] : []
        : [{lotId:lot,issued,availableCredits:'300',totalCredits:'300'}];
      return {rows:rows as unknown as readonly Row[]};
    },
  };
  return {client,calls};
}

describe('verified PortOne credit topup private fulfillment candidate',()=>{
  const args={canonicalSubjectId:owner,verifiedReceiptId:receipt,
    approvedCreditProductOfferId:offer} as const;

  it('never queries or mints when Offer or paid credit validity is unapproved',async()=>{
    const test=db(true);
    expect(await fulfillVerifiedCreditTopUpCandidateV1({
      ...args,client:test.client,approvedCreditProductOfferId:null,
      approvedPaidCreditValidity:{kind:'never'},
    })).toEqual({kind:'not_activated'});
    expect(await fulfillVerifiedCreditTopUpCandidateV1({
      ...args,client:test.client,approvedPaidCreditValidity:null,
    })).toEqual({kind:'not_activated'});
    expect(test.calls).toHaveLength(0);
  });

  it('mints only after verified receipt eligibility, and returns spendable balance',async()=>{
    const test=db(true);
    expect(await fulfillVerifiedCreditTopUpCandidateV1({
      ...args,client:test.client,approvedPaidCreditValidity:{kind:'never'},
    })).toEqual({kind:'issued',receiptId:receipt,lotId:lot,
      creditQuantity:300,availableCredits:300,totalCredits:300});
    expect(test.calls).toHaveLength(2);
    expect(test.calls[0]?.values).toEqual([receipt,owner,offer]);
    expect(test.calls[1]?.values).toEqual([owner,receipt,offer,'never',null]);
    expect(test.calls[1]?.sql).toContain('internal_cmd_chat_credit_verified_topup_v1');
  });

  it('repeated verified Receipt returns replay instead of another credit allocation',async()=>{
    const test=db(true,false);
    expect(await fulfillVerifiedCreditTopUpCandidateV1({
      ...args,client:test.client,approvedPaidCreditValidity:{kind:'days',days:120},
    })).toEqual({kind:'replayed',receiptId:receipt,lotId:lot,
      creditQuantity:300,availableCredits:300,totalCredits:300});
    expect(test.calls[1]?.values).toEqual([owner,receipt,offer,'days',120]);
  });

  it('refuses failed/wrong-owner receipt without issuing credits',async()=>{
    const test=db(false);
    expect(await fulfillVerifiedCreditTopUpCandidateV1({
      ...args,client:test.client,approvedPaidCreditValidity:{kind:'never'},
    })).toEqual({kind:'denied'});
    expect(test.calls).toHaveLength(1);
  });

  it('rejects invented validity duration before querying',async()=>{
    const test=db(true);
    await expect(fulfillVerifiedCreditTopUpCandidateV1({
      ...args,client:test.client,approvedPaidCreditValidity:{kind:'days',days:0},
    })).rejects.toThrow('validity');
    expect(test.calls).toHaveLength(0);
  });

  it('fails closed on malformed issuance rows',async()=>{
    const calls: Array<readonly unknown[]|undefined>=[];
    const client: PostgresTransactionQueryV1={
      async query<Row>(_sql:string,values?:readonly unknown[]) {
        calls.push(values);
        const rows=calls.length===1 ? [{receiptId:receipt}]
          : [{lotId:lot,issued:'true',availableCredits:'300',totalCredits:'300'}];
        return {rows:rows as unknown as readonly Row[]};
      },
    };
    await expect(fulfillVerifiedCreditTopUpCandidateV1({
      ...args,client,approvedPaidCreditValidity:{kind:'never'},
    })).rejects.toThrow('invalid authoritative row');
  });
});
