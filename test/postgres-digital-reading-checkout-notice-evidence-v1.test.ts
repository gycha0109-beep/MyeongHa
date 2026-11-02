import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  createPostgresDigitalReadingCheckoutNoticeAuthorityPortV1,
} from '../apps/api/src/postgres-digital-reading-checkout-notice-evidence-v1.js';
import type { PostgresTransactionQueryV1 } from '../apps/api/src/postgres-subject-execution.js';

const subjectId='a1000000-0000-4000-8000-000000000001';
const purchaseIntentId='a1000000-0000-4000-8000-000000000002';
const productId='a1000000-0000-4000-8000-000000000003';
const unitId='a1000000-0000-4000-8000-000000000004';
const bundleId='a1000000-0000-4000-8000-000000000005';
const hash='a'.repeat(64);

const approved = {
  purchaseIntentId,subjectId,productId,productSpecVersion:'v1',readerCharacterId:'baekheon',
  readerContentBundleId:bundleId,revisionKey:'release-1',noticeRevision:'notice-1',
  noticeSha256:hash,previewOrInformationRevision:'info-1',
  previewOrInformationSha256:hash,authorityState:'approved',
};

function fakeDb(rows: unknown[][]) {
  const calls: Array<{sql:string;params:readonly unknown[]}>=[];
  const query = {
    query: async (sql: string, params?: readonly unknown[]) => {
      calls.push({sql,params:params??[]});
      return {rows:rows.shift()??[]};
    },
  } as PostgresTransactionQueryV1;
  return {query,calls};
}
const presentation = {
  purchaseIntentId,subjectId,unitId,productId,readerCharacterId:'baekheon',
  readerContentBundleId:bundleId,productSpecVersion:'v1',
  revisionKey:'release-1',noticeRevision:'notice-1',
  previewOrInformationRevision:'info-1',noticeSha256:hash,previewOrInformationSha256:hash,
  challengeSha256:hash,presentationSnapshotSha256:hash,
};
const ack={purchaseIntentId,subjectId,unitId,submittedChallengeSha256:hash};
const ackRow={...ack,acknowledged:true,serverAcknowledgedAt:'2026-10-27T05:23:00.001Z'};

describe('checkout notice private PostgreSQL adapter',()=>{
  it('keeps the exact staged SQL out of the unapproved Production deployment and historical R2 fixture', () => {
    const sqlPath = 'supabase/migrations/20261027054525_digital_reading_checkout_notice_evidence_v1.sql';
    const reviewed = '550e2ff3dd86d16d30334220c223650387b71ca7';
    const actual = execFileSync('git', ['hash-object', sqlPath], { encoding: 'utf8' }).trim();
    expect(actual).toBe(reviewed);
    const workflow = readFileSync('.github/workflows/supabase-production.yml', 'utf8');
    const fixture = readFileSync('test/db/run_ci_case.sh', 'utf8');
    const historicalPolicy = readFileSync('test/db/staged_commerce_migration_policy.sh', 'utf8');
    expect(historicalPolicy).toContain('20261027054525_digital_reading_checkout_notice_evidence_v1.sql)');
    expect(historicalPolicy).toContain(`expected='${reviewed}'`);
    // The staged one-shot deployment policy remains pinned to its original
    // historical catalog. Later forward-only migrations legitimately advance
    // the current catalog snapshot and must not rewrite that policy.
    const baseline = readFileSync('test/db/catalog.expected.sha256', 'utf8').trim();
    expect(baseline).toMatch(/^[0-9a-f]{64}$/u);
    expect(workflow).toContain("== '1a4106370848c27564fd4b0d64cf84c8d30dc02b205f331fe17c46e4dc061c53'");
    expect(fixture).toContain(`20261027054525_digital_reading_checkout_notice_evidence_v1.sql) reviewed_blob_sha1='${reviewed}'`);
    const scope = workflow.slice(workflow.indexOf("== 'feat(ops): stage private checkout notice provenance and prepayment acknowledgment'"));
    expect(scope).toContain("HOLD_PRIVATE_CHECKOUT_STAGING_PATH_DRIFT");
    expect(scope).toContain("HOLD_PRIVATE_CHECKOUT_STAGING_SQL_DRIFT");
    expect(scope).toContain("HOLD_PRIVATE_CHECKOUT_STAGING_CATALOG_DRIFT");
    expect(scope).toContain(`== '${reviewed}'`);
    expect(scope).toContain('requires_deploy=false');
    expect(scope.indexOf('requires_deploy=false')).toBeLessThan(scope.indexOf("== 'ops(db): one-shot Se-yeon helper ACL"));
  });
  it('only resolves exact approved prepayment server Product/Reader/notice revision',async()=>{
    const {query,calls}=fakeDb([[approved]]);
    const port=createPostgresDigitalReadingCheckoutNoticeAuthorityPortV1(query);
    await expect(port.resolveApprovedNotice({purchaseIntentId,subjectId})).resolves.toEqual(approved);
    expect(calls[0]?.params).toEqual([purchaseIntentId,subjectId]);
    for(const frag of [
      "pi.status='created'",
      "revision.authority_state='approved'",
      'revision.approved_at <= clock_timestamp()',
      "spec.purchase_unit_mode='topic_reader_reading'",
      'selection.reader_character_id',
      'not exists (select 1 from public.commerce_receipts',
      'not exists (select 1 from public.digital_reading_checkout_notice_presentations_v1',
      'limit 2',
    ])expect(calls[0]?.sql).toContain(frag);
  });
  it('fails closed on missing, ambiguous, unapproved and wrong-owner resolution',async()=>{
    for(const rows of [[],[approved,approved],[{...approved,authorityState:'draft'}],[{...approved,subjectId:productId}]]) {
      const db=fakeDb([rows]);
      const port=createPostgresDigitalReadingCheckoutNoticeAuthorityPortV1(db.query);
      await expect(port.resolveApprovedNotice({purchaseIntentId,subjectId})).resolves.toBeNull();
    }
  });
  it('persists only exact scope and hashes; never browser-supplied timestamps',async()=>{
    const db=fakeDb([[{...presentation,serverPresentedAt:'2026-10-27T05:23:00.001Z'}]]);
    const port=createPostgresDigitalReadingCheckoutNoticeAuthorityPortV1(db.query);
    const rows=await port.recordPresentation(presentation);
    expect(rows).toHaveLength(1);
    expect(db.calls[0]?.sql).toContain('insert into public.digital_reading_checkout_notice_presentations_v1');
    expect(db.calls[0]?.sql).not.toContain('server_presented_at,');
    expect(db.calls[0]?.params).toEqual([
      purchaseIntentId,subjectId,unitId,productId,'baekheon',bundleId,'v1','release-1',
      'notice-1','info-1',hash,hash,hash,hash,
    ]);
  });
  it('acknowledges with server receipt chronology, idempotently preserving persisted time',async()=>{
    const db=fakeDb([[ackRow]]);
    const port=createPostgresDigitalReadingCheckoutNoticeAuthorityPortV1(db.query);
    await expect(port.recordAcknowledgment(ack)).resolves.toEqual([ackRow]);
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]?.sql).toContain('from public.digital_reading_checkout_notice_acknowledgments_v1');
    expect(db.calls[0]?.params).toEqual([purchaseIntentId,subjectId,unitId]);
  });
  it('records a new acknowledgment and checks the DB-returned same-unit hash',async()=>{
    const db=fakeDb([[],[ackRow]]);
    const port=createPostgresDigitalReadingCheckoutNoticeAuthorityPortV1(db.query);
    await expect(port.recordAcknowledgment(ack)).resolves.toEqual([ackRow]);
    expect(db.calls[1]?.sql).toContain('on conflict (purchase_intent_id) do nothing');
    expect(db.calls[1]?.params).toEqual([purchaseIntentId,subjectId,unitId,hash]);
    expect(db.calls[1]?.sql).not.toContain('server_acknowledged_at,');
  });
  it('resolves concurrent same-challenge replay without rewriting and rejects conflict',async()=>{
    const good=fakeDb([[],[],[ackRow]]);
    await expect(createPostgresDigitalReadingCheckoutNoticeAuthorityPortV1(good.query)
      .recordAcknowledgment(ack)).resolves.toEqual([ackRow]);
    const bad=fakeDb([[{...ackRow,submittedChallengeSha256:'b'.repeat(64)}]]);
    await expect(createPostgresDigitalReadingCheckoutNoticeAuthorityPortV1(bad.query)
      .recordAcknowledgment(ack)).rejects.toThrow(/replay conflicts/);
    expect(bad.calls).toHaveLength(1);
    const badRace=fakeDb([[],[],[{...ackRow,unitId:productId}]]);
    await expect(createPostgresDigitalReadingCheckoutNoticeAuthorityPortV1(badRace.query)
      .recordAcknowledgment(ack)).rejects.toThrow(/concurrent retry/);
  });
});
