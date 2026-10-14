/**
 * Test-only adapter for candidate 1910 private SQL. Never import from API runtime.
 * No production privileges are granted; injected query must be inside a caller
 * owned READ COMMITTED transaction that commits before acknowledgement.
 */
import type { PostgresTransactionQueryV1 } from '../../apps/api/src/postgres-subject-execution.js';
import type {
  OfficialReaderCancelInboxRecorderV1,
  OfficialReaderCancelInboxSignedEnvelopeV1,
} from '../../apps/api/src/official-reader-portone-cancel-inbox-private-v1.js';

const PRIVATE_SQL = [
  'select intake_result as "intakeResult", effect_authorized as "effectAuthorized"',
  'from public.internal_enqueue_official_reader_portone_cancel_inbox_v1(',
  '$1::text,$2::text,$3::text,$4::text,$5::text,$6::text,',
  '$7::text,$8::timestamptz,$9::text)',
].join(' ');

export function createPrivateOfficialReaderCancelInboxRecorderTestV1(
  client: PostgresTransactionQueryV1,
): OfficialReaderCancelInboxRecorderV1 {
  return Object.freeze({
    async enqueueSigned(input: OfficialReaderCancelInboxSignedEnvelopeV1) {
      const result = await client.query<{
        intakeResult: unknown;
        effectAuthorized: unknown;
      }>(PRIVATE_SQL, [
        input.environment, input.webhookId, input.paymentId,
        input.transactionId, input.storeId, input.cancellationId,
        input.eventType, input.eventOccurredAt, input.ingressFingerprint,
      ]);
      const row = result.rows[0];
      if (result.rows.length !== 1
        || (row?.intakeResult !== 'queued' && row?.intakeResult !== 'replayed')
        || row?.effectAuthorized !== false) {
        throw new Error('Private cancellation inbox SQL returned invalid no-effect result.');
      }
      return Object.freeze({
        intakeResult: row.intakeResult,
        effectAuthorized: false as const,
      });
    },
  });
}
