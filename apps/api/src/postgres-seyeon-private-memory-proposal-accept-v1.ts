// Watchtower-Track: security
// Actual Subject-scoped, private-only Memory proposal acceptance DB port.
// Unmounted and unprivileged: this is NOT authorization for production writes.
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

export const SEYEON_PRIVATE_MEMORY_PROPOSAL_ACCEPT_RPC_V1 =
  'public.cmd_accept_seyeon_private_conversation_recall_proposal_v1' as const;

export interface SeyeonPrivateMemoryProposalAcceptInputV1 {
  readonly subjectId: string; // Verified canonical Member Subject from the DB runner
  readonly proposalId: string;
  readonly memoryItemId: string; // Server-allocated fresh UUID
  readonly grantChoice: Readonly<{ mode: 'private' }>; // Exactly zero character grants
}

export interface SeyeonPrivateMemoryProposalAcceptedV1 {
  readonly memoryItemId: string;
  readonly grantCount: 0;
  readonly replayed: false;
}

export class SeyeonPrivateMemoryProposalAcceptHoldV1 extends Error {
  readonly code = 'SEYEON_PRIVATE_MEMORY_ACCEPT_UNAUTHORIZED' as const;
  constructor() {
    super('Private conversation-recall Memory acceptance is not authorized.');
    this.name = 'SeyeonPrivateMemoryProposalAcceptHoldV1';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

// DB Owner locks Member BEFORE the original Proposal and validates the exact
// versioned JSON codec and pending source Turn INSIDE the same INSERT/UPDATE
// transaction. The API role cannot read raw memory_proposals or payloads.
// Returning only the committed identifiers and zero-Grant receipt avoids
// sending private text from PostgreSQL to the API process.
const ACCEPT_SQL = `
select
  memory_item_id::text as "memoryItemId",
  grant_count as "grantCount",
  replayed
from public.cmd_accept_seyeon_private_conversation_recall_proposal_v1(
  $1::uuid,$2::uuid,$3::uuid
)
`.trim();

type ReceiptRow = Readonly<{
  memoryItemId: unknown;
  grantCount: unknown;
  replayed: unknown;
}>;

/**
 * Caller owns ONE verified canonical Member Subject transaction. The
 * Security Definer SQL command alone decides original Proposal ownership,
 * immutable schema, canonical source and pending->accepted transition.
 * No SELECT-before-Owner or caller-supplied JSON digest: no stale/forged
 * authority, inverted lock order or API role's direct personal-data access.
 */
export async function acceptSeyeonPrivateConversationRecallProposalV1(
  client: PostgresTransactionQueryV1,
  input: SeyeonPrivateMemoryProposalAcceptInputV1,
): Promise<SeyeonPrivateMemoryProposalAcceptedV1> {
  if (!UUID.test(input.subjectId) || !UUID.test(input.proposalId) ||
      !UUID.test(input.memoryItemId) ||
      input.grantChoice === null || typeof input.grantChoice !== 'object' ||
      Array.isArray(input.grantChoice) ||
      Object.keys(input.grantChoice).length !== 1 ||
      input.grantChoice.mode !== 'private') {
    throw new SeyeonPrivateMemoryProposalAcceptHoldV1();
  }

  const result = await client.query<ReceiptRow>(ACCEPT_SQL, [
    input.subjectId, input.proposalId, input.memoryItemId,
  ]);
  const accepted = result.rows[0];
  if (result.rows.length !== 1 || accepted === undefined ||
      accepted.memoryItemId !== input.memoryItemId ||
      accepted.grantCount !== 0 ||
      accepted.replayed !== false) {
    throw new SeyeonPrivateMemoryProposalAcceptHoldV1();
  }
  return Object.freeze({
    memoryItemId: input.memoryItemId,
    grantCount: 0 as const,
    replayed: false as const,
  });
}
