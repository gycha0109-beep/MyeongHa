/**
 * Offline test-only adapter for 1860. Never import from production runtime.
 * Existing static writer guard forbids application direct SQL to private fn.
 */
import type { PostgresTransactionQueryV1 } from '../../apps/api/src/postgres-subject-execution.js';
import type {
  OfficialReaderCancelObservationInputV1,
  OfficialReaderCancelObservationRecorderV1,
} from '../../apps/api/src/official-reader-portone-cancel-observation-bridge-v1.js';

const PRIVATE_SQL = [
  'select shadow_result as "shadowResult", effect_authorized as "effectAuthorized"',
  'from public.internal_record_official_reader_portone_cancel_shadow_v1(',
  '$1::text,$2::text,$3::text,$4::text,$5::text,$6::text,',
  '$7::timestamptz,$8::timestamptz,$9::bigint,$10::bigint,$11::text,$12::text)',
].join(' ');

export function createPrivateOfficialReaderCancelObservationRecorderTestV1(
  client: PostgresTransactionQueryV1,
): OfficialReaderCancelObservationRecorderV1 {
  return Object.freeze({
    async recordVerified(input: OfficialReaderCancelObservationInputV1) {
      const result = await client.query<{
        shadowResult: unknown;
        effectAuthorized: unknown;
      }>(PRIVATE_SQL, [
        input.webhookId, input.paymentId, input.transactionId,
        input.cancellationId, input.eventType, input.sourceDisposition,
        input.eventOccurredAt, input.providerStatusChangedAt,
        input.paidAmountMinor, input.cancelledAmountMinor,
        input.currency, input.evidenceFingerprint,
      ]);
      const row = result.rows[0];
      if (result.rows.length !== 1
        || !['observed', 'out_of_order', 'ordering_unproven', 'replayed'].includes(
          row?.shadowResult as string,
        )
        || row?.effectAuthorized !== false) {
        throw new Error('Private cancellation observation returned an invalid no-effect result.');
      }
      return Object.freeze({
        shadowResult: row.shadowResult as 'observed' | 'out_of_order' | 'ordering_unproven' | 'replayed',
        effectAuthorized: false as const,
      });
    },
  });
}
