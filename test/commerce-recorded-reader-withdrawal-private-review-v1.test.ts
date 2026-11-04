import { describe, expect, it, vi } from 'vitest';
import {
  RECORDED_READING_WITHDRAWAL_PRIVATE_REVIEW_V1 as policy,
  reviewRecordedReadingWithdrawalPrivateV1,
} from '../apps/api/src/commerce-recorded-reader-withdrawal-private-review-v1.js';
import type {
  PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';

const CLAIM='11111111-1111-4111-8111-111111111111';
const SUBJECT='22222222-2222-4222-8222-222222222222';
const PURCHASE='33333333-3333-4333-8333-333333333333';
const UNIT='44444444-4444-4444-8444-444444444444';
const ISO='2026-11-04T00:00:00.000Z';
const ROW=Object.freeze({
  claimId:CLAIM,subjectId:SUBJECT,
  purchaseIntentId:PURCHASE,unitId:UNIT,reasonCode:'defect',
  state:'received',contractVersion:'digital-reading-withdrawal-claim-v1',
  receivedAt:'2026-11-04 00:00:00+00',
});
const PURCHASED=Object.freeze({
  subjectId:SUBJECT,purchaseIntentId:PURCHASE,unitId:UNIT,
  productSpecVersion:'reading-v1',
});
const S7=Object.freeze({
  bodyId:'55555555-5555-4555-8555-555555555555',
  s5CommittedAt:'2026-11-04 00:00:00+00',
  retainedPreparedCount:'2',retainedAcknowledgedCount:'1',
  firstPreparedAt:'2026-11-04 00:00:01+00',
  firstAcknowledgedAt:'2026-11-04 00:00:02+00',
});
const NOTICE=Object.freeze({
  purchaseIntentId:PURCHASE,unitId:UNIT,productSpecVersion:'reading-v1',
  noticeRevision:'notice-v1',previewOrInformationRevision:'preview-v1',
});
type Options=Readonly<{
  claimRows?:readonly unknown[];
  purchasedRows?:readonly unknown[];
  noticeRows?:readonly unknown[];
  s7Rows?:readonly unknown[];
  visibility?:boolean;
  readOnly?:boolean;
  queryFailure?:'claim'|'purchase'|'notice'|'s7'|'begin'|'rollback';
  releaseFailure?:boolean;
}>;
function fixture(options:Options={}) {
  const statements:Array<{sql:string;args:readonly unknown[]|undefined}>= [];
  const release=vi.fn((discard?:unknown)=>{
    if(options.releaseFailure)throw Error('release failed');
    return discard;
  });
  const query=vi.fn(async <T=Record<string,unknown>>(sql:string,args?:readonly unknown[])=>{
    statements.push({sql,args});
    if(options.queryFailure==='begin'&&sql.startsWith('BEGIN'))throw Error('BEGIN failed');
    if(options.queryFailure==='rollback'&&sql==='ROLLBACK')throw Error('ROLLBACK failed');
    if(sql.startsWith('BEGIN')||sql==='ROLLBACK')return {rows:[] as T[]};
    if(sql.includes('pg_catalog.pg_roles'))return {rows:[{
      fullVisibility:options.visibility!==false,readOnly:options.readOnly!==false,
    } as T]};
    if(sql.includes('from public.digital_reading_withdrawal_claims_private_v1 c')){
      if(options.queryFailure==='claim')throw Error('claim SQL down');
      expect(args).toEqual([CLAIM]);
      expect(sql).toContain("s.kind='member'");
      return {rows:(options.claimRows??[ROW]) as T[]};
    }
    if(sql.includes('official_reader_paid_delivery_attempts_v1')){
      if(options.queryFailure==='s7')throw Error('S7 journal unavailable');
      expect(args).toEqual([PURCHASE,SUBJECT,UNIT]);
      expect(sql).toContain('grant_row.source_receipt_id=receipt.id');
      expect(sql).toContain('b.originating_entitlement_grant_id=grant_row.id');
      expect(sql).toContain('presentation.unit_id=$3::uuid');
      expect(sql).toContain('d.retention_until>pg_catalog.clock_timestamp()');
      return {rows:(options.s7Rows??[S7]) as T[]};
    }
    if(sql.includes('from public.purchase_intents pi')){
      if(options.queryFailure==='purchase')throw Error('purchase SQL down');
      expect(args).toEqual([PURCHASE,SUBJECT,UNIT]);
      expect(sql).toContain("receipt.verification_status = 'verified'");
      return {rows:(options.purchasedRows??[PURCHASED]) as T[]};
    }
    if(sql.includes('digital_reading_checkout_notice_acknowledgments_v1')){
      if(options.queryFailure==='notice')throw Error('notice SQL down');
      expect(args).toEqual([PURCHASE,SUBJECT,UNIT,'reading-v1']);
      return {rows:(options.noticeRows??[NOTICE]) as T[]};
    }
    throw Error('Unexpected review SQL: '+sql);
  });
  const pool={connect:vi.fn(async()=>({query,release}))} as unknown as PostgresSubjectPoolV1;
  return {pool,query,release,statements};
}
const run=(f:ReturnType<typeof fixture>,claimId=CLAIM)=>
  reviewRecordedReadingWithdrawalPrivateV1({pool:f.pool,claimId});
const status=(result:unknown)=>JSON.stringify(result);

describe('recorded customer withdrawal Claim -> exact original payment/notice private review',()=>{
  it('never exposes a public handler, refund, Reader mutation or legal decision',()=>{
    expect(policy).toMatchObject({
      publicRouteMounted:false,ownerOperationsOnly:true,readOnly:true,
      customerClaimIntakePerformed:false,deliveryProvenByPreflight:false,
      automaticLegalDecision:false,providerRefundEnabled:false,
      entitlementMutationEnabled:false,
    });
  });

  it('joins a STORED exact claim, current verified Receipt and original notice in one read-only snapshot',async()=>{
    const f=fixture();
    const result=await run(f);
    expect(result).toMatchObject({
      claimId:CLAIM,receivedAt:ISO,recordedCustomerClaim:true,
      kind:'exact_unit_manual_review',sourceClaimImmutable:true,
      retainedReaderS7Timeline:{
        kind:'s7_client_ack_retained_delivery_unproven',
        retainedPreparedCount:2,retainedAcknowledgedCount:1,
        consumerDeliveryProven:false,legallyProvenDeliveredAt:null,
        providerRefundAuthorized:false,grantMutationAuthorized:false,
      },
      review:{classification:'statutory_exception_review',
        reason:'LEGAL_EXCEPTION_OR_COMPLAINT',
        automaticDenialAuthorized:false,providerRefundAuthorized:false,
        entitlementMutationAuthorized:false},
      consumerDeliveryProven:false,automaticDenialAuthorized:false,
      providerRefundAuthorized:false,entitlementMutationAuthorized:false,
      requiresSeparateLegalDecision:true,writesPerformed:false,
    });
    expect(f.statements.map(x=>x.sql)).toEqual([
      'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
      expect.stringContaining('pg_catalog.pg_roles'),
      expect.stringContaining('digital_reading_withdrawal_claims_private_v1'),
      expect.stringContaining('receipt.verification_status'),
      expect.stringContaining('digital_reading_checkout_notice_acknowledgments_v1'),
      expect.stringContaining('official_reader_paid_delivery_attempts_v1'),
      'ROLLBACK',
    ]);
    expect(f.release).toHaveBeenCalledWith(undefined);
    expect(status(result)).not.toContain(SUBJECT);
    expect(status(result)).not.toContain(PURCHASE);
    expect(status(result)).not.toContain(UNIT);
    expect(status(result)).not.toContain('notice-v1');
    expect(f.statements.map(s=>s.sql).join('\n')).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|GRANT)\b/iu);
  });

  it('does not assume an expired or absent S7 receipt proves content was never supplied',async()=>{
    const f=fixture({s7Rows:[{
      ...S7,retainedPreparedCount:'0',retainedAcknowledgedCount:'0',
      firstPreparedAt:null,firstAcknowledgedAt:null,
    }]});
    const result=await run(f);
    expect(result?.retainedReaderS7Timeline).toMatchObject({
      kind:'s5_committed_no_retained_s7',
      retainedPreparedCount:0,consumerDeliveryProven:false,
      legallyProvenDeliveredAt:null,
    });
    expect(result?.review?.automaticDenialAuthorized).toBe(false);
  });

  it('recognizes a prepared server response without a retained authenticated client ACK',async()=>{
    const f=fixture({s7Rows:[{
      ...S7,retainedPreparedCount:'1',retainedAcknowledgedCount:'0',
      firstAcknowledgedAt:null,
    }]});
    const result=await run(f);
    expect(result?.retainedReaderS7Timeline).toMatchObject({
      kind:'s7_response_prepared_without_ack',
      retainedPreparedCount:1,retainedAcknowledgedCount:0,
      consumerDeliveryProven:false,
    });
  });

  it('does not adopt a body from a sibling Reader or ambiguous paid answers',async()=>{
    const f=fixture({s7Rows:[S7,S7]});
    const result=await run(f);
    expect(result?.retainedReaderS7Timeline).toBeNull();
    expect(result?.recordedCustomerClaim).toBe(true);
    expect(result?.providerRefundAuthorized).toBe(false);
  });

  it('does not produce a legal review result from corrupt retained S7 data',async()=>{
    const f=fixture({s7Rows:[{...S7,
      retainedPreparedCount:'1',retainedAcknowledgedCount:'2',
    }]});
    await expect(run(f)).rejects.toMatchObject({
      code:'RECORDED_READING_WITHDRAWAL_PRIVATE_REVIEW_UNAVAILABLE',
    });
    expect(f.statements.at(-1)?.sql).toBe('ROLLBACK');
  });

  it('keeps a change-of-mind claim in manual evidence review when legal delivery is not proven',async()=>{
    const f=fixture({claimRows:[{...ROW,reasonCode:'change_of_mind'}]});
    const result=await run(f);
    expect(result?.review).toMatchObject({
      classification:'evidence_review_required',
      reason:'INVALID_OR_MISSING_SERVER_EVIDENCE',
      automaticDenialAuthorized:false,
    });
    expect(result?.consumerDeliveryProven).toBe(false);
    expect(result?.recordedCustomerClaim).toBe(true);
  });

  it('does not infer a purchase or call provider evidence for a general claim',async()=>{
    const f=fixture({claimRows:[{...ROW,purchaseIntentId:null,unitId:null}]});
    const result=await run(f);
    expect(result).toMatchObject({
      kind:'general_unlinked_manual_review',review:null,
      recordedCustomerClaim:true,providerRefundAuthorized:false,
    });
    expect(f.statements).toHaveLength(4);
    expect(f.statements.at(-1)?.sql).toBe('ROLLBACK');
  });

  it('preserves a received claim even when paid Receipt proof is missing/revoked',async()=>{
    const f=fixture({purchasedRows:[]});
    const result=await run(f);
    expect(result).toMatchObject({
      kind:'exact_unit_evidence_unavailable',recordedCustomerClaim:true,
      review:null,automaticDenialAuthorized:false,
      providerRefundAuthorized:false,entitlementMutationAuthorized:false,
    });
    expect(f.statements.at(-1)?.sql).toBe('ROLLBACK');
  });

  it('keeps another Subject\'s claim recorded but never borrows this Subject\'s receipt evidence',async()=>{
    const f=fixture({claimRows:[{...ROW,subjectId:UNIT}]});
    const result=await run(f);
    expect(result).toMatchObject({
      kind:'exact_unit_evidence_unavailable',review:null,
      recordedCustomerClaim:true,providerRefundAuthorized:false,
    });
    expect(status(result)).not.toContain(SUBJECT);
    expect(f.statements.at(-1)?.sql).toBe('ROLLBACK');
  });

  it('returns no case for a missing/deleted private Claim, without checking payments',async()=>{
    const f=fixture({claimRows:[]});
    expect(await run(f)).toBeNull();
    expect(f.statements).toHaveLength(4);
  });

  it.each([
    {claimRows:[{...ROW,claimId:UNIT}]},
    {claimRows:[{...ROW,purchaseIntentId:null}]},
    {claimRows:[{...ROW,unitId:null}]},
    {claimRows:[{...ROW,reasonCode:'unapproved'}]},
    {claimRows:[{...ROW,contractVersion:'unknown-v2'}]},
    {claimRows:[{...ROW,state:'approved'}]},
    {claimRows:[{...ROW,receivedAt:'invalid'}]},
    {claimRows:[ROW,ROW]},
  ])('fails closed on inconsistent stored claim authority: %j',async options=>{
    const f=fixture(options);
    await expect(run(f)).rejects.toMatchObject({
      code:'RECORDED_READING_WITHDRAWAL_PRIVATE_REVIEW_UNAVAILABLE',
    });
    expect(f.statements.some(s=>s.sql.includes('from public.purchase_intents pi'))).toBe(false);
    expect(f.statements.at(-1)?.sql).toBe('ROLLBACK');
  });

  it.each([{visibility:false},{readOnly:false}])('requires an RLS-complete, read-only private operator',async options=>{
    const f=fixture(options);
    await expect(run(f)).rejects.toMatchObject({
      code:'RECORDED_READING_WITHDRAWAL_PRIVATE_REVIEW_UNAVAILABLE',
    });
    expect(f.statements).toHaveLength(3);
    expect(f.statements.at(-1)?.sql).toBe('ROLLBACK');
  });

  it.each(['purchase','notice'] as const)(
    'preserves the recorded claim without forging %s evidence on private DB failure',async queryFailure=>{
      const f=fixture({queryFailure});
      await expect(run(f)).resolves.toMatchObject({
        kind:'exact_unit_evidence_unavailable',recordedCustomerClaim:true,
        review:null,providerRefundAuthorized:false,
      });
      expect(f.statements.at(-1)?.sql).toBe('ROLLBACK');
    },
  );

  it.each(['claim','begin','rollback'] as const)(
    'never trusts an unsafe Claim transaction or failed %s operation',async queryFailure=>{
      const f=fixture({queryFailure});
      await expect(run(f)).rejects.toMatchObject({
        code:'RECORDED_READING_WITHDRAWAL_PRIVATE_REVIEW_UNAVAILABLE',
      });
      expect(f.statements.at(-1)?.sql).toBe(queryFailure==='begin'?
        'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'ROLLBACK');
      if(queryFailure==='begin'||queryFailure==='rollback')
        expect(f.release.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    },
  );

  it('disallows invalid Claim identity without database access',async()=>{
    const f=fixture();
    await expect(run(f,'not-a-uuid')).rejects.toMatchObject({
      code:'RECORDED_READING_WITHDRAWAL_PRIVATE_REVIEW_UNAVAILABLE',
    });
    expect(f.statements).toHaveLength(0);
  });
});
