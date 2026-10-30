// Watchtower-Track: security
// Internal UC-06 Planner Producer: DB Owner validates the committed Se-yeon
// reply and exact original User quote. No browser selected message may call
// this directly. No Memory/Grant is created before UC-07 Member consent.
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONTROL = /[\u0000-\u001f\u007f]/u;

export const SEYEON_PLANNER_MEMORY_PRODUCER_DB_V1 = Object.freeze({
  dbFunction: 'seyeon_private.cmd_create_pending_seyeon_planner_memory_v1',
  productionMounted: false,
  ordinaryApiExecuteGranted: false,
  grantsCreated: 0,
  memoriesCreated: 0,
} as const);

export class SeyeonPlannerMemoryProducerHoldV1 extends Error {
  readonly code = 'SEYEON_PLANNER_MEMORY_PRODUCER_UNAVAILABLE' as const;
  constructor() {
    super('A committed character turn and grounded server Planner proposal are required.');
    this.name = 'SeyeonPlannerMemoryProducerHoldV1';
  }
}

export interface ServerSeyeonPlannerFactCandidateV1 {
  readonly summary: string;
  /** Verbatim excerpt from the current committed User Message, never stored
   * in the Memory Proposal; DB checks it against the original source row. */
  readonly userEvidenceQuote: string;
}

const SQL = `
select proposal_id::text as "proposalId",
       proposal_state as "proposalState",
       replayed
from seyeon_private.cmd_create_pending_seyeon_planner_memory_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::text,$7::text
)`.trim();

export async function createPendingSeyeonPlannerMemoryProposalV1(
  client: PostgresTransactionQueryV1,
  input: Readonly<{
    canonicalMemberSubjectId: string;
    proposalId: string;
    turnId: string;
    assistantMessageId: string;
    userMessageId: string;
    candidate: ServerSeyeonPlannerFactCandidateV1;
  }>,
): Promise<Readonly<{
  proposalId: string;
  proposalState: 'pending';
  replayed: boolean;
}>> {
  const { candidate } = input;
  if (!UUID.test(input.canonicalMemberSubjectId) ||
      !UUID.test(input.proposalId) || !UUID.test(input.turnId) ||
      !UUID.test(input.assistantMessageId) || !UUID.test(input.userMessageId) ||
      input.assistantMessageId === input.userMessageId ||
      !candidate || typeof candidate !== 'object' || Array.isArray(candidate) ||
      Object.keys(candidate).length !== 2 ||
      typeof candidate.summary !== 'string' ||
      candidate.summary.length < 1 || candidate.summary.length > 4000 ||
      candidate.summary.trim() !== candidate.summary || CONTROL.test(candidate.summary) ||
      typeof candidate.userEvidenceQuote !== 'string' ||
      candidate.userEvidenceQuote.length < 4 ||
      candidate.userEvidenceQuote.length > 1000 ||
      candidate.userEvidenceQuote.trim() !== candidate.userEvidenceQuote ||
      CONTROL.test(candidate.userEvidenceQuote)) {
    throw new SeyeonPlannerMemoryProducerHoldV1();
  }
  const result = await client.query<{
    proposalId: unknown;
    proposalState: unknown;
    replayed: unknown;
  }>(SQL, [
    input.canonicalMemberSubjectId,
    input.proposalId,
    input.turnId,
    input.assistantMessageId,
    input.userMessageId,
    candidate.summary,
    candidate.userEvidenceQuote,
  ]);
  const row = result.rows[0];
  if (result.rows.length !== 1 ||
      row?.proposalId !== input.proposalId ||
      row?.proposalState !== 'pending' ||
      typeof row.replayed !== 'boolean') {
    throw new SeyeonPlannerMemoryProducerHoldV1();
  }
  return Object.freeze({
    proposalId: input.proposalId,
    proposalState: 'pending',
    replayed: row.replayed,
  });
}
