// Watchtower-Track: security
// UC-06 server-only post-turn lane: governed Planner -> DB-verified pending
// proposal. The public Chat endpoint never accepts the model's candidate.
// A Memory/Grant requires a separate explicit UC-07 Member decision.
import { createHash } from 'node:crypto';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';
import type { SeyeonStructuredProviderPortV2 } from './seyeon-character-runtime-v2.js';
import { extractSeyeonPlannerMemoryCandidateV1 }
  from './seyeon-planner-memory-proposal-extractor-v1.js';
import { createPendingSeyeonPlannerMemoryProposalV1 }
  from './postgres-seyeon-planner-memory-proposal-producer-v1.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const SEYEON_POST_TURN_PLANNER_MEMORY_V1 = Object.freeze({
  defaultModelAndDbAdmission: 'DENY',
  publicHttpMounted: false,
  writeAfterMemberConsentOnly: true,
  pendingProposalCreatesGrant: false,
  providerMustBeGoverned: true,
} as const);

export class SeyeonPostTurnPlannerMemoryHoldV1 extends Error {
  readonly code = 'SEYEON_POST_TURN_PLANNER_MEMORY_HOLD' as const;
  constructor() {
    super('Post-turn Planner proposal requires a verified Member and approved guarded stage.');
    this.name = 'SeyeonPostTurnPlannerMemoryHoldV1';
  }
}

export function deriveSeyeonPlannerProposalIdV1(
  canonicalMemberSubjectId: string,
  turnId: string,
): string {
  if (!UUID.test(canonicalMemberSubjectId) || !UUID.test(turnId)) {
    throw new SeyeonPostTurnPlannerMemoryHoldV1();
  }
  const bytes = createHash('sha256')
    .update('myeongha-seyeon-planner-memory-proposal:v1:')
    .update(canonicalMemberSubjectId.toLowerCase())
    .update(':')
    .update(turnId.toLowerCase())
    .digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),
    hex.slice(16,20),hex.slice(20,32)].join('-');
}

export async function runSeyeonPostTurnPlannerMemoryV1(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  /** Exact IDs/Text from an already committed server-owned post-turn claim. */
  committedTurn: Readonly<{
    turnId: string;
    userMessageId: string;
    userText: string;
    assistantMessageId: string;
    assistantText: string;
  }>;
  /** Must already be backed by existing governor reservation + cost receipt. */
  governedProvider: SeyeonStructuredProviderPortV2;
  /** Server-internal authorizations; absent in current Production composition.
   * These must not be derived from model, HTTP JSON, or environment flags.
   */
  approvedModelAndDbStage?: () => boolean | Promise<boolean>;
}>): Promise<Readonly<
  | { decision: 'none' }
  | { decision: 'pending'; proposalId: string; replayed: boolean }
>> {
  if (input.verifiedEvidence?.kind !== 'member' ||
      !input.committedTurn ||
      !UUID.test(input.committedTurn.turnId) ||
      !UUID.test(input.committedTurn.userMessageId) ||
      !UUID.test(input.committedTurn.assistantMessageId) ||
      input.committedTurn.assistantMessageId === input.committedTurn.userMessageId ||
      !input.governedProvider || typeof input.governedProvider.generate !== 'function') {
    throw new SeyeonPostTurnPlannerMemoryHoldV1();
  }
  let admitted = false;
  try {
    admitted = input.approvedModelAndDbStage !== undefined &&
      (await input.approvedModelAndDbStage()) === true;
  } catch { admitted = false; }
  if (!admitted) throw new SeyeonPostTurnPlannerMemoryHoldV1();

  // No DB locks are held during model execution. Original committed rows
  // and exact user quote are checked again by the DB owner before INSERT.
  const extraction = await extractSeyeonPlannerMemoryCandidateV1({
    userMessageId: input.committedTurn.userMessageId,
    userText: input.committedTurn.userText,
    assistantMessageId: input.committedTurn.assistantMessageId,
    assistantText: input.committedTurn.assistantText,
    provider: input.governedProvider,
  });
  if (extraction.decision === 'none') {
    return Object.freeze({ decision: 'none' as const });
  }

  return executePostgresSubjectTransactionV1({
    pool: input.pool,
    verifiedEvidence: input.verifiedEvidence,
    execute: async ({ resolvedSubject, client }) => {
      if (resolvedSubject.subjectKind !== 'member') {
        throw new SeyeonPostTurnPlannerMemoryHoldV1();
      }
      const proposalId = deriveSeyeonPlannerProposalIdV1(
        resolvedSubject.subjectId,
        input.committedTurn.turnId,
      );
      const created = await createPendingSeyeonPlannerMemoryProposalV1(client, {
        canonicalMemberSubjectId: resolvedSubject.subjectId,
        proposalId,
        turnId: input.committedTurn.turnId,
        assistantMessageId: input.committedTurn.assistantMessageId,
        userMessageId: input.committedTurn.userMessageId,
        candidate: extraction.candidate,
      });
      return Object.freeze({
        decision: 'pending' as const,
        proposalId: created.proposalId,
        replayed: created.replayed,
      });
    },
  });
}
