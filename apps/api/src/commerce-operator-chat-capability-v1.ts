import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

export interface OperatorChatCapabilityV1 {
  readonly freeChat: boolean;
  readonly sandboxCheckout: boolean;
}

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const QUERY = 'select free_chat_enabled as "freeChat", sandbox_checkout_enabled as "sandboxCheckout" from public.qry_operator_chat_test_capability_v1($1::uuid)';

export async function readOperatorChatCapabilityV1(
  client: PostgresTransactionQueryV1,
  subjectId: string,
): Promise<OperatorChatCapabilityV1> {
  if (!UUID.test(subjectId)) throw Error('Invalid verified member identity');
  const result = await client.query<{freeChat: unknown; sandboxCheckout: unknown}>(
    QUERY, [subjectId.toLowerCase()],
  );
  const row = result.rows[0];
  if (result.rows.length !== 1 ||
      typeof row?.freeChat !== 'boolean' ||
      typeof row?.sandboxCheckout !== 'boolean') {
    throw Error('Operator capability lookup failed');
  }
  return Object.freeze({freeChat: row.freeChat, sandboxCheckout: row.sandboxCheckout});
}
