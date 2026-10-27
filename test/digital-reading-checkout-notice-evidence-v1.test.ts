import { describe, expect, it } from 'vitest';
import {
  DIGITAL_READING_CHECKOUT_NOTICE_EVIDENCE_V1,
  issueDigitalReadingCheckoutNoticePresentationV1,
  acknowledgeDigitalReadingCheckoutNoticeV1,
  loadVerifiedDigitalReadingCheckoutNoticeV1,
  type DigitalReadingCheckoutNoticeAuthorityPortV1,
  type DigitalReadingCheckoutNoticePresentationWriteV1,
  type DigitalReadingCheckoutNoticeAckWriteV1,
} from '../apps/api/src/digital-reading-checkout-notice-evidence-v1.js';
import type { PostgresTransactionQueryV1 } from '../apps/api/src/postgres-subject-execution.js';

const subjectId = 'a1000000-0000-4000-8000-000000000001';
const purchaseIntentId = 'a1000000-0000-4000-8000-000000000002';
const productId = 'a1000000-0000-4000-8000-000000000003';
const unitId = 'a1000000-0000-4000-8000-000000000004';
const bundleId = 'a1000000-0000-4000-8000-000000000005';
const hash = 'd'.repeat(64);
const approved = {
  purchaseIntentId, subjectId, productId,
  productSpecVersion: 'v1',
  readerCharacterId: 'baekheon',
  readerContentBundleId: bundleId,
  revisionKey: 'approved:notice:v1',
  noticeRevision: 'notice-v1',
  noticeSha256: hash,
  previewOrInformationRevision: 'info-v1',
  previewOrInformationSha256: hash,
  authorityState: 'approved' as const,
};
class FakeAuthority implements DigitalReadingCheckoutNoticeAuthorityPortV1 {
  presented: DigitalReadingCheckoutNoticePresentationWriteV1 | null = null;
  acknowledged: DigitalReadingCheckoutNoticeAckWriteV1 | null = null;
  resolverCalls = 0;
  source: typeof approved | null = approved;
  tamperPresentation = false;
  tamperAck = false;
  async resolveApprovedNotice(input: { purchaseIntentId: string; subjectId: string }) {
    this.resolverCalls += 1;
    expect(input).toEqual({ purchaseIntentId, subjectId });
    return this.source;
  }
  async recordPresentation(input: DigitalReadingCheckoutNoticePresentationWriteV1) {
    this.presented = input;
    return [{ ...input, serverPresentedAt: '2026-10-27T05:10:00.001Z', ...(this.tamperPresentation ? { revisionKey:'forged' } : {}) }];
  }
  async recordAcknowledgment(input: DigitalReadingCheckoutNoticeAckWriteV1) {
    this.acknowledged = input;
    return [{ ...input, acknowledged: true as const, serverAcknowledgedAt: '2026-10-27T05:11:00.001Z', ...(this.tamperAck ? { subjectId:productId } : {}) }];
  }
}

function issue(port: FakeAuthority) {
  return issueDigitalReadingCheckoutNoticePresentationV1({
    resolvedSubjectId: subjectId,
    purchaseIntentId,
    authorityPort: port,
    nextUnitId: () => unitId,
  });
}

describe('private checkout notice evidence, not a public checkout/withdrawal authority', () => {
  it('has no public route, legal denial or release grant', () => {
    expect(DIGITAL_READING_CHECKOUT_NOTICE_EVIDENCE_V1).toMatchObject({
      authority: 'server_checkout_snapshot',
      releaseState: 'PRIVATE_UNRELEASED',
      publicCheckoutRoute: null,
      automaticRefundDenial: false,
    });
  });
  it('pins the approved server-owned revision/Reader/unit and stores only a hashed challenge', async () => {
    const port = new FakeAuthority();
    const result = await issue(port);
    expect(port.resolverCalls).toBe(1);
    expect(result.purchaseIntentId).toBe(purchaseIntentId);
    expect(result.unitId).toBe(unitId);
    expect(result.acknowledgmentChallenge).toMatch(/^[a-f0-9]{64}$/u);
    expect(port.presented).toMatchObject({
      purchaseIntentId, subjectId, unitId, productId,
      readerCharacterId:'baekheon', readerContentBundleId:bundleId,
      revisionKey:'approved:notice:v1', noticeRevision:'notice-v1',
      previewOrInformationRevision:'info-v1',
    });
    expect(port.presented?.presentationSnapshotSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(port.presented?.challengeSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(port.presented?.challengeSha256).not.toBe(result.acknowledgmentChallenge);
    expect(JSON.stringify(port.presented)).not.toContain(result.acknowledgmentChallenge);

    const ack = await acknowledgeDigitalReadingCheckoutNoticeV1({
      resolvedSubjectId: subjectId,
      request: { purchaseIntentId, unitId, acknowledgmentChallenge: result.acknowledgmentChallenge, acknowledged:true },
      authorityPort:port,
    });
    expect(ack).toEqual({ acknowledged:true });
    expect(port.acknowledged?.submittedChallengeSha256).toBe(port.presented?.challengeSha256);
  });
  it('blocks missing/unapproved or wrong-owner server source before writing', async () => {
    for (const source of [null, { ...approved, authorityState: 'draft' as const }, { ...approved, subjectId:productId }]) {
      const port = new FakeAuthority();
      port.source = source as FakeAuthority['source'];
      await expect(issue(port)).rejects.toThrow(/approved source authority/);
      expect(port.presented).toBeNull();
    }
  });
  it('blocks any client-supplied revision, timestamp, purchase/receipt or implied check', async () => {
    const port = new FakeAuthority();
    const result = await issue(port);
    const request = { purchaseIntentId, unitId, acknowledgmentChallenge: result.acknowledgmentChallenge, acknowledged:true };
    for (const extra of [
      { noticeRevision:'forged' },{ browserTime:'2026-10-27T05:01:00Z' },
      { serverAcknowledgedAt:'2026-10-27T05:01:00Z' },
      { receiptVerified:true },{ subjectId },{ paymentId:'fake' },
      { authority:'server_checkout_snapshot' },
    ]) {
      await expect(acknowledgeDigitalReadingCheckoutNoticeV1({
        resolvedSubjectId:subjectId,request:{...request,...extra},authorityPort:port,
      })).rejects.toThrow(/exact explicit signal/);
    }
    for (const value of [false, null, 'true']) {
      await expect(acknowledgeDigitalReadingCheckoutNoticeV1({
        resolvedSubjectId:subjectId,request:{...request,acknowledged:value},authorityPort:port,
      })).rejects.toThrow(/exact explicit signal/);
    }
    expect(port.acknowledged).toBeNull();
  });
  it('rejects any database return drift for the approved snapshot or acknowledgment', async () => {
    const badPresentation = new FakeAuthority();
    badPresentation.tamperPresentation = true;
    await expect(issue(badPresentation)).rejects.toThrow(/persisted presentation drift/);
    const badAck = new FakeAuthority();
    badAck.tamperAck = true;
    const issued = await issue(badAck);
    await expect(acknowledgeDigitalReadingCheckoutNoticeV1({
      resolvedSubjectId:subjectId,
      request:{ purchaseIntentId,unitId,acknowledgmentChallenge:issued.acknowledgmentChallenge,acknowledged:true },
      authorityPort:badAck,
    })).rejects.toThrow(/durable authority mismatch/);
  });
  it('creates a reviewer notice only from exact server DB joins, an earlier ack and verified receipt', async () => {
    let querySql = '';
    let queryArgs: readonly unknown[] = [];
    const client = {
      query: async (sql: string, params?: readonly unknown[]) => {
        querySql=sql;
        queryArgs=params??[];
        return {rows:[{purchaseIntentId,unitId,productSpecVersion:'v1',noticeRevision:'notice-v1',previewOrInformationRevision:'info-v1'}]};
      },
    } as PostgresTransactionQueryV1;
    const input = {resolvedSubjectId:subjectId,purchaseIntentId,unitId,productSpecVersion:'v1'};
    const evidence = await loadVerifiedDigitalReadingCheckoutNoticeV1(client,input);
    expect(evidence).toEqual({
      authority:'server_checkout_snapshot',purchaseIntentId,unitId,
      productSpecVersion:'v1',noticeRevision:'notice-v1',
      previewOrInformationRevision:'info-v1',acknowledged:true,
    });
    expect(queryArgs).toEqual([purchaseIntentId,subjectId,unitId,'v1']);
    for (const must of [
      'join public.digital_reading_checkout_notice_acknowledgments_v1',
      "r.authority_state='approved'",
      "receipt.verification_status='verified'",
      'receipt.verified_at > a.server_acknowledged_at',
      'a.server_acknowledged_at > p.server_presented_at',
      'sel.reader_character_id=p.reader_character_id',
      'pi.subject_id=p.subject_id',
      'limit 2',
    ]) expect(querySql).toContain(must);
  });
  it('fails closed on absent, duplicate, wrong-unit or forged returned DB evidence', async () => {
    const input = {resolvedSubjectId:subjectId,purchaseIntentId,unitId,productSpecVersion:'v1'};
    for (const rows of [
      [], [{purchaseIntentId,unitId:productId,productSpecVersion:'v1',noticeRevision:'x',previewOrInformationRevision:'y'}],
      [{purchaseIntentId,unitId,productSpecVersion:'v2',noticeRevision:'x',previewOrInformationRevision:'y'}],
      [{purchaseIntentId,unitId,productSpecVersion:'v1',noticeRevision:'',previewOrInformationRevision:'y'}],
      [{purchaseIntentId,unitId,productSpecVersion:'v1',noticeRevision:'x',previewOrInformationRevision:'y'},{purchaseIntentId,unitId,productSpecVersion:'v1',noticeRevision:'x',previewOrInformationRevision:'y'}],
    ]) {
      const client = {query: async () => ({rows})} as PostgresTransactionQueryV1;
      expect(await loadVerifiedDigitalReadingCheckoutNoticeV1(client,input)).toBeNull();
    }
  });
});
