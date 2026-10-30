/**
 * Operations-only, read-only evidence for a future Digital Reading complaint.
 *
 * A trusted, RLS-complete operations connection is mandatory: the checkout
 * notice tables intentionally grant no SELECT to the public/API executor.
 * No new DB privileges or public route are established by this adapter.
 *
 * An immutable purchased unit is established by the exact checkout presentation
 * and reader selection plus a server-verified PRODUCTION payment. It is not an
 * Entitlement/Reader-delivery authority, a refunded status decision, or a
 * customer-facing receipt of an intake request.
 */
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import {
  loadVerifiedDigitalReadingCheckoutNoticeV1,
} from './digital-reading-checkout-notice-evidence-v1.js';
import type {
  DigitalReadingWithdrawalEvidencePortV1,
  OwnedDigitalReadingPurchaseV1,
} from './commerce-digital-reading-withdrawal-review-preflight-v1.js';

export const POSTGRES_DIGITAL_READING_WITHDRAWAL_EVIDENCE_PRIVATE_V1 = Object.freeze({
  intendedRole: 'trusted_operations_read_only',
  publicRouteMounted: false,
  writesPerformed: false,
  deliveryAuthorityAvailable: false,
  providerRefundEnabled: false,
} as const);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
type PurchaseRow = Readonly<{
  subjectId: unknown;
  purchaseIntentId: unknown;
  unitId: unknown;
  productSpecVersion: unknown;
}>;

/**
 * Deliberately not keyed by client price, Reader choice, provider status or
 * client-selected Subject. A verified Receipt's provider + production
 * environment + money must match the immutable Purchase Intent.
 *
 * A historical approved notice presentation is the only established
 * purchase-unit identity in this candidate. No presentation = no asserted
 * exact unit (an eventual general claim-intake route must be designed separately).
 */
const READ_EXACT_PAID_UNIT_SQL = `
select
  pi.subject_id::text as "subjectId",
  pi.id::text as "purchaseIntentId",
  presentation.unit_id::text as "unitId",
  spec.spec_version as "productSpecVersion"
from public.purchase_intents pi
join public.product_offers offer
  on offer.id = pi.product_offer_id
join public.standard_reading_product_specs spec
  on spec.product_id = offer.product_id
  and spec.purchase_unit_mode = 'topic_reader_reading'
join public.purchase_intent_reader_selections selection
  on selection.purchase_intent_id = pi.id
  and selection.product_id = offer.product_id
join public.digital_reading_checkout_notice_presentations_v1 presentation
  on presentation.purchase_intent_id = pi.id
  and presentation.subject_id = pi.subject_id
  and presentation.product_id = offer.product_id
  and presentation.product_spec_version = spec.spec_version
  and presentation.reader_character_id = selection.reader_character_id
  and presentation.reader_content_bundle_id = selection.reader_content_bundle_id
join public.commerce_receipts receipt
  on receipt.purchase_intent_id = pi.id
  and receipt.subject_id = pi.subject_id
  and receipt.product_offer_id = pi.product_offer_id
  and receipt.provider = 'portone_v2'
  and receipt.platform = 'web'
  and receipt.environment = 'production'
  and receipt.verification_status = 'verified'
  and receipt.verified_at is not null
  and receipt.verified_at > presentation.server_presented_at
  and receipt.verified_amount_minor = pi.expected_amount_minor
  and receipt.verified_currency = pi.expected_currency
where pi.id = $1::uuid
  and pi.subject_id = $2::uuid
  and presentation.unit_id = $3::uuid
  and pi.status = 'verified'
  and pi.expected_amount_minor > 0
  and pi.expected_currency is not null
limit 2
`.trim();

export function createPostgresDigitalReadingWithdrawalEvidencePrivateV1(
  client: PostgresTransactionQueryV1,
): DigitalReadingWithdrawalEvidencePortV1 {
  const port: DigitalReadingWithdrawalEvidencePortV1 = Object.freeze({
    async readOwnedVerifiedPurchase(input: { readonly subjectId: string; readonly purchaseIntentId: string; readonly unitId: string }) {
      if (!UUID.test(input.subjectId) || !UUID.test(input.purchaseIntentId) ||
          !UUID.test(input.unitId)) return null;

      const result = await client.query<PurchaseRow>(READ_EXACT_PAID_UNIT_SQL, [
        input.purchaseIntentId, input.subjectId, input.unitId,
      ]);
      if (result.rows.length !== 1) return null;
      const row = result.rows[0]!;
      if (row.subjectId !== input.subjectId ||
          row.purchaseIntentId !== input.purchaseIntentId ||
          row.unitId !== input.unitId ||
          typeof row.productSpecVersion !== 'string' ||
          !row.productSpecVersion.trim() ||
          row.productSpecVersion.length > 256) return null;
      return Object.freeze({
        subjectId: input.subjectId,
        purchaseIntentId: input.purchaseIntentId,
        unitId: input.unitId,
        productSpecVersion: row.productSpecVersion,
        status: 'verified',
      }) satisfies OwnedDigitalReadingPurchaseV1;
    },
    async readCheckoutNotice(purchase: OwnedDigitalReadingPurchaseV1) {
      return loadVerifiedDigitalReadingCheckoutNoticeV1(client, {
        resolvedSubjectId: purchase.subjectId,
        purchaseIntentId: purchase.purchaseIntentId,
        unitId: purchase.unitId,
        productSpecVersion: purchase.productSpecVersion,
      });
    },
    async readDeliveryEvidence() {
      // No durable consumer-delivery table/source has been approved.
      // Never synthesize DELIVERED_PROVABLE from T2, grant or HTTP intent.
      return null;
    },
  });
  return port;
}
