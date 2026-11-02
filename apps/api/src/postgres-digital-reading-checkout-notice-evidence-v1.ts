/**
 * Private, unreleased PostgreSQL adapter for one-item Standard Reading checkout
 * notice evidence. The executor does NOT have grants on these tables.
 * A future authority-reviewed activation must add specific server execution
 * permissions and a genuine approved notice/preview release, not a route here.
 */
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import type {
  DigitalReadingCheckoutNoticeAuthorityPortV1,
  DigitalReadingCheckoutNoticePresentationWriteV1,
  DigitalReadingCheckoutNoticePresentationRowV1,
  DigitalReadingCheckoutNoticeAckWriteV1,
  DigitalReadingCheckoutNoticeAckRowV1,
} from './digital-reading-checkout-notice-evidence-v1.js';

const SELECT_APPROVED_SOURCE = `
select pi.id::text as "purchaseIntentId",
       pi.subject_id::text as "subjectId",
       po.product_id::text as "productId",
       spec.spec_version as "productSpecVersion",
       selection.reader_character_id as "readerCharacterId",
       selection.reader_content_bundle_id::text as "readerContentBundleId",
       revision.revision_key as "revisionKey",
       revision.notice_revision as "noticeRevision",
       revision.notice_sha256 as "noticeSha256",
       revision.preview_or_information_revision as "previewOrInformationRevision",
       revision.preview_or_information_sha256 as "previewOrInformationSha256",
       revision.authority_state as "authorityState"
from public.purchase_intents pi
join public.product_offers po on po.id=pi.product_offer_id
  and po.enabled=true and po.retired_at is null
join public.products product on product.id=po.product_id
  and product.enabled=true and product.retired_at is null
join public.purchase_intent_reader_selections selection
  on selection.purchase_intent_id=pi.id and selection.product_id=po.product_id
join public.standard_reading_product_specs spec
  on spec.product_id=po.product_id and spec.purchase_unit_mode='topic_reader_reading'
  and spec.retired_at is null
join public.digital_reading_checkout_notice_revisions_v1 revision
  on revision.product_id=po.product_id and revision.product_spec_version=spec.spec_version
  and revision.authority_state='approved' and revision.approved_at <= clock_timestamp()
where pi.id=$1::uuid and pi.subject_id=$2::uuid and pi.status='created'
  and not exists (select 1 from public.commerce_receipts receipt
                  where receipt.purchase_intent_id=pi.id)
  and not exists (select 1 from public.digital_reading_checkout_notice_presentations_v1 p
                  where p.purchase_intent_id=pi.id)
order by revision.approved_at desc, revision.revision_key
limit 2
`.trim();

const INSERT_PRESENTATION = `
insert into public.digital_reading_checkout_notice_presentations_v1 (
  purchase_intent_id, subject_id, unit_id, product_id, reader_character_id,
  reader_content_bundle_id, product_spec_version, revision_key,
  notice_revision, preview_or_information_revision, notice_sha256,
  preview_or_information_sha256, challenge_sha256, presentation_snapshot_sha256
) values (
  $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text,
  $6::uuid, $7::text, $8::text,
  $9::text, $10::text, $11::text, $12::text, $13::text, $14::text
)
returning
 purchase_intent_id::text as "purchaseIntentId",
 subject_id::text as "subjectId",
 unit_id::text as "unitId",
 product_id::text as "productId",
 reader_character_id as "readerCharacterId",
 reader_content_bundle_id::text as "readerContentBundleId",
 product_spec_version as "productSpecVersion",
 revision_key as "revisionKey",
 notice_revision as "noticeRevision",
 preview_or_information_revision as "previewOrInformationRevision",
 notice_sha256 as "noticeSha256",
 preview_or_information_sha256 as "previewOrInformationSha256",
 challenge_sha256 as "challengeSha256",
 presentation_snapshot_sha256 as "presentationSnapshotSha256",
 to_char(server_presented_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "serverPresentedAt"
`.trim();

const SELECT_ACK = `
select a.purchase_intent_id::text as "purchaseIntentId",
       a.subject_id::text as "subjectId", a.unit_id::text as "unitId",
       a.submitted_challenge_sha256 as "submittedChallengeSha256",
       a.acknowledged,
       to_char(a.server_acknowledged_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
         as "serverAcknowledgedAt"
from public.digital_reading_checkout_notice_acknowledgments_v1 a
where a.purchase_intent_id=$1::uuid and a.subject_id=$2::uuid and a.unit_id=$3::uuid
`.trim();

const INSERT_ACK = `
insert into public.digital_reading_checkout_notice_acknowledgments_v1(
 purchase_intent_id,subject_id,unit_id,submitted_challenge_sha256
) values($1::uuid,$2::uuid,$3::uuid,$4::text)
on conflict (purchase_intent_id) do nothing
returning purchase_intent_id::text as "purchaseIntentId",
          subject_id::text as "subjectId",unit_id::text as "unitId",
          submitted_challenge_sha256 as "submittedChallengeSha256",
          acknowledged,
          to_char(server_acknowledged_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
            as "serverAcknowledgedAt"
`.trim();

type SourceRow = {
  purchaseIntentId: unknown;
  subjectId: unknown;
  productId: unknown;
  productSpecVersion: unknown;
  readerCharacterId: unknown;
  readerContentBundleId: unknown;
  revisionKey: unknown;
  noticeRevision: unknown;
  noticeSha256: unknown;
  previewOrInformationRevision: unknown;
  previewOrInformationSha256: unknown;
  authorityState: unknown;
};

function rowMatches(write: DigitalReadingCheckoutNoticeAckWriteV1, row: unknown):
  row is DigitalReadingCheckoutNoticeAckRowV1 {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) return false;
  const record = row as Record<string, unknown>;
  return record.purchaseIntentId === write.purchaseIntentId &&
    record.subjectId === write.subjectId &&
    record.unitId === write.unitId &&
    record.submittedChallengeSha256 === write.submittedChallengeSha256 &&
    record.acknowledged === true &&
    typeof record.serverAcknowledgedAt === 'string';
}

export function createPostgresDigitalReadingCheckoutNoticeAuthorityPortV1(
  query: PostgresTransactionQueryV1,
): DigitalReadingCheckoutNoticeAuthorityPortV1 {
  return Object.freeze({
    async resolveApprovedNotice({ purchaseIntentId, subjectId }: { readonly purchaseIntentId: string; readonly subjectId: string }) {
      const found = await query.query<SourceRow>(SELECT_APPROVED_SOURCE, [purchaseIntentId,subjectId]);
      if (found.rows.length !== 1) return null;
      const row = found.rows[0]!;
      if (row.purchaseIntentId !== purchaseIntentId || row.subjectId !== subjectId ||
          row.authorityState !== 'approved') return null;
      const fields = [
        row.productId,row.productSpecVersion,row.readerCharacterId,row.readerContentBundleId,
        row.revisionKey,row.noticeRevision,row.noticeSha256,
        row.previewOrInformationRevision,row.previewOrInformationSha256,
      ];
      if (fields.some(v=>typeof v !== 'string' || v.trim().length===0)) return null;
      return {
        purchaseIntentId,
        subjectId,
        productId: row.productId as string,
        productSpecVersion: row.productSpecVersion as string,
        readerCharacterId: row.readerCharacterId as string,
        readerContentBundleId: row.readerContentBundleId as string,
        revisionKey: row.revisionKey as string,
        noticeRevision: row.noticeRevision as string,
        noticeSha256: row.noticeSha256 as string,
        previewOrInformationRevision: row.previewOrInformationRevision as string,
        previewOrInformationSha256: row.previewOrInformationSha256 as string,
        authorityState: 'approved' as const,
      };
    },
    async recordPresentation(p: DigitalReadingCheckoutNoticePresentationWriteV1):
      Promise<readonly DigitalReadingCheckoutNoticePresentationRowV1[]> {
      const values = [
        p.purchaseIntentId,p.subjectId,p.unitId,p.productId,p.readerCharacterId,
        p.readerContentBundleId,p.productSpecVersion,p.revisionKey,
        p.noticeRevision,p.previewOrInformationRevision,p.noticeSha256,
        p.previewOrInformationSha256,p.challengeSha256,p.presentationSnapshotSha256,
      ];
      const result = await query.query<DigitalReadingCheckoutNoticePresentationRowV1>(INSERT_PRESENTATION,values);
      return result.rows;
    },
    async recordAcknowledgment(p: DigitalReadingCheckoutNoticeAckWriteV1):
      Promise<readonly DigitalReadingCheckoutNoticeAckRowV1[]> {
      const where = [p.purchaseIntentId,p.subjectId,p.unitId] as const;
      // An already committed same-challenge acknowledgment is idempotent even
      // after payment. Never rewrite its original server timestamp.
      const existing = await query.query<DigitalReadingCheckoutNoticeAckRowV1>(SELECT_ACK, where);
      if (existing.rows.length > 1) throw new Error('Duplicate checkout acknowledgments.');
      if (existing.rows.length === 1) {
        if (!rowMatches(p,existing.rows[0])) {
          throw new Error('Checkout acknowledgment replay conflicts with immutable proof.');
        }
        return existing.rows;
      }
      const inserted = await query.query<DigitalReadingCheckoutNoticeAckRowV1>(
        INSERT_ACK,[...where,p.submittedChallengeSha256],
      );
      if (inserted.rows.length === 1) {
        if (!rowMatches(p,inserted.rows[0])) {
          throw new Error('Checkout acknowledgment write was not authority-matched.');
        }
        return inserted.rows;
      }
      if (inserted.rows.length !== 0) throw new Error('Checkout acknowledgment duplicate insert result.');
      // A concurrent contender inserted first. Same immutable proof may replay.
      const retry = await query.query<DigitalReadingCheckoutNoticeAckRowV1>(SELECT_ACK,where);
      if (retry.rows.length !== 1 || !rowMatches(p,retry.rows[0])) {
        throw new Error('Checkout acknowledgment conflict after concurrent retry.');
      }
      return retry.rows;
    },
  });
}
