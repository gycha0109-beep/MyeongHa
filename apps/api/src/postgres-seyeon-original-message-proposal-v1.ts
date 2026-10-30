// Watchtower-Track: security
// Staged S0 producer: identifiers only. The DB Owner copies the exact
// committed user Message; no caller/model-supplied summary may be persisted.
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

export const SEYEON_ORIGINAL_MESSAGE_PROPOSAL_RPC_V1 =
  'seyeon_private.cmd_propose_seyeon_original_message_v1' as const;

export interface SeyeonOriginalMessageProposalInputV1 {
  readonly subjectId: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly messageId: string;
  readonly proposalId: string;
}

export interface SeyeonOriginalMessageProposalReceiptV1 {
  readonly proposalId: string;
  readonly proposalState: 'pending';
  readonly replayed: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SQL = `select proposal_id::text as "proposalId",
  proposal_state as "proposalState",replayed
  from seyeon_private.cmd_propose_seyeon_original_message_v1(
    $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid)`;

export class SeyeonOriginalMessageProposalHoldV1 extends Error {
  readonly code = 'SEYEON_ORIGINAL_MESSAGE_PROPOSAL_UNAVAILABLE' as const;
  constructor() {
    super('An approved original-message proposal is unavailable.');
    this.name = 'SeyeonOriginalMessageProposalHoldV1';
  }
}

export async function proposeSeyeonOriginalUserMessageV1(
  client: PostgresTransactionQueryV1,
  input: SeyeonOriginalMessageProposalInputV1,
): Promise<SeyeonOriginalMessageProposalReceiptV1> {
  if (![input.subjectId,input.threadId,input.turnId,input.messageId,input.proposalId]
    .every(value => typeof value === 'string' && UUID.test(value))) {
    throw new SeyeonOriginalMessageProposalHoldV1();
  }
  const result = await client.query<{
    proposalId: unknown;proposalState: unknown;replayed: unknown;
  }>(SQL,[input.subjectId,input.threadId,input.turnId,input.messageId,input.proposalId]);
  const row = result.rows[0];
  if (result.rows.length !== 1 || row?.proposalId !== input.proposalId ||
      row.proposalState !== 'pending' || typeof row.replayed !== 'boolean') {
    throw new SeyeonOriginalMessageProposalHoldV1();
  }
  return Object.freeze({
    proposalId: input.proposalId,proposalState:'pending',replayed:row.replayed,
  });
}
