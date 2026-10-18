// Watchtower-Track: security
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createSeyeonLockedFirstZeroNodeRevealV1,
  SeyeonLockedFirstZeroRevealErrorV1,
} from '../apps/api/src/seyeon-locked-first-zero-node-reveal-v1.js';
import type {
  PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';

const authUserId = '11111111-1111-4111-8111-111111111111';
const subjectId = '22222222-2222-4222-8222-222222222222';
const threadId = '33333333-3333-4333-8333-333333333333';
const turnId = '44444444-4444-4444-8444-444444444444';
const attemptId = '55555555-5555-4555-8555-555555555555';

function fakePool(outputRows: readonly { assistantText: unknown }[]) {
  const events: string[] = [];
  const values: readonly unknown[][] = [];
  let rollback = false;
  let commit = false;
  const pool = {
    async connect() {
      events.push('connect');
      return {
        async query(sql: string, args?: readonly unknown[]) {
          events.push(sql.trim().split('\n')[0] ?? '');
          if (args !== undefined) (values as unknown[][]).push([...args]);
          if (sql.includes('begin_member_subject_context_v1')) {
            return { rows: [{ subjectId, subjectKind: 'member' }] };
          }
          if (sql.includes('qry_seyeon_locked_first_zero_source_reveal_v1')) {
            return { rows: [...outputRows] };
          }
          if (sql === 'COMMIT') commit = true;
          if (sql === 'ROLLBACK') rollback = true;
          return { rows: [] };
        },
        release() { events.push('release'); },
      };
    },
  } as unknown as PostgresSubjectPoolV1;
  return {
    pool,
    events,
    values,
    get commit() { return commit; },
    get rollback() { return rollback; },
  };
}

function subjectInput(pool: PostgresSubjectPoolV1) {
  return {
    pool,
    verifiedEvidence: { kind: 'member', verifiedAuthUserId: authUserId } as const,
    serverThreadId: threadId,
    serverTurnId: turnId,
    serverAttemptId: attemptId,
  };
}

describe('G3 scoped first zero-source DB Owner → Node original send bridge', () => {
  it('holds the canonical subject transaction across delivery and never trusts a caller subject', async () => {
    const context = fakePool([{ assistantText: '처음 만난 세연의 응답' }]);
    const reader = createSeyeonLockedFirstZeroNodeRevealV1(subjectInput(context.pool));
    await reader({
      signal: new AbortController().signal,
      deliver: async authorized => {
        expect(authorized).toBe('처음 만난 세연의 응답');
        expect(context.commit).toBe(false);
        expect(context.rollback).toBe(false);
        expect(context.events).toContain('BEGIN');
      },
    });
    expect(context.commit).toBe(true);
    expect(context.rollback).toBe(false);
    expect(context.values).toContainEqual([authUserId]);
    expect(context.values).toContainEqual([subjectId,threadId,turnId,attemptId]);
    expect(context.events.slice(-2)).toEqual(['COMMIT','release']);
  });

  it.each([
    { rows: [] as readonly { assistantText: unknown }[] },
    { rows: [{ assistantText: 'x' }, { assistantText: 'x' }] },
    { rows: [{ assistantText: '' }] },
    { rows: [{ assistantText: null }] },
    { rows: [{ assistantText: 42 }] },
  ])('denies missing, ambiguous, empty, or untrusted DB authority without sending text: %j', async ({ rows }) => {
    const context = fakePool(rows);
    const reader = createSeyeonLockedFirstZeroNodeRevealV1(subjectInput(context.pool));
    let received: string | null | undefined;
    await reader({
      signal: new AbortController().signal,
      deliver: async value => { received = value; },
    });
    expect(received).toBeNull();
    expect(context.commit).toBe(true);
  });

  it('never opens a database session for Guest evidence or untrusted input IDs', () => {
    const context = fakePool([]);
    expect(() => createSeyeonLockedFirstZeroNodeRevealV1({
      ...subjectInput(context.pool),
      verifiedEvidence: { kind: 'guest', verifiedGuestTokenHash: 'opaque' },
    })).toThrow(SeyeonLockedFirstZeroRevealErrorV1);
    expect(() => createSeyeonLockedFirstZeroNodeRevealV1({
      ...subjectInput(context.pool),
      serverAttemptId: 'invalid-attempt',
    })).toThrow(SeyeonLockedFirstZeroRevealErrorV1);
    expect(context.events).toEqual([]);
  });

  it('rolls back if request disconnects after the locked read, with no second release path', async () => {
    const context = fakePool([{ assistantText: 'authorized-once' }]);
    const reader = createSeyeonLockedFirstZeroNodeRevealV1(subjectInput(context.pool));
    const abort = new AbortController();
    await expect(reader({
      signal: abort.signal,
      deliver: async text => {
        expect(text).toBe('authorized-once');
        abort.abort();
      },
    })).rejects.toThrow(SeyeonLockedFirstZeroRevealErrorV1);
    expect(context.rollback).toBe(true);
    expect(context.commit).toBe(false);
    expect(context.events.slice(-2)).toEqual(['ROLLBACK','release']);
  });

  it('never sends on already-aborted request and does not connect to DB', async () => {
    const context = fakePool([]);
    const reader = createSeyeonLockedFirstZeroNodeRevealV1(subjectInput(context.pool));
    const abort = new AbortController();
    abort.abort();
    await expect(reader({
      signal: abort.signal,
      deliver: async () => { throw new Error('should not send'); },
    })).rejects.toThrow(SeyeonLockedFirstZeroRevealErrorV1);
    expect(context.events).toEqual([]);
  });

  it('SQL admits only exact first zero-source, excludes derived history, and locks rows', () => {
    const sql = readFileSync('supabase/migrations/1740_seyeon_locked_first_zero_source_reveal_v1.sql','utf8');
    expect(sql).toContain("set row_security=off");
    expect(sql).toContain("subj.kind='member'");
    expect(sql).toContain("t.committed_attempt_id=p_attempt_id");
    expect(sql).toContain("a.validation_result_jsonb->'personalRecordProvenance'");
    expect(sql).toContain("'exactModelSourceSelection'->'selectedSources'='[]'::jsonb");
    expect(sql).toContain("select count(*) from public.conversation_messages previous");
    expect(sql).toContain('public.relationship_events h');
    expect(sql).toContain('public.relationship_event_records h');
    expect(sql).toContain('public.relationship_history_entries h');
    expect(sql).toContain('for share of subj,t,a,msg');
    expect(sql).toContain('to myeongha_api_executor');
    expect(sql).toContain("from public;");
    expect(sql).not.toContain('grant select on');
  });

  it('keeps production Vercel Fetch and first POST unavailable until actual transport authority', () => {
    const outer = readFileSync('api/me.ts','utf8');
    const inner = readFileSync('apps/api/src/chat-turn-send-http.ts','utf8');
    expect(outer).toContain('enforceSeyeonVercelFetchRevealFenceV1(result, requestId)');
    expect(inner).toContain('assertSeyeonFirstHttpRevealAuthorizedV1();');
  });
});
