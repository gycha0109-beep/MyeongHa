import { ApiCommandError } from './api-error.js';
import type { PostgresSubjectExecutionScopeV1 } from './postgres-subject-execution.js';

/** L4 checkout gate; never accepts browser confirmation as paid authority. */
export const OWNED_DIGITAL_READING_CHECKOUT_READY_SQL_V1 =
  'public.qry_legal_digital_reading_checkout_ready_v1' as const;

export interface DigitalReadingCheckoutAdmissionPortV1 {
  admit(input: Readonly<{
    scope: PostgresSubjectExecutionScopeV1;
    purchaseIntentId: string;
  }>): Promise<boolean>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const QUERY = `
select public.qry_legal_digital_reading_checkout_ready_v1(
  $1::uuid,$2::uuid) as "ready"
`.trim();

type ReadyRow = Readonly<{ ready?: unknown }>;

/**
 * Executes in the already-bound, exact canonical Subject transaction.
 * DB function locks the owned Purchase Intent until the same transaction's
 * Payment Attempt creation commits, preventing a stale notice TOCTOU window.
 */
export function createPostgresDigitalReadingCheckoutAdmissionPortV1():
DigitalReadingCheckoutAdmissionPortV1 {
  return Object.freeze({
    async admit({ scope, purchaseIntentId }: Parameters<DigitalReadingCheckoutAdmissionPortV1['admit']>[0]) {
      if (!UUID.test(purchaseIntentId)) {
        throw new ApiCommandError('INVALID_REQUEST', 'Checkout Purchase Intent is invalid.');
      }
      const { rows } = await scope.client.query<ReadyRow>(QUERY, [
        scope.resolvedSubject.subjectId,
        purchaseIntentId.toLowerCase(),
      ]);
      if (rows.length !== 1 || typeof rows[0]?.ready !== 'boolean') {
        throw new Error('Checkout admission authority returned malformed proof.');
      }
      return rows[0].ready;
    },
  });
}
