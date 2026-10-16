import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  createPostgresSeyeonFirstTurnCensusShadowV1,
  PostgresSeyeonFirstTurnCensusShadowHoldV1,
  POSTGRES_SEYEON_FIRST_TURN_CENSUS_SHADOW_SQL_V1,
} from '../apps/api/src/postgres-seyeon-first-turn-census-shadow-v1.js';
import { createSeyeonFastDialogueShadowV1 } from '../apps/api/src/seyeon-fast-dialogue-shadow-v1.js';
import { assembleSeyeonRuntimeContextV2 } from '../packages/domain/src/seyeon-runtime-context-v2.js';

const SUBJECT = '11111111-1111-4111-8111-111111111111';
const THREAD = '22222222-2222-4222-8222-222222222222';
const MESSAGE = '33333333-3333-4333-8333-333333333333';
const MATCHING = {
  threadStatus: 'active',
  participantCharacterIds: ['seyeon'],
  boundedMessageCount: '1',
  currentMessageIsLatestUser: true,
};

function fixture(rows: readonly unknown[] = [MATCHING]) {
  const query = vi.fn(async (_sql: string, _params?: readonly unknown[]) =>
    ({ rows }));
  const port = createPostgresSeyeonFirstTurnCensusShadowV1({
    client: { query },
    subjectId: SUBJECT,
    threadId: THREAD,
  });
  const request = {
    subjectId: SUBJECT, threadId: THREAD, currentUserMessageId: MESSAGE,
  };
  return { port, query, request };
}

function publicContext() {
  return assembleSeyeonRuntimeContextV2({
    relationship: null,
    recentMessages: [{ messageId: MESSAGE, role: 'user', text: '안녕, 세연아.' }],
    retrievedMemories: [],
    integrityDecisions: [],
    governedPreflightApplied: true,
    disclosure: { decision: null, retrievedSources: [] },
  });
}

describe('C08-E bounded PostgreSQL first-thread read-only shadow candidate', () => {
  it('uses existing subject/thread read authority and at most two historical message identities', async () => {
    const h = fixture();
    const result = await h.port.readFullThreadCensus(h.request);
    expect(result).toEqual({
      schemaVersion: 'seyeon-first-turn-census-shadow-v1',
      subjectId: SUBJECT,
      threadId: THREAD,
      currentUserMessageId: MESSAGE,
      messageCount: 1, latestSenderType: 'user', complete: true,
    });
    expect(h.query).toHaveBeenCalledExactlyOnceWith(
      POSTGRES_SEYEON_FIRST_TURN_CENSUS_SHADOW_SQL_V1,
      [SUBJECT, THREAD, MESSAGE],
    );
    const sql = POSTGRES_SEYEON_FIRST_TURN_CENSUS_SHADOW_SQL_V1.toLowerCase();
    expect(sql).toContain('qry_chat_thread_runtime_binding_v1');
    expect(sql).toContain('from public.conversation_messages');
    expect(sql).toContain('m.subject_id = $1::uuid');
    expect(sql).toContain('m.thread_id = $2::uuid');
    expect(sql).toContain('m.id = $3::uuid');
    expect(sql).toContain('limit 2');
    expect(sql).toContain('redacted_at is null');
    expect(sql).not.toContain('body_text');
    expect(sql).not.toContain('payload');
    expect(sql).not.toContain('insert into');
    expect(sql).not.toContain('update public.');
    expect(sql).not.toContain('delete from');
    expect(sql).not.toContain('alter table');
    expect(sql).not.toContain('set role');
    expect(sql).not.toContain('create function');
  });

  it('rejects second message, deleted/archived thread, other character, stale user turn, or zero history', async () => {
    const invalid = [
      { ...MATCHING, boundedMessageCount: '0' },
      { ...MATCHING, boundedMessageCount: '2' },
      { ...MATCHING, boundedMessageCount: '3' },
      { ...MATCHING, boundedMessageCount: 1 },
      { ...MATCHING, threadStatus: 'archived' },
      { ...MATCHING, threadStatus: 'deleted' },
      { ...MATCHING, participantCharacterIds: [] },
      { ...MATCHING, participantCharacterIds: ['another-character'] },
      { ...MATCHING, participantCharacterIds: ['seyeon', 'other'] },
      { ...MATCHING, currentMessageIsLatestUser: false },
      { ...MATCHING, currentMessageIsLatestUser: 'true' },
    ];
    for (const row of invalid) {
      const h = fixture([row]);
      await expect(h.port.readFullThreadCensus(h.request))
        .rejects.toBeInstanceOf(PostgresSeyeonFirstTurnCensusShadowHoldV1);
      expect(h.query).toHaveBeenCalledOnce();
    }
  });

  it('rejects absent/duplicate read authority and spoofed Subject/Thread/Message IDs without a second SQL query', async () => {
    for (const rows of [[], [MATCHING, MATCHING]]) {
      const h = fixture(rows);
      await expect(h.port.readFullThreadCensus(h.request))
        .rejects.toBeInstanceOf(PostgresSeyeonFirstTurnCensusShadowHoldV1);
    }
    const h = fixture();
    for (const request of [
      { ...h.request, subjectId: THREAD },
      { ...h.request, threadId: SUBJECT },
      { ...h.request, currentUserMessageId: 'invalid-user-text' },
    ]) {
      await expect(h.port.readFullThreadCensus(request))
        .rejects.toBeInstanceOf(PostgresSeyeonFirstTurnCensusShadowHoldV1);
    }
    expect(h.query).not.toHaveBeenCalled();
    expect(() => createPostgresSeyeonFirstTurnCensusShadowV1({
      client: { query: h.query },
      subjectId: 'not-uuid', threadId: THREAD,
    })).toThrow(PostgresSeyeonFirstTurnCensusShadowHoldV1);
  });

  it('hides database exceptions and produces no authorization or model output after a failed read', async () => {
    const query = vi.fn(async () => {
      throw Error('synthetic-private-database-data-NEVER-LOG');
    });
    const port = createPostgresSeyeonFirstTurnCensusShadowV1({
      client: { query }, subjectId: SUBJECT, threadId: THREAD,
    });
    const generate = vi.fn(async () => {
      throw Error('model should never run');
    });
    const shadow = createSeyeonFastDialogueShadowV1({
      candidateProvider: { providerKey: 'fixture', modelKey: 'fixture', generate },
      reviewerProvider: { providerKey: 'fixture', modelKey: 'fixture', generate },
      fullThreadCensus: port,
    });
    const failure = await shadow.evaluate(publicContext()).then(
      () => null, (e: unknown) => e,
    );
    expect(failure).toMatchObject({ code: 'FAST_THREAD_CENSUS_REJECTED' });
    expect(String(failure)).not.toContain('NEVER-LOG');
    expect(query).toHaveBeenCalledOnce();
    expect(generate).not.toHaveBeenCalled();
  });

  it('allows only the next existing fast Shadow stage after positive bounded SQL result', async () => {
    const h = fixture();
    const generate = vi.fn(async () => {
      throw Error('OFFLINE_CANDIDATE_REACHED');
    });
    const reviewer = vi.fn(async () => {
      throw Error('UNEXPECTED_REVIEWER');
    });
    const shadow = createSeyeonFastDialogueShadowV1({
      candidateProvider: { providerKey: 'fixture', modelKey: 'fixture', generate },
      reviewerProvider: { providerKey: 'fixture', modelKey: 'fixture', generate: reviewer },
      fullThreadCensus: h.port,
    });
    await expect(shadow.evaluate(publicContext()))
      .rejects.toThrow('OFFLINE_CANDIDATE_REACHED');
    expect(h.query).toHaveBeenCalledOnce();
    expect(generate).toHaveBeenCalledOnce();
    expect(reviewer).not.toHaveBeenCalled();
  });

  it('remains a non-production read-only proposal without activating API routing or changing migrations', () => {
    const route = readFileSync(new URL(
      '../apps/api/src/production-seyeon-chat-runtime-v1.ts', import.meta.url,
    ), 'utf8');
    const candidate = readFileSync(new URL(
      '../apps/api/src/postgres-seyeon-first-turn-census-shadow-v1.ts', import.meta.url,
    ), 'utf8');
    expect(route).not.toContain('createPostgresSeyeonFirstTurnCensusShadowV1');
    expect(candidate).not.toContain('process.env.' + 'OPENAI_API_KEY');
    expect(candidate).not.toContain('fetch' + '(');
  });
});
