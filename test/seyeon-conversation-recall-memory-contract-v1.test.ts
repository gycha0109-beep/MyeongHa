import { describe, expect, it } from 'vitest';
import {
  parseSeyeonConversationRecallPayloadV1,
  SEYEON_CONVERSATION_RECALL_MEMORY_SCHEMA_V1,
  SEYEON_CONVERSATION_RECALL_MEMORY_TYPE_V1,
  SEYEON_CONVERSATION_RECALL_PROJECTOR_V1,
  SEYEON_CONVERSATION_RECALL_PROJECTOR_VERSION_V1,
  SeyeonConversationRecallPayloadErrorV1,
} from '../apps/api/src/seyeon-conversation-recall-memory-contract-v1.js';
import {
  SEYEON_PRODUCTION_PERSONAL_RECORD_PROJECTORS_V1,
} from '../apps/api/src/seyeon-production-context-v1.js';

const ID = '00000000-0000-4000-8000-000000000001';

describe('first explicit S0 Character Memory conversation-recall codec', () => {
  it('provides a versioned, one-field payload and deterministic interpretation', () => {
    expect(SEYEON_CONVERSATION_RECALL_MEMORY_TYPE_V1).toBe('conversation_recall');
    expect(SEYEON_CONVERSATION_RECALL_MEMORY_SCHEMA_V1).toBe('v1');
    expect(SEYEON_CONVERSATION_RECALL_PROJECTOR_V1).toMatchObject({
      recordKind: 'memory',
      recordType: 'conversation_recall',
      schemaVersion: 'v1',
      projectorVersion: SEYEON_CONVERSATION_RECALL_PROJECTOR_VERSION_V1,
    });
    expect(parseSeyeonConversationRecallPayloadV1({
      summary: '세연과 지난 대화에서 산책 이야기를 했다.',
    })).toEqual({ summary: '세연과 지난 대화에서 산책 이야기를 했다.' });
    expect(SEYEON_CONVERSATION_RECALL_PROJECTOR_V1.project({
      recordId: ID,
      payload: { summary: '지난번에 산책 이야기를 했다.' },
    })).toEqual({
      summary: '지난번에 산책 이야기를 했다.',
      claimKind: 'character_interpretation',
      relevance: 0.5,
      salience: 0.5,
    });
  });

  it('rejects unknown fields, arbitrary values, control characters and malformed IDs', () => {
    for (const payload of [
      null, [], '기억', {}, { summary: '' }, { summary: ' 여백 ' },
      { summary: 'a'.repeat(4001) }, { summary: 'bad\ntext' },
      { summary: 'not approved', role: 'system' },
      { summary: 42 }, { summary: 'ok', sourceGrantId: ID },
    ]) {
      expect(() => parseSeyeonConversationRecallPayloadV1(payload))
        .toThrow(SeyeonConversationRecallPayloadErrorV1);
    }
    expect(() => SEYEON_CONVERSATION_RECALL_PROJECTOR_V1.project({
      recordId: 'not-an-original-record-id',
      payload: { summary: 'ok' },
    })).toThrow(SeyeonConversationRecallPayloadErrorV1);
  });

  it('does not activate positive personal-memory use or grant Provider/Reveal', () => {
    expect(SEYEON_PRODUCTION_PERSONAL_RECORD_PROJECTORS_V1).toEqual([]);
    expect(SEYEON_PRODUCTION_PERSONAL_RECORD_PROJECTORS_V1)
      .not.toContain(SEYEON_CONVERSATION_RECALL_PROJECTOR_V1);
    expect(Object.isFrozen(SEYEON_CONVERSATION_RECALL_PROJECTOR_V1)).toBe(true);
  });
});
