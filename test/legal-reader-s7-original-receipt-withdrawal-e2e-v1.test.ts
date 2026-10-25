import { describe, expect, it, vi } from 'vitest';
import {
  LEGAL_READER_S7_OWNER_BRIDGE_V1,
  LegalReaderS7OwnerEvidenceUnavailableV1,
  reviewLegalReaderS7OriginalPurchaseV1,
  type OfficialReaderS7OwnerEvidencePortV1,
} from '../apps/api/src/commerce-reader-s7-owner-withdrawal-bridge-v1.js';
import type {
  PostgresSubjectConnectionV1, PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from '../apps/api/src/subject-identity-resolver.js';

const MEMBER_USER='11111111-1111-4111-8111-111111111111';
const SUBJECT='22222222-2222-4222-8222-222222222222';
const PURCHASE='33333333-3333-4333-8333-333333333333';
const GRANT='44444444-4444-4444-8444-444444444444';
const BODY='55555555-5555-4555-8555-555555555555';
const COMMITTED='2026-10-25T00:01:00.000Z';
const PREPARED='2026-10-25T00:02:00.000Z';
const ACK='2026-10-25T00:03:00.000Z';

const base = () => ({
  contractVersion:'commerce-reader-s7-private-withdrawal-evidence-v1',
  purchasedUnit:{
    purchaseIntentId:PURCHASE,unitId:GRANT,productSpecVersion:'2026-10-25-v1',
  },
  timeline:{
    originalReceiptStatus:'verified' as const,
    s5CommittedAt:COMMITTED,
    serverResponsePreparedAt:null as string|null,
    authenticatedClientAcknowledgedAt:null as string|null,
    retainedDeliveryAttempts:0,
    retainedAcknowledgedAttempts:0,
    retainedUnacknowledgedAttempts:0,
    retainedDeliveryEvidenceState:'no_retained_delivery_receipts' as const,
    consumerDeliveryProven:false as const,
    legallyProvenDeliveredAt:null,
  },
  checkoutNoticeEvidenceState:'missing_or_unverifiable',
  review:{
    classification:'evidence_review_required' as const,
    reason:'INVALID_OR_MISSING_SERVER_EVIDENCE' as const,
    automaticDenialAuthorized:false as const,
    providerRefundAuthorized:false as const,
    entitlementMutationAuthorized:false as const,
  },
  refundAuthorized:false as const,
  entitlementMutationAuthorized:false as const,
});

function ownerScope() {
  const statements:string[]=[];
  const release=vi.fn();
  const client:PostgresSubjectConnectionV1={
    async query<Row=Record<string,unknown>>(sql:string, values?:readonly unknown[]) {
      statements.push(sql);
      if (sql.includes('begin_member_subject_context_v1')) {
        expect(values).toEqual([MEMBER_USER]);
        return {rows:[{subjectId:SUBJECT,subjectKind:'member'} as Row]};
      }
      if (sql.includes('begin_guest_subject_context_v1')) {
        return {rows:[{subjectId:SUBJECT,subjectKind:'guest'} as Row]};
      }
      if (sql.includes('assert_myeongha_subject_context_v1')) {
        expect(values).toEqual([SUBJECT]);
        return {rows:[] as readonly Row[]};
      }
      if (sql==='BEGIN' || sql==='COMMIT' || sql==='ROLLBACK' ||
          sql==='SET LOCAL ROLE myeongha_api_executor') {
        return {rows:[] as readonly Row[]};
      }
      throw new Error('Legal track must NOT invoke private S7 SQL using API role');
    },
    release,
  };
  const pool:PostgresSubjectPoolV1={connect:async()=>client};
  return {pool,statements,release};
}

function run(
  port:OfficialReaderS7OwnerEvidencePortV1,
  options:Readonly<{
    verifiedEvidence?:VerifiedSubjectIdentityEvidenceV1;
    purchaseIntentId?:string;
    grant?:string;
    reason?:'change_of_mind'|'not_provided';
  }>={},
) {
  const db=ownerScope();
  const request=reviewLegalReaderS7OriginalPurchaseV1({
    pool:db.pool,
    verifiedEvidence:options.verifiedEvidence ??
      {kind:'member',verifiedAuthUserId:MEMBER_USER},
    provenance:{
      purchaseIntentId:options.purchaseIntentId ?? PURCHASE,
      originatingGrantId:options.grant ?? GRANT,
      bodyId:BODY,
    },
    reason:options.reason ?? 'change_of_mind',
    ownerPort:port,
  });
  return {request,...db};
}

describe('Legal L4 handoff from separate DB Owner #2301 original receipt/Grant S7 evidence',()=>{
  it('consumes one authorized original-purchase witness in the same Member-scoped transaction',async()=>{
    const witness=vi.fn(async(input:Parameters<OfficialReaderS7OwnerEvidencePortV1['readOriginalReceiptS7Evidence']>[0])=>{
      expect(input.scope.resolvedSubject).toEqual({subjectId:SUBJECT,subjectKind:'member'});
      expect(input.purchaseIntentId).toBe(PURCHASE);
      expect(input.originatingGrantId).toBe(GRANT);
      expect(input.bodyId).toBe(BODY);
      expect(input.claim).toEqual({purchaseIntentId:PURCHASE,unitId:GRANT,reason:'change_of_mind'});
      return base();
    });
    const v=run({readOriginalReceiptS7Evidence:witness});
    const result=await v.request;
    expect(result.review.classification).toBe('evidence_review_required');
    expect(result.actualConsumerDeliveryProven).toBe(false);
    expect(result.legallyProvenDeliveredAt).toBeNull();
    expect(result.providerRefundAuthorized).toBe(false);
    expect(result.entitlementMutationAuthorized).toBe(false);
    expect(v.statements).toEqual([
      'BEGIN','SET LOCAL ROLE myeongha_api_executor',
      expect.stringContaining('begin_member_subject_context_v1'),
      'select public.assert_myeongha_subject_context_v1($1::uuid)','COMMIT',
    ]);
    expect(v.release).toHaveBeenCalledOnce();
    expect(witness).toHaveBeenCalledOnce();
    expect(LEGAL_READER_S7_OWNER_BRIDGE_V1.ownerRuntimeSqlGranted).toBe(false);
    expect(LEGAL_READER_S7_OWNER_BRIDGE_V1.publicRoute).toBeNull();
  });

  it('treats server-prepared responses without a client ACK as delivery UNPROVEN',async()=>{
    const evidence=base();
    const witness={
      ...evidence,
      timeline:{
        ...evidence.timeline,serverResponsePreparedAt:PREPARED,
        retainedDeliveryAttempts:1,retainedUnacknowledgedAttempts:1,
        retainedDeliveryEvidenceState:'response_prepared_no_retained_ack',
      },
    };
    const result=await run({readOriginalReceiptS7Evidence:async()=>witness}).request;
    expect(result.retainedDeliveryEvidenceState).toBe('response_prepared_no_retained_ack');
    expect(result.authenticatedClientAcknowledgedAt).toBeNull();
    expect(result.actualConsumerDeliveryProven).toBe(false);
  });

  it('never promotes an authenticated client ACK or replay into legal delivery proof',async()=>{
    const evidence=base();
    const witness={
      ...evidence,
      timeline:{
        ...evidence.timeline,serverResponsePreparedAt:PREPARED,
        authenticatedClientAcknowledgedAt:ACK,
        retainedDeliveryAttempts:3,retainedAcknowledgedAttempts:2,
        retainedUnacknowledgedAttempts:1,
        retainedDeliveryEvidenceState:'client_ack_recorded_delivery_unproven',
      },
    };
    const result=await run({readOriginalReceiptS7Evidence:async()=>witness}).request;
    expect(result.retainedDeliveryAttempts).toBe(3);
    expect(result.retainedAcknowledgedAttempts).toBe(2);
    expect(result.retainedDeliveryEvidenceState).toBe('client_ack_recorded_delivery_unproven');
    expect(result.actualConsumerDeliveryProven).toBe(false);
    expect(result.legallyProvenDeliveredAt).toBeNull();
    expect(result.review.classification).not.toBe('restriction_review_candidate');
  });

  it('keeps owner-detected refund revocation as a manual evidence question',async()=>{
    const evidence=base();
    const result=await run({readOriginalReceiptS7Evidence:async()=>({
      ...evidence,
      timeline:{...evidence.timeline,originalReceiptStatus:'revoked'},
    })}).request;
    expect(result.originalReceiptStatus).toBe('revoked');
    expect(result.providerRefundAuthorized).toBe(false);
    expect(result.entitlementMutationAuthorized).toBe(false);
    expect(result.review.classification).toBe('evidence_review_required');
  });

  it('does not allow a revoked original Receipt to masquerade as a verified paid Reader',async()=>{
    const evidence=base();
    const v=run({readOriginalReceiptS7Evidence:async()=>({
      ...evidence,
      timeline:{...evidence.timeline,originalReceiptStatus:'revoked'},
      review:{...evidence.review,classification:'not_proven_delivered',
        reason:'CONTENT_NOT_PROVEN_DELIVERED'},
    })});
    await expect(v.request).rejects.toBeInstanceOf(LegalReaderS7OwnerEvidenceUnavailableV1);
    expect(v.statements.at(-1)).toBe('ROLLBACK');
  });

  it('rejects an owner witness for a different original Grant or Receipt',async()=>{
    const evidence=base();
    for (const mutated of [
      {...evidence,purchasedUnit:{...evidence.purchasedUnit,unitId:BODY}},
      {...evidence,purchasedUnit:{...evidence.purchasedUnit,purchaseIntentId:BODY}},
    ]) {
      const v=run({readOriginalReceiptS7Evidence:async()=>mutated});
      await expect(v.request).rejects.toBeInstanceOf(LegalReaderS7OwnerEvidenceUnavailableV1);
      expect(v.statements.at(-1)).toBe('ROLLBACK');
    }
  });

  it('rejects a browser-forged delivered candidate even with original Grant/S7 ACK data',async()=>{
    const evidence=base();
    const v=run({readOriginalReceiptS7Evidence:async()=>({
      ...evidence,
      review:{...evidence.review,classification:'restriction_review_candidate',
        reason:'DELIVERED_NOTICE_RECORDED'},
    })});
    await expect(v.request).rejects.toBeInstanceOf(LegalReaderS7OwnerEvidenceUnavailableV1);
    expect(v.statements.at(-1)).toBe('ROLLBACK');
  });

  it('rejects inconsistent ACK chronology and replay counts',async()=>{
    const evidence=base();
    for (const timeline of [
      {...evidence.timeline,retainedDeliveryAttempts:1,retainedAcknowledgedAttempts:2},
      {...evidence.timeline,retainedDeliveryAttempts:2,retainedUnacknowledgedAttempts:1},
      {...evidence.timeline,serverResponsePreparedAt:ACK,
        authenticatedClientAcknowledgedAt:PREPARED,
        retainedDeliveryAttempts:1,retainedAcknowledgedAttempts:1,
        retainedUnacknowledgedAttempts:0,
        retainedDeliveryEvidenceState:'client_ack_recorded_delivery_unproven'},
      {...evidence.timeline,serverResponsePreparedAt:'2026-10-24T23:00:00.000Z',
        retainedDeliveryAttempts:1,retainedUnacknowledgedAttempts:1,
        retainedDeliveryEvidenceState:'response_prepared_no_retained_ack'},
    ]) {
      const v=run({readOriginalReceiptS7Evidence:async()=>({...evidence,timeline})});
      await expect(v.request).rejects.toBeInstanceOf(LegalReaderS7OwnerEvidenceUnavailableV1);
      expect(v.statements.at(-1)).toBe('ROLLBACK');
    }
  });

  it('never treats guest or missing Owner DB functionality as successful consumer delivery',async()=>{
    const port={readOriginalReceiptS7Evidence:vi.fn(async()=>base())};
    const guest=run(port,{verifiedEvidence:{
      kind:'guest',verifiedGuestTokenHash:'myeongha-guest-bearer-hmac-sha256-v1:'+'a'.repeat(64),
    }});
    await expect(guest.request).rejects.toBeInstanceOf(LegalReaderS7OwnerEvidenceUnavailableV1);
    expect(port.readOriginalReceiptS7Evidence).not.toHaveBeenCalled();
    expect(guest.statements.at(-1)).toBe('ROLLBACK');
    const unavailable=run({readOriginalReceiptS7Evidence:async()=>{throw new Error('unmerged DB Owner S7 function');}});
    await expect(unavailable.request).rejects.toBeInstanceOf(LegalReaderS7OwnerEvidenceUnavailableV1);
    expect(unavailable.statements.at(-1)).toBe('ROLLBACK');
  });

  it('rejects untrusted provenance before opening PostgreSQL',async()=>{
    const port={readOriginalReceiptS7Evidence:vi.fn(async()=>base())};
    const invalid=run(port,{purchaseIntentId:'browser-purchase'});
    await expect(invalid.request).rejects.toMatchObject({code:'INVALID_REQUEST'});
    expect(invalid.statements).toHaveLength(0);
    expect(port.readOriginalReceiptS7Evidence).not.toHaveBeenCalled();
  });
});
