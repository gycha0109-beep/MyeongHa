// Watchtower-Track: security
import { describe, expect, it, vi } from 'vitest';
import type { PostgresTransactionQueryV1 } from '../apps/api/src/postgres-subject-execution.js';
import {
  createSeyeonOwnedOriginalGrantV1,
  SeyeonOwnedOriginalGrantHoldV1,
} from '../apps/api/src/postgres-seyeon-owned-original-grant-v1.js';

const subjectId = '00000000-0000-4000-8000-000000000001';
const memoryItemId = '00000000-0000-4000-8000-000000000002';
const grantId = '00000000-0000-4000-8000-000000000003';
const input = {
  subjectId, memoryItemId, grantId,
  grantChoice: { mode: 'character_only' as const, characterId: 'seyeon' as const },
};
const receipt = {
  memoryItemId, grantId, characterId: 'seyeon', replayed: false,
};

function db(rows: unknown[] = [receipt]) {
  const query = vi.fn(async (_sql: string, _args?: unknown[]) => ({ rows }));
  return { client: { query } as unknown as PostgresTransactionQueryV1, query };
}

describe('Owner-bound S0 original memory grant is source-only and explicit', () => {
  it('uses one DB Owner command without reading raw Memory or proposals in the API', async () => {
    const { client, query } = db();
    await expect(createSeyeonOwnedOriginalGrantV1(client, input)).resolves.toEqual(receipt);
    expect(query).toHaveBeenCalledOnce();
    const [sql, args] = query.mock.calls[0]!;
    expect(sql).toContain('cmd_grant_seyeon_owned_conversation_recall_v1');
    expect(sql).not.toContain('from public.memory_items');
    expect(sql).not.toContain('from public.memory_proposals');
    expect(args).toEqual([subjectId,memoryItemId,grantId]);
  });

  it('rejects another character, expanded consent, or forged identifiers before DB access', async () => {
    for (const candidate of [
      { ...input, grantChoice: { mode: 'private' } },
      { ...input, grantChoice: { mode: 'current_characters' } },
      { ...input, grantChoice: { mode: 'character_only', characterId: 'other' } },
      { ...input, grantChoice: { mode: 'character_only', characterId: 'seyeon', extra: true } },
      { ...input, subjectId: 'invalid' },
      { ...input, memoryItemId: 'invalid' },
      { ...input, grantId: 'invalid' },
    ]) {
      const { client,query } = db();
      await expect(createSeyeonOwnedOriginalGrantV1(
        client, candidate as typeof input,
      )).rejects.toThrow(SeyeonOwnedOriginalGrantHoldV1);
      expect(query).not.toHaveBeenCalled();
    }
  });

  it('never accepts an unexpected, duplicate or replayed DB receipt', async () => {
    for (const rows of [
      [], [receipt, receipt],
      [{ ...receipt, replayed:true }],
      [{ ...receipt, characterId:'other' }],
      [{ ...receipt, grantId: memoryItemId }],
      [{ ...receipt, memoryItemId:subjectId }],
    ]) {
      const { client } = db(rows);
      await expect(createSeyeonOwnedOriginalGrantV1(client, input))
        .rejects.toThrow(SeyeonOwnedOriginalGrantHoldV1);
    }
  });
});
