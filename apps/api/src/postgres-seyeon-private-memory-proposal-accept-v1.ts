// Watchtower-Track: security
// Actual Subject-scoped, private-only Memory proposal acceptance database port.
// Not mounted to a public HTTP route and no EXECUTE privilege is enabled.
// This port requires the existing verified Member Subject transaction runner.
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import {
  parseSeyeonConversationRecallPayloadV1,
  SEYEON_CONVERSATION_RECALL_MEMORY_TYPE_V1,
  SEYEON_CONVERSATION_RECALL_MEMORY_SCHEMA_V1,
} from './seyeon-conversation-recall-memory-contract-v1.js';

export const SEYEON_PRIVATE_MEMORY_PROPOSAL_ACCEPT_RPC_V1 =
  'public.cmd_accept_seyeon_private_conversation_recall_proposal_v1' as const;

export interface SeyeonPrivateMemoryProposalAcceptInputV1 {
  readonly subjectId: string; // From the verified Member Subject runner, never user JSON
  readonly proposalId: string;
  readonly memoryItemId: string; // Server-allocated fresh UUID
  readonly grantChoice: Readonly<{ mode: 'private' }>; // No new record_access_grants
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
const PG_DIGEST = /^sha256:pg-jsonb:v1:[0-9a-f]{64}$/u;

// Raw private proposal JSON never goes to a model, a log, or an HTTP body.
const READ_LOCKED_PROPOSAL_SQL = `
select
  p.id::text as "proposalId",
  p.proposal_kind as "proposalKind",
  p.character_id as "characterId",
  p.record_type as "recordType",
  p.schema_version as "schemaVersion",
  p.status,
  p.proposed_value_jsonb as "payload",
  ('sha256:pg-jsonb:v1:' ||
    encode(sha256(convert_to(p.proposed_value_jsonb::text,'UTF8')),'hex'))
    as "originalPgDigest"
from public.memory_proposals p
where p.id=$1::uuid and p.subject_id=$2::uuid
for update
`.trim();

const ACCEPT_SQL = `
select
  memory_item_id::text as "memoryItemId",
  grant_count as "grantCount",
  replayed
from public.cmd_accept_seyeon_private_conversation_recall_proposal_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::text
)
`.trim();

type ProposalRow = Readonly<{
  proposalId: unknown;
  proposalKind: unknown;
  characterId: unknown;
  recordType: unknown;
  schemaVersion: unknown;
  status: unknown;
  payload: unknown;
  originalPgDigest: unknown;
}>;

type ReceiptRow = Readonly<{
  memoryItemId: unknown;
  grantCount: unknown;
  replayed: unknown;
}>;

/**
 * The caller must already be inside ONE verified Member Subject transaction
 * (executePostgresSubjectTransactionV1 / the canonical Subject runner).
 * A DB-owner RPC rechecks the exact original Proposal+PG digest and performs
 * the INSERT and pending->accepted transition atomically; a separate
 * SELECT or this in-memory payload validation alone has NO write authority.
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

  const read = await client.query<ProposalRow>(READ_LOCKED_PROPOSAL_SQL, [
    input.proposalId, input.subjectId,
  ]);
  const row = read.rows[0];
  if (read.rows.length !== 1 || row === undefined ||
      row.proposalId !== input.proposalId ||
      row.proposalKind !== 'memory' ||
      row.characterId !== 'seyeon' ||
      row.status !== 'pending' ||
      row.recordType !== SEYEON_CONVERSATION_RECALL_MEMORY_TYPE_V1 ||
      row.schemaVersion !== SEYEON_CONVERSATION_RECALL_MEMORY_SCHEMA_V1 ||
      typeof row.originalPgDigest !== 'string' ||
      !PG_DIGEST.test(row.originalPgDigest)) {
    throw new SeyeonPrivateMemoryProposalAcceptHoldV1();
  }
  // DB's raw Proposal is the ONLY eligible candidate for this server codec.
  // A malformed or additional-field payload is never persisted.
  try {
    parseSeyeonConversationRecallPayloadV1(row.payload);
  } catch {
    throw new SeyeonPrivateMemoryProposalAcceptHoldV1();
  }

  const commit = await client.query<ReceiptRow>(ACCEPT_SQL, [
    input.subjectId, input.proposalId, input.memoryItemId,
    row.originalPgDigest,
  ]);
  const accepted = commit.rows[0];
  if (commit.rows.length !== 1 || accepted === undefined ||
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
