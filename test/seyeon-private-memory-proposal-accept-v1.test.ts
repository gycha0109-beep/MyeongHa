import { describe, expect, it, vi } from 'vitest';
import type { PostgresTransactionQueryV1 } from '../apps/api/src/postgres-subject-execution.js';
import {
  acceptSeyeonPrivateConversationRecallProposalV1,
  SeyeonPrivateMemoryProposalAcceptHoldV1,
} from '../apps/api/src/postgres-seyeon-private-memory-proposal-accept-v1.js';

const subjectId = '00000000-0000-4000-8000-000000000001';
const proposalId = '00000000-0000-4000-8000-000000000002';
const memoryItemId = '00000000-0000-4000-8000-000000000003';
const digest = 'sha256:pg-jsonb:v1:' + 'a'.repeat(64);
const input = Object.freeze({
  subjectId, proposalId, memoryItemId,
  grantChoice: Object.freeze({ mode: 'private' as const }),
});
const validProposal = Object.freeze({
  proposalId, proposalKind: 'memory', characterId: 'seyeon',
  recordType: 'conversation_recall', schemaVersion: 'v1',
  status: 'pending', originalPgDigest: digest,
  payload: { summary: '사용자가 승인하기 전까지는 보관하지 않는 회상.' },
});
const validReceipt = Object.freeze({ memoryItemId, grantCount: 0, replayed: false });

describe('original Memory proposal -> private-only DB write boundary', () => {
  function db(first: unknown[] = [validProposal], second: unknown[] = [validReceipt]) {
    const query = vi.fn(async (sql: string, _params?: readonly unknown[]) => ({
      rows: sql.includes('from public.memory_proposals') ? first : second,
    }));
    return { query, client: { query } as unknown as PostgresTransactionQueryV1 };
  }

  it('uses one original locked Proposal and one DB-owner atomic command', async () => {
    const { client, query } = db();
    await expect(acceptSeyeonPrivateConversationRecallProposalV1(client, input))
      .resolves.toEqual(validReceipt);
    expect(query).toHaveBeenCalledTimes(2);
    const [readSql, readArgs] = query.mock.calls[0]!;
    const [commitSql, commitArgs] = query.mock.calls[1]!;
    expect(readSql).toContain('for update');
    expect(readSql).toContain('sha256:pg-jsonb:v1:');
    expect(readArgs).toEqual([proposalId, subjectId]);
    expect(commitSql).toContain('cmd_accept_seyeon_private_conversation_recall_proposal_v1');
    expect(commitArgs).toEqual([subjectId, proposalId, memoryItemId, digest]);
  });

  it('denies grant modes or malformed canonical identifiers before a DB read', async () => {
    for (const candidate of [
      { ...input, grantChoice: { mode: 'character_only', characterId: 'seyeon' } },
      { ...input, grantChoice: { mode: 'current_characters' } },
      { ...input, grantChoice: { mode: 'private', unrelated: true } },
      { ...input, subjectId: 'other-user' },
      { ...input, proposalId: 'not-uuid' },
    ]) {
      const { client, query } = db();
      await expect(acceptSeyeonPrivateConversationRecallProposalV1(
        client, candidate as unknown as typeof input,
      )).rejects.toThrow(SeyeonPrivateMemoryProposalAcceptHoldV1);
      expect(query).not.toHaveBeenCalled();
    }
  });

  it('denies unapproved, malformed, mismatched, or replayed original proposals without any write', async () => {
    for (const candidate of [
      { ...validProposal, status: 'accepted' },
      { ...validProposal, characterId: 'other' },
      { ...validProposal, proposalKind: 'life_fact' },
      { ...validProposal, schemaVersion: 'unknown' },
      { ...validProposal, recordType: 'any_random_memory' },
      { ...validProposal, payload: { summary: 'okay', extra: true } },
      { ...validProposal, originalPgDigest: 'missing' },
    ]) {
      const { client, query } = db([candidate]);
      await expect(acceptSeyeonPrivateConversationRecallProposalV1(client, input))
        .rejects.toThrow(SeyeonPrivateMemoryProposalAcceptHoldV1);
      expect(query).toHaveBeenCalledTimes(1);
    }
  });

  it('refuses forged or replayed DB receipts', async () => {
    for (const receipt of [
      { ...validReceipt, grantCount: 1 },
      { ...validReceipt, replayed: true },
      { ...validReceipt, memoryItemId: proposalId },
    ]) {
      const { client } = db([validProposal], [receipt]);
      await expect(acceptSeyeonPrivateConversationRecallProposalV1(client, input))
        .rejects.toThrow(SeyeonPrivateMemoryProposalAcceptHoldV1);
    }
  });
});
