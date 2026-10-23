// Watchtower-Track: security
import { describe, expect, it } from 'vitest';
import type {
  PostgresSubjectPoolV1,
  PostgresSubjectConnectionV1,
  PostgresQueryResultV1,
} from '../apps/api/src/postgres-subject-execution.js';
import {
  createSeyeonOriginalGrantPgSendAdapterV1,
  SeyeonOriginalGrantPgSendAdapterErrorV1,
} from '../apps/api/src/seyeon-original-grant-pg-send-adapter-v1.js';

const MEMBER = '11111111-1111-4111-8111-111111111111';
const SUBJECT = '22222222-2222-4222-8222-222222222222';
const LOCATORS = {
  threadId: '33333333-3333-4333-8333-333333333333',
  turnId: '44444444-4444-4444-8444-444444444444',
  committedAttemptId: '55555555-5555-4555-8555-555555555555',
  committedAssistantMessageId: '66666666-6666-4666-8666-666666666666',
} as const;
const CANARY = 'R13_SAFELY_LOCKED_SYNTHETIC_TEXT';

function fakeAuthority(answer: string | null) {
  const events: string[] = [];
  const captured: { sql?: string; values?: readonly unknown[] } = {};
  const connection: PostgresSubjectConnectionV1 = {
    async query<Row>(sql: string, values?: readonly unknown[]): Promise<PostgresQueryResultV1<Row>> {
      const statement = sql.trim();
      if (statement === 'BEGIN' || statement === 'COMMIT' ||
          statement === 'ROLLBACK' || statement.startsWith('SET LOCAL')) {
        events.push(statement);
        return { rows: [] };
      }
      if (statement.includes('public.begin_member_subject_context_v1')) {
        expect(values).toEqual([MEMBER]);
        events.push('resolve-member');
        return { rows: [{ subjectId: SUBJECT, subjectKind: 'member' }] as Row[] };
      }
      if (statement.includes('public.assert_myeongha_subject_context_v1')) {
        expect(values).toEqual([SUBJECT]);
        events.push('assert-subject');
        return { rows: [] };
      }
      if (statement.includes('seyeon_positive_candidate.reveal_http_r5')) {
        captured.sql = statement;
        if (values !== undefined) captured.values = values;
        events.push('original-grant-lock-read');
        return { rows: [{ assistantText: answer }] as Row[] };
      }
      throw Error('Unexpected SQL statement in R13 fake authority');
    },
    release(error?: unknown) {
      events.push(error === undefined ? 'release' : 'discard');
    },
  };
  const pool: PostgresSubjectPoolV1 = {
    connect: async () => connection,
  };
  return { pool, events, captured };
}

describe('R13 member original-Grant DB held-send callback', () => {
  it('resolves real server-side subject, binds all original locators, sends before COMMIT', async () => {
    const { pool, events, captured } = fakeAuthority(CANARY);
    const locked = createSeyeonOriginalGrantPgSendAdapterV1({
      pool,
      verifiedEvidence: { kind: 'member', verifiedAuthUserId: MEMBER },
      ...LOCATORS,
    });
    await locked({
      signal: new AbortController().signal,
      deliver: async value => {
        events.push('node-socket-finish');
        expect(value).toBe(CANARY);
      },
    });
    expect(captured.values).toEqual([
      SUBJECT, LOCATORS.threadId, LOCATORS.turnId,
      LOCATORS.committedAttemptId, LOCATORS.committedAssistantMessageId,
    ]);
    expect(captured.sql).toContain('seyeon_positive_candidate.reveal_http_r5');
    expect(events.indexOf('original-grant-lock-read'))
      .toBeLessThan(events.indexOf('node-socket-finish'));
    expect(events.indexOf('node-socket-finish'))
      .toBeLessThan(events.indexOf('COMMIT'));
    expect(events.at(-1)).toBe('release');
    await expect(locked({
      signal: new AbortController().signal,
      deliver: async () => undefined,
    })).rejects.toMatchObject({ code: 'REUSED_SEND_ATTEMPT' });
  });

  it('revoke-first yields only null, with no stale/regrant memory fallback', async () => {
    const { pool, events } = fakeAuthority(null);
    const locked = createSeyeonOriginalGrantPgSendAdapterV1({
      pool, verifiedEvidence: { kind: 'member', verifiedAuthUserId: MEMBER }, ...LOCATORS,
    });
    let actual = CANARY;
    await locked({
      signal: new AbortController().signal,
      deliver: async value => { actual = value ?? 'HELD'; },
    });
    expect(actual).toBe('HELD');
    expect(events).toContain('COMMIT');
  });

  it('abort or Node socket failure rolls back before connection reuse', async () => {
    const { pool, events } = fakeAuthority(CANARY);
    const locked = createSeyeonOriginalGrantPgSendAdapterV1({
      pool, verifiedEvidence: { kind: 'member', verifiedAuthUserId: MEMBER }, ...LOCATORS,
    });
    await expect(locked({
      signal: new AbortController().signal,
      deliver: async () => { throw Error('Node socket was disconnected'); },
    })).rejects.toThrow('Node socket was disconnected');
    expect(events).toContain('ROLLBACK');
    expect(events).not.toContain('COMMIT');
    expect(events.at(-1)).toBe('release');

    expect(() => createSeyeonOriginalGrantPgSendAdapterV1({
      pool,
      verifiedEvidence: { kind: 'guest', verifiedGuestTokenHash: 'offline-guest' },
      ...LOCATORS,
    })).toThrow(SeyeonOriginalGrantPgSendAdapterErrorV1);
  });
});
