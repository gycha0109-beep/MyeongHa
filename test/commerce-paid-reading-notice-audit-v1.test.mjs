// Watchtower-Track: commerce-payment
import {describe, it, expect, vi} from 'vitest';
import {
  COMMERCE_PAID_READING_NOTICE_AUDIT_SQL_V1,
  inspectPaidReadingNoticeEvidenceReadOnlyV1,
} from '../scripts/operations/commerce-paid-reading-notice-audit-v1.mjs';

const zero=Object.freeze({
 productionVerifiedReadingReceipts:'0',
 missingPinnedReaderSelection:'0',
 missingPrecheckoutNoticePresentation:'0',
 missingOrInvalidNoticeAcknowledgment:'0',
});
function db({row=zero, authority={readOnly:true,completeVisibility:true}, fail=false}={}){
 const query=vi.fn(async(sql)=>{
  if(sql.includes('pg_catalog.pg_roles'))return {rows:[authority]};
  if(sql===COMMERCE_PAID_READING_NOTICE_AUDIT_SQL_V1){
   if(fail)throw Error('private checkout data');
   return {rows:[row]};
  }
  return {rows:[]};
 });
 return {query};
}
describe('read-only production Paid Reading notice completeness audit',()=>{
 it('only inspects production verified PortOne Web Reading Receipts',()=>{
  const sql=COMMERCE_PAID_READING_NOTICE_AUDIT_SQL_V1;
  expect(sql).toContain("receipt.environment='production'");
  expect(sql).toContain("receipt.verification_status='verified'");
  expect(sql).toContain("receipt.provider='portone_v2'");
  expect(sql).toContain("receipt.platform='web'");
  expect(sql).toContain("product.product_type='reading'");
  expect(sql).toContain("spec.purchase_unit_mode='topic_reader_reading'");
  expect(sql).toContain('presentation.reader_content_bundle_id=paid.reader_content_bundle_id');
  expect(sql).toContain('ack.server_acknowledged_at<paid.verified_at');
  expect(sql).not.toMatch(/\b(insert|update|delete|grant|revoke|truncate)\b/i);
 });
 it('reports observed zero as no observed gaps, NOT legal/PSP readiness',async()=>{
  const c=db();
  const output=await inspectPaidReadingNoticeEvidenceReadOnlyV1(c);
  expect(output).toEqual({
   schemaVersion:'commerce-paid-reading-notice-audit-v1',
   status:'observed', counts:zero,
   legalReleaseApproved:false,refundDenialAuthorized:false,
   providerReconciled:false,consumerDeliveryProven:false,
   pspCallsPerformed:false,writesPerformed:false,
  });
  expect(c.query.mock.calls[0][0]).toContain('repeatable read read only');
  expect(c.query.mock.calls.at(-1)[0]).toBe('rollback');
 });
 it.each(['missingPinnedReaderSelection','missingPrecheckoutNoticePresentation',
  'missingOrInvalidNoticeAcknowledgment'])('reports %s as review candidate, never auto-denial',async key=>{
   const output=await inspectPaidReadingNoticeEvidenceReadOnlyV1(db({
    row:{...zero,productionVerifiedReadingReceipts:'1',[key]:'1',privateId:'hidden'},
   }));
   expect(output.status).toBe('review_candidates');
   expect(output.counts).not.toHaveProperty('privateId');
   expect(output.refundDenialAuthorized).toBe(false);
 });
 it('does not treat existence of paid receipts as an integrity failure by itself',async()=>{
  const o=await inspectPaidReadingNoticeEvidenceReadOnlyV1(db({
   row:{...zero,productionVerifiedReadingReceipts:'5'},
  }));
  expect(o.status).toBe('observed');
 });
 it('denies a restricted/RLS-filtered operations role and rolls back',async()=>{
  const c=db({authority:{readOnly:true,completeVisibility:false}});
  await expect(inspectPaidReadingNoticeEvidenceReadOnlyV1(c))
   .rejects.toThrow('READING_NOTICE_AUDIT_AUTHORITY_REQUIRED');
  expect(c.query.mock.calls.some(([sql])=>sql===COMMERCE_PAID_READING_NOTICE_AUDIT_SQL_V1)).toBe(false);
  expect(c.query.mock.calls.at(-1)[0]).toBe('rollback');
 });
 it.each([null,5,'-1','1.0','private'])('rejects invalid count %s without silent zero fallback',async count=>{
  await expect(inspectPaidReadingNoticeEvidenceReadOnlyV1(db({
    row:{...zero,missingPinnedReaderSelection:count},
  }))).rejects.toThrow('INVALID_READING_NOTICE_AUDIT_RESULT');
 });
 it('does not report PASS after database failure',async()=>{
  const c=db({fail:true});
  await expect(inspectPaidReadingNoticeEvidenceReadOnlyV1(c)).rejects.toThrow();
  expect(c.query.mock.calls.at(-1)[0]).toBe('rollback');
 });
});
