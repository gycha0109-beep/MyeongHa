/**
 * Private, pre-activation checkout notice evidence for a single Standard Reading.
 *
 * Not a saleable checkout or legal attestation. No public HTTP route, payment,
 * refund decision, or ordinary API role grant is introduced here.
 * Browser-supplied notice revisions, timestamps, and checked flags are never
 * accepted as trusted snapshots. A server-issued, random challenge is required.
 */
import { createHash, randomBytes } from 'node:crypto';
import { canonicalJson } from '../../../packages/domain/src/index.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import type { DigitalReadingCheckoutNoticeV1 } from './commerce-digital-reading-withdrawal-review-v1.js';

export const DIGITAL_READING_CHECKOUT_NOTICE_EVIDENCE_V1 = Object.freeze({
  authority: 'server_checkout_snapshot',
  releaseState: 'PRIVATE_UNRELEASED',
  recordTables: Object.freeze([
    'public.digital_reading_checkout_notice_revisions_v1',
    'public.digital_reading_checkout_notice_presentations_v1',
    'public.digital_reading_checkout_notice_acknowledgments_v1',
  ]),
  publicCheckoutRoute: null,
  automaticRefundDenial: false,
} as const);

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const HEX64 = /^[a-f0-9]{64}$/u;

type TrustedApprovedNoticeV1 = Readonly<{
  purchaseIntentId: string;
  subjectId: string;
  productId: string;
  productSpecVersion: string;
  readerCharacterId: string;
  readerContentBundleId: string;
  revisionKey: string;
  noticeRevision: string;
  noticeSha256: string;
  previewOrInformationRevision: string;
  previewOrInformationSha256: string;
  authorityState: 'approved';
}>;

export interface DigitalReadingCheckoutNoticeAuthorityPortV1 {
  /** All fields come from an approved server-side DB catalog and Reader/Intent resolver. */
  resolveApprovedNotice(input: {
    readonly purchaseIntentId: string;
    readonly subjectId: string;
  }): Promise<TrustedApprovedNoticeV1 | null>;
  /** The database verifies immutable Intent/Reader/approved revision identity. */
  recordPresentation(input: DigitalReadingCheckoutNoticePresentationWriteV1):
    Promise<readonly DigitalReadingCheckoutNoticePresentationRowV1[]>;
  /** The database verifies subject, nonce digest, receipt absence and chronology. */
  recordAcknowledgment(input: DigitalReadingCheckoutNoticeAckWriteV1):
    Promise<readonly DigitalReadingCheckoutNoticeAckRowV1[]>;
}

export interface DigitalReadingCheckoutNoticePresentationWriteV1 {
  readonly purchaseIntentId: string;
  readonly subjectId: string;
  readonly unitId: string;
  readonly productId: string;
  readonly readerCharacterId: string;
  readonly readerContentBundleId: string;
  readonly productSpecVersion: string;
  readonly revisionKey: string;
  readonly noticeRevision: string;
  readonly previewOrInformationRevision: string;
  readonly noticeSha256: string;
  readonly previewOrInformationSha256: string;
  readonly challengeSha256: string;
  readonly presentationSnapshotSha256: string;
}

export type DigitalReadingCheckoutNoticePresentationRowV1 =
  DigitalReadingCheckoutNoticePresentationWriteV1 & Readonly<{
    readonly serverPresentedAt: string;
  }>;

export interface DigitalReadingCheckoutNoticeAckWriteV1 {
  readonly purchaseIntentId: string;
  readonly subjectId: string;
  readonly unitId: string;
  readonly submittedChallengeSha256: string;
}

export type DigitalReadingCheckoutNoticeAckRowV1 =
  DigitalReadingCheckoutNoticeAckWriteV1 & Readonly<{
    readonly acknowledged: true;
    readonly serverAcknowledgedAt: string;
  }>;

function required(name: string, value: unknown, max = 160): string {
  if (typeof value !== 'string' || value.trim() !== value ||
      value.length === 0 || value.length > max) {
    throw new Error(`Checkout notice ${name} is invalid.`);
  }
  return value;
}

function uuid(name: string, value: unknown): string {
  const text = required(name, value, 36);
  if (!UUID.test(text)) throw new Error(`Checkout notice ${name} is invalid.`);
  return text;
}

function sha(name: string, value: unknown): string {
  const text = required(name, value, 64);
  if (!HEX64.test(text)) throw new Error(`Checkout notice ${name} is invalid.`);
  return text;
}

function instant(name: string, value: unknown): string {
  const text = required(name, value, 64);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(text) ||
      !Number.isFinite(Date.parse(text))) {
    throw new Error(`Checkout notice ${name} is invalid.`);
  }
  return text;
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function challengeDigest(token: string): string {
  return createHash('sha256').update(Buffer.from(token, 'hex')).digest('hex');
}

function approved(input: TrustedApprovedNoticeV1 | null, subjectId: string, intentId: string) {
  if (input === null || input.authorityState !== 'approved' ||
      input.subjectId !== subjectId || input.purchaseIntentId !== intentId) {
    throw new Error('Checkout notice approved source authority is missing or mismatched.');
  }
  uuid('approved product', input.productId);
  uuid('approved Reader bundle', input.readerContentBundleId);
  required('approved Reader', input.readerCharacterId);
  required('approved spec', input.productSpecVersion);
  required('approved revision', input.revisionKey);
  required('approved notice revision', input.noticeRevision);
  required('approved preview revision', input.previewOrInformationRevision);
  sha('approved notice SHA', input.noticeSha256);
  sha('approved preview SHA', input.previewOrInformationSha256);
  return input;
}

/** Called only after server authentication and approved exact Product/Reader resolution. */
export async function issueDigitalReadingCheckoutNoticePresentationV1(input: {
  readonly resolvedSubjectId: string;
  readonly purchaseIntentId: string;
  readonly authorityPort: DigitalReadingCheckoutNoticeAuthorityPortV1;
  readonly nextUnitId: () => string;
}): Promise<Readonly<{
  purchaseIntentId: string;
  unitId: string;
  noticeRevision: string;
  previewOrInformationRevision: string;
  /** One-time bearer proof sent with the approved notice, never logged or stored as raw data. */
  acknowledgmentChallenge: string;
}>> {
  const subjectId = uuid('subject', input.resolvedSubjectId);
  const purchaseIntentId = uuid('Purchase Intent', input.purchaseIntentId);
  const source = approved(
    await input.authorityPort.resolveApprovedNotice({ subjectId, purchaseIntentId }),
    subjectId,
    purchaseIntentId,
  );
  const unitId = uuid('issued unit', input.nextUnitId());
  const challenge = randomBytes(32).toString('hex');
  const immutable: DigitalReadingCheckoutNoticePresentationWriteV1 = Object.freeze({
    purchaseIntentId,
    subjectId,
    unitId,
    productId: source.productId,
    readerCharacterId: source.readerCharacterId,
    readerContentBundleId: source.readerContentBundleId,
    productSpecVersion: source.productSpecVersion,
    revisionKey: source.revisionKey,
    noticeRevision: source.noticeRevision,
    previewOrInformationRevision: source.previewOrInformationRevision,
    noticeSha256: source.noticeSha256,
    previewOrInformationSha256: source.previewOrInformationSha256,
    challengeSha256: challengeDigest(challenge),
    presentationSnapshotSha256: digest({
      purchaseIntentId, subjectId, unitId,
      productId: source.productId,
      readerCharacterId: source.readerCharacterId,
      readerContentBundleId: source.readerContentBundleId,
      productSpecVersion: source.productSpecVersion,
      revisionKey: source.revisionKey,
      noticeRevision: source.noticeRevision,
      previewOrInformationRevision: source.previewOrInformationRevision,
      noticeSha256: source.noticeSha256,
      previewOrInformationSha256: source.previewOrInformationSha256,
      challengeSha256: challengeDigest(challenge),
    }),
  });
  const rows = await input.authorityPort.recordPresentation(immutable);
  if (rows.length !== 1) throw new Error('Checkout notice was not durably issued once.');
  const row = rows[0]!;
  for (const key of Object.keys(immutable) as Array<keyof DigitalReadingCheckoutNoticePresentationWriteV1>) {
    if (row[key] !== immutable[key]) throw new Error('Checkout notice persisted presentation drift.');
  }
  instant('server presentation time', row.serverPresentedAt);
  return Object.freeze({
    purchaseIntentId,
    unitId,
    noticeRevision: source.noticeRevision,
    previewOrInformationRevision: source.previewOrInformationRevision,
    acknowledgmentChallenge: challenge,
  });
}

/** The client submits a signal and issued nonce, NOT a server snapshot or a timestamp. */
export async function acknowledgeDigitalReadingCheckoutNoticeV1(input: {
  readonly resolvedSubjectId: string;
  readonly request: unknown;
  readonly authorityPort: DigitalReadingCheckoutNoticeAuthorityPortV1;
}): Promise<Readonly<{ readonly acknowledged: true }>> {
  const subjectId = uuid('subject', input.resolvedSubjectId);
  if (typeof input.request !== 'object' || input.request === null || Array.isArray(input.request)) {
    throw new Error('Checkout acknowledgment request invalid.');
  }
  const body = input.request as Record<string, unknown>;
  const keys = Object.keys(body).sort();
  if (keys.join(',') !== 'acknowledged,acknowledgmentChallenge,purchaseIntentId,unitId' ||
      body.acknowledged !== true) {
    throw new Error('Checkout acknowledgment requires the exact explicit signal and challenge.');
  }
  const purchaseIntentId = uuid('Purchase Intent', body.purchaseIntentId);
  const unitId = uuid('unit', body.unitId);
  const challenge = sha('one-time challenge', body.acknowledgmentChallenge);
  const write = Object.freeze({
    purchaseIntentId, subjectId, unitId,
    submittedChallengeSha256: challengeDigest(challenge),
  });
  const rows = await input.authorityPort.recordAcknowledgment(write);
  if (rows.length !== 1) throw new Error('Checkout acknowledgment not durably confirmed.');
  const row = rows[0]!;
  if (row.acknowledged !== true ||
      row.purchaseIntentId !== purchaseIntentId ||
      row.subjectId !== subjectId ||
      row.unitId !== unitId ||
      row.submittedChallengeSha256 !== write.submittedChallengeSha256) {
    throw new Error('Checkout acknowledgment durable authority mismatch.');
  }
  instant('server acknowledgment time', row.serverAcknowledgedAt);
  return Object.freeze({ acknowledged: true });
}

/**
 * Read-only, server-owned evidence adapter: output can be passed to the
 * withdrawal reviewer ONLY after verified receipt and same-unit joins succeed.
 * Ordinary API executor has no table grants until separate release approval.
 */
export async function loadVerifiedDigitalReadingCheckoutNoticeV1(
  query: PostgresTransactionQueryV1,
  input: Readonly<{
    resolvedSubjectId: string;
    purchaseIntentId: string;
    unitId: string;
    productSpecVersion: string;
  }>,
): Promise<DigitalReadingCheckoutNoticeV1 | null> {
  const subjectId = uuid('subject', input.resolvedSubjectId);
  const purchaseIntentId = uuid('Purchase Intent', input.purchaseIntentId);
  const unitId = uuid('unit', input.unitId);
  const spec = required('spec', input.productSpecVersion);
  const result = await query.query<{
    purchaseIntentId: unknown;
    unitId: unknown;
    productSpecVersion: unknown;
    noticeRevision: unknown;
    previewOrInformationRevision: unknown;
  }>(`
select p.purchase_intent_id::text as "purchaseIntentId",
       p.unit_id::text as "unitId",
       p.product_spec_version as "productSpecVersion",
       p.notice_revision as "noticeRevision",
       p.preview_or_information_revision as "previewOrInformationRevision"
from public.digital_reading_checkout_notice_presentations_v1 p
join public.digital_reading_checkout_notice_acknowledgments_v1 a
  on a.purchase_intent_id=p.purchase_intent_id and a.unit_id=p.unit_id
  and a.subject_id=p.subject_id and a.submitted_challenge_sha256=p.challenge_sha256
join public.digital_reading_checkout_notice_revisions_v1 r
  on r.revision_key=p.revision_key and r.product_id=p.product_id
  and r.product_spec_version=p.product_spec_version and r.authority_state='approved'
  and r.approved_at <= p.server_presented_at
  and r.notice_sha256=p.notice_sha256
  and r.preview_or_information_sha256=p.preview_or_information_sha256
join public.purchase_intents pi
  on pi.id=p.purchase_intent_id and pi.subject_id=p.subject_id
join public.product_offers po on po.id=pi.product_offer_id and po.product_id=p.product_id
join public.purchase_intent_reader_selections sel
  on sel.purchase_intent_id=p.purchase_intent_id and sel.product_id=p.product_id
  and sel.reader_character_id=p.reader_character_id
  and sel.reader_content_bundle_id=p.reader_content_bundle_id
join public.commerce_receipts receipt
  on receipt.purchase_intent_id=p.purchase_intent_id
  and receipt.subject_id=p.subject_id and receipt.product_offer_id=pi.product_offer_id
  and receipt.verification_status='verified'
  and receipt.verified_at > a.server_acknowledged_at
where p.purchase_intent_id=$1::uuid and p.subject_id=$2::uuid
  and p.unit_id=$3::uuid and p.product_spec_version=$4::text
  and a.acknowledged=true and a.server_acknowledged_at > p.server_presented_at
limit 2
`.trim(), [purchaseIntentId, subjectId, unitId, spec]);
  if (result.rows.length !== 1) return null;
  const row = result.rows[0]!;
  if (row.purchaseIntentId !== purchaseIntentId || row.unitId !== unitId ||
      row.productSpecVersion !== spec ||
      typeof row.noticeRevision !== 'string' || !row.noticeRevision.trim() ||
      typeof row.previewOrInformationRevision !== 'string' || !row.previewOrInformationRevision.trim()) {
    return null;
  }
  return Object.freeze({
    authority: 'server_checkout_snapshot',
    purchaseIntentId,
    unitId,
    productSpecVersion: spec,
    noticeRevision: row.noticeRevision,
    previewOrInformationRevision: row.previewOrInformationRevision,
    acknowledged: true,
  });
}
