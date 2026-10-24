import { describe, expect, it } from 'vitest';
import {
  CREDIT_TOPUP_RECEIPT_ELIGIBILITY_V1,
  evaluateVerifiedCreditTopUpReceiptV1,
} from './commerce-credit-verified-receipt-eligibility-v1.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

const subject='11111111-1111-4111-8111-111111111111';
const otherSubject='22222222-2222-4222-8222-222222222222';
const receipt='33333333-3333-4333-8333-333333333333';
const approvedOffer='44444444-4444-4444-8444-444444444444';

function fakeDb(rows: readonly {receiptId:unknown}[]=[]) {
  const calls:{sql:string,values:readonly unknown[]|undefined}[]=[];
  const client={
    async query<Row>(sql:string,values?:readonly unknown[]) {
      calls.push({sql,values});
      return {rows:rows as unknown as readonly Row[]};
    },
  } satisfies PostgresTransactionQueryV1;
  return {client,calls};
}

describe('Commerce Credit verified PortOne receipt payout eligibility (inert)',()=>{
  it('does not touch DB or authorize payout without a governance-admitted offer',async()=>{
    const db=fakeDb([{receiptId:receipt}]);
    expect(await evaluateVerifiedCreditTopUpReceiptV1({
      client:db.client,canonicalSubjectId:subject,
      verifiedReceiptId:receipt,approvedCreditProductOfferId:null,
    })).toEqual({kind:'not_activated'});
    expect(db.calls).toHaveLength(0);
    expect(CREDIT_TOPUP_RECEIPT_ELIGIBILITY_V1.livePayoutMounted).toBe(false);
    expect(CREDIT_TOPUP_RECEIPT_ELIGIBILITY_V1.creditQuantity).toBe(300);
  });

  it('selects only exact authenticated owner, approved SKU, verified KRW 1900 PortOne receipt',async()=>{
    const db=fakeDb([{receiptId:receipt}]);
    expect(await evaluateVerifiedCreditTopUpReceiptV1({
      client:db.client,canonicalSubjectId:subject,
      verifiedReceiptId:receipt,approvedCreditProductOfferId:approvedOffer,
    })).toEqual({kind:'eligible',receiptId:receipt,creditQuantity:300});
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]?.values).toEqual([receipt,subject,approvedOffer]);
    const sql=db.calls[0]?.sql||'';
    for (const required of [
      'cr.subject_id = $2::uuid', 'po.id = $3::uuid',
      "cr.provider = 'portone_v2'", "cr.platform = 'web'",
      "cr.verification_status = 'verified'",'cr.verified_at is not null',
      'cr.verified_amount_minor = 1900',"cr.verified_currency = 'KRW'",
      "pi.status = 'verified'",'pi.expected_amount_minor = 1900',
      "pi.expected_currency = 'KRW'",'po.enabled','po.retired_at is null',
      "p.product_key = 'chat_credits_300_v1'","p.product_type = 'credit'",
    ]) expect(sql).toContain(required);
    expect(sql).not.toContain(subject);
    expect(sql).not.toContain(receipt);
    expect(sql).not.toContain(approvedOffer);
  });

  it('denies absent/wrong Subject, revoked Receipt, wrong Offer, failed Intent and price mismatch',async()=>{
    const db=fakeDb([]);
    for(const verifiedSubjectId of [subject,otherSubject]){
      expect(await evaluateVerifiedCreditTopUpReceiptV1({
        client:db.client,canonicalSubjectId:verifiedSubjectId,
        verifiedReceiptId:receipt,approvedCreditProductOfferId:approvedOffer,
      })).toEqual({kind:'denied'});
    }
  });

  it('refuses malformed Subject, Receipt and server-controlled Offer without querying',async()=>{
    const db=fakeDb([]);
    await expect(evaluateVerifiedCreditTopUpReceiptV1({
      client:db.client,canonicalSubjectId:'',verifiedReceiptId:receipt,
      approvedCreditProductOfferId:approvedOffer,
    })).rejects.toThrow('Subject');
    await expect(evaluateVerifiedCreditTopUpReceiptV1({
      client:db.client,canonicalSubjectId:subject,verifiedReceiptId:'not-a-uuid',
      approvedCreditProductOfferId:null,
    })).rejects.toThrow('Receipt');
    await expect(evaluateVerifiedCreditTopUpReceiptV1({
      client:db.client,canonicalSubjectId:subject,verifiedReceiptId:receipt,
      approvedCreditProductOfferId:'malformed',
    })).rejects.toThrow('Product Offer');
    expect(db.calls).toHaveLength(0);
  });

  it('fails closed on ambiguous or mismatching DB authority rows',async()=>{
    const ambiguous=fakeDb([{receiptId:receipt},{receiptId:receipt}]);
    await expect(evaluateVerifiedCreditTopUpReceiptV1({
      client:ambiguous.client,canonicalSubjectId:subject,verifiedReceiptId:receipt,
      approvedCreditProductOfferId:approvedOffer,
    })).rejects.toThrow('invalid rows');
    const wrong=fakeDb([{receiptId:otherSubject}]);
    await expect(evaluateVerifiedCreditTopUpReceiptV1({
      client:wrong.client,canonicalSubjectId:subject,verifiedReceiptId:receipt,
      approvedCreditProductOfferId:approvedOffer,
    })).rejects.toThrow('invalid rows');
  });
});
