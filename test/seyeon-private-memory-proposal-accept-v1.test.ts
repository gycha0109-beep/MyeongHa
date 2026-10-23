import { describe, expect, it, vi } from 'vitest';
import type { PostgresTransactionQueryV1 } from '../apps/api/src/postgres-subject-execution.js';
import {
  acceptSeyeonPrivateConversationRecallProposalV1,
  SeyeonPrivateMemoryProposalAcceptHoldV1,
} from '../apps/api/src/postgres-seyeon-private-memory-proposal-accept-v1.js';

const subjectId = '00000000-0000-4000-8000-000000000001';
const proposalId = '00000000-0000-4000-8000-000000000002';
const memoryItemId = '00000000-0000-4000-8000-000000000003';
const input = Object.freeze({
  subjectId, proposalId, memoryItemId,
  grantChoice: Object.freeze({ mode: 'private' as const }),
});
const validReceipt = Object.freeze({ memoryItemId, grantCount: 0, replayed: false });

describe('DB Owner-only private Memory proposal acceptance', () => {
  function db(rows: readonly unknown[] = [validReceipt]) {
    const query = vi.fn(async (_sql: string, _args?: readonly unknown[]) => ({ rows }));
    return { query, client: { query } as unknown as PostgresTransactionQueryV1 };
  }

  it('calls one atomic DB Owner command without exposing private proposal contents', async () => {
    const { client, query } = db();
    await expect(acceptSeyeonPrivateConversationRecallProposalV1(client, input))
      .resolves.toEqual(validReceipt);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, args] = query.mock.calls[0]!;
    expect(sql).toContain('cmd_accept_seyeon_private_conversation_recall_proposal_v1');
    expect(sql).not.toContain('from public.memory_proposals p');
    expect(sql).not.toContain('proposed_value_jsonb');
    expect(sql).not.toContain('record_access_grants');
    expect(args).toEqual([subjectId, proposalId, memoryItemId]);
  });

  it('denies other Grant choices and untrusted identity before any SQL', async () => {
    for (const candidate of [
      { ...input, grantChoice: { mode: 'character_only', characterId: 'seyeon' } },
      { ...input, grantChoice: { mode: 'current_characters' } },
      { ...input, grantChoice: { mode: 'private', characterId: 'seyeon' } },
      { ...input, subjectId: 'not-a-member' },
      { ...input, proposalId: 'not-uuid' },
      { ...input, memoryItemId: 'not-uuid' },
    ]) {
      const { client, query } = db();
      await expect(acceptSeyeonPrivateConversationRecallProposalV1(
        client, candidate as unknown as typeof input,
      )).rejects.toThrow(SeyeonPrivateMemoryProposalAcceptHoldV1);
      expect(query).not.toHaveBeenCalled();
    }
  });

  it('rejects forged, non-private, or replayed DB Owner receipts', async () => {
    for (const rows of [
      [], [validReceipt, validReceipt],
      [{ ...validReceipt, grantCount: 1 }],
      [{ ...validReceipt, replayed: true }],
      [{ ...validReceipt, memoryItemId: proposalId }],
    ]) {
      const { client } = db(rows);
      await expect(acceptSeyeonPrivateConversationRecallProposalV1(client, input))
        .rejects.toThrow(SeyeonPrivateMemoryProposalAcceptHoldV1);
    }
  });
});
