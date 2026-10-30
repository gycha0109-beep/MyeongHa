// Watchtower-Track: security
// DB Owner-backed, explicit consent for one accepted S0 original Memory.
// This adapter is NOT an HTTP route or a release/ACL authorization.
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

export const SEYEON_OWNED_ORIGINAL_MEMORY_GRANT_RPC_V1 =
  'public.cmd_grant_seyeon_owned_conversation_recall_v1' as const;

export interface CreateSeyeonOwnedOriginalGrantInputV1 {
  readonly subjectId: string; // DB-resolved, verified canonical Member
  readonly memoryItemId: string;
  readonly grantId: string; // Fresh server-issued identifier
  readonly grantChoice: Readonly<{
    mode: 'character_only';
    characterId: 'seyeon';
  }>;
}

export interface SeyeonOwnedOriginalGrantReceiptV1 {
  readonly memoryItemId: string;
  readonly grantId: string;
  readonly characterId: 'seyeon';
  readonly replayed: false;
}

export class SeyeonOwnedOriginalGrantHoldV1 extends Error {
  readonly code = 'SEYEON_ORIGINAL_GRANT_AUTHORITY_UNAVAILABLE' as const;
  constructor() {
    super('The original Memory Grant has not been authorized.');
    this.name = 'SeyeonOwnedOriginalGrantHoldV1';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const GRANT_SQL = `
select memory_item_id::text as "memoryItemId",
       grant_id::text as "grantId",
       character_id as "characterId",
       replayed
from public.cmd_grant_seyeon_owned_conversation_recall_v1(
  $1::uuid,$2::uuid,$3::uuid
)
`.trim();

export async function createSeyeonOwnedOriginalGrantV1(
  client: PostgresTransactionQueryV1,
  input: CreateSeyeonOwnedOriginalGrantInputV1,
): Promise<SeyeonOwnedOriginalGrantReceiptV1> {
  const choice = input.grantChoice;
  if (!UUID.test(input.subjectId) || !UUID.test(input.memoryItemId) ||
      !UUID.test(input.grantId) || !choice ||
      typeof choice !== 'object' || Array.isArray(choice) ||
      Object.keys(choice).length !== 2 ||
      choice.mode !== 'character_only' ||
      choice.characterId !== 'seyeon') {
    throw new SeyeonOwnedOriginalGrantHoldV1();
  }
  const result = await client.query<{
    memoryItemId: unknown;
    grantId: unknown;
    characterId: unknown;
    replayed: unknown;
  }>(GRANT_SQL, [input.subjectId, input.memoryItemId, input.grantId]);
  if (result.rows.length !== 1 ||
      result.rows[0]?.memoryItemId !== input.memoryItemId ||
      result.rows[0]?.grantId !== input.grantId ||
      result.rows[0]?.characterId !== 'seyeon' ||
      result.rows[0]?.replayed !== false) {
    throw new SeyeonOwnedOriginalGrantHoldV1();
  }
  return Object.freeze({
    memoryItemId: input.memoryItemId,
    grantId: input.grantId,
    characterId: 'seyeon',
    replayed: false,
  });
}
