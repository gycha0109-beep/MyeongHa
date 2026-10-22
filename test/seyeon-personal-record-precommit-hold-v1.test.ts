import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  assertSeyeonPersonalRecordsNotUsedBeforeUnprotectedCommitV1,
  SeyeonPersonalRecordPrecommitHoldV1,
} from '../apps/api/src/seyeon-personal-record-precommit-hold-v1.js';

type GuardContext = Parameters<
  typeof assertSeyeonPersonalRecordsNotUsedBeforeUnprotectedCommitV1
>[0];

const context = (memories: unknown[], admissions: unknown[]): GuardContext =>
  ({
    version: 'seyeon-production-context-v1',
    retrievedMemories: memories,
    personalRecordAdmissions: admissions,
    recentMessages: [],
    relationshipHistoryRecords: [],
    relationshipRevisionUsedForTurn: 0,
    historyThroughRevision: 0,
    activeRelationshipEventCount: 0,
  }) as unknown as GuardContext;

const relationship = {
  kind: 'relationship_event',
  memoryId: 'relationship-event:server-event',
  summary: 'server relationship observation',
};
const personal = {
  kind: 'memory',
  memoryId: 'memory:server-record',
  sourceRef: 'memory:server-record:grant:server-grant',
  summary: 'context admitted by an unexpected positive projector',
};

describe('Se-yeon Production personal-record pre-model safety interlock', () => {
  it('accepts a current server-composed zero-personal-record context without granting Commit or Reveal authority', () => {
    const verdict = assertSeyeonPersonalRecordsNotUsedBeforeUnprotectedCommitV1(
      context([], []),
    );
    expect(verdict).toEqual({
      version: 'seyeon-personal-record-precommit-hold-v1',
      state: 'no_admitted_personal_records',
      permitsAtomicPersonalRecordCommit: false,
      permitsHttpReveal: false,
    });
    expect(Object.isFrozen(verdict)).toBe(true);

    expect(assertSeyeonPersonalRecordsNotUsedBeforeUnprotectedCommitV1(
      context([], [{ reason: 'UNSUPPORTED_SCHEMA' }]),
    ).state).toBe('no_admitted_personal_records');
  });


  it('blocks unapproved historical and relationship-derived context before any Provider', () => {
    const clean = context([], []);
    const cases = [
      { ...clean, recentMessages: [{ messageId: 'old', role: 'user', text: 'private user canary' }] },
      { ...clean, recentMessages: [{ messageId: 'old', role: 'assistant', text: 'private response canary' }] },
      { ...clean, retrievedMemories: [relationship] },
      { ...clean, relationshipHistoryRecords: [{ eventId: 'old-derived' }] },
      { ...clean, relationshipRevisionUsedForTurn: 2, historyThroughRevision: 2 },
      { ...clean, activeRelationshipEventCount: 1 },
    ];
    for (const candidate of cases) {
      expect(() => assertSeyeonPersonalRecordsNotUsedBeforeUnprotectedCommitV1(
        candidate as GuardContext,
      )).toThrow(SeyeonPersonalRecordPrecommitHoldV1);
    }
  });

  it('does not treat missing, corrupted, or inconsistent historical census as zero', () => {
    const clean = context([], []);
    for (const changed of [
      { ...clean, recentMessages: null },
      { ...clean, relationshipHistoryRecords: undefined },
      { ...clean, relationshipHistoryRecords: { length: 0 } },
      { ...clean, activeRelationshipEventCount: undefined },
      { ...clean, activeRelationshipEventCount: -1 },
      { ...clean, historyThroughRevision: 1 },
      { ...clean, relationshipRevisionUsedForTurn: 1 },
      { ...clean, version: 'unknown-source-v2' },
    ]) {
      expect(() => assertSeyeonPersonalRecordsNotUsedBeforeUnprotectedCommitV1(
        changed as GuardContext,
      )).toThrow(SeyeonPersonalRecordPrecommitHoldV1);
    }
  });

  it('holds a Memory or Life Fact that would enter the actual model context', () => {
    for (const kind of ['memory', 'life_fact']) {
      expect(() => assertSeyeonPersonalRecordsNotUsedBeforeUnprotectedCommitV1(
        context([{ ...personal, kind }], []),
      )).toThrow(SeyeonPersonalRecordPrecommitHoldV1);
    }
  });

  it('holds any admitted or unknown personal-record admission even when the context limit excludes it', () => {
    for (const reason of ['ADMITTED', 'FAKE_STATE', undefined]) {
      expect(() => assertSeyeonPersonalRecordsNotUsedBeforeUnprotectedCommitV1(
        context([], [{ reason }]),
      )).toThrow(SeyeonPersonalRecordPrecommitHoldV1);
    }
    expect(() => assertSeyeonPersonalRecordsNotUsedBeforeUnprotectedCommitV1(
      context([relationship], [null]),
    )).toThrow(SeyeonPersonalRecordPrecommitHoldV1);
  });

  it('holds hidden personal projection candidates before Provider even with empty admissions', () => {
    const baseline = context([], []);
    expect(assertSeyeonPersonalRecordsNotUsedBeforeUnprotectedCommitV1({
      ...baseline, personalRecordProjectionCandidates: [],
    }).state).toBe('no_admitted_personal_records');
    for (const projected of [
      [{ recordKind: 'life_fact', recordId: 'hidden', grantId: 'revoked' }],
      null, {}, 'not-an-array',
    ]) {
      const forged = {
        ...baseline, personalRecordProjectionCandidates: projected,
      } as unknown as GuardContext;
      expect(() => assertSeyeonPersonalRecordsNotUsedBeforeUnprotectedCommitV1(forged))
        .toThrow(SeyeonPersonalRecordPrecommitHoldV1);
    }
  });

  it('does not treat malformed or missing authority as proof of zero records', () => {
    for (const malformed of [
      null,
      {},
      { retrievedMemories: [] },
      { retrievedMemories: [], personalRecordAdmissions: null },
      context([{}], []),
      context([null], []),
    ]) {
      try {
        assertSeyeonPersonalRecordsNotUsedBeforeUnprotectedCommitV1(
          malformed as GuardContext,
        );
        throw new Error('malformed provenance was accepted');
      } catch (error) {
        expect(error).toMatchObject({
          name: 'SeyeonPersonalRecordPrecommitHoldV1',
          code: 'PERSONAL_RECORD_ATOMIC_COMMIT_UNAVAILABLE',
        });
      }
    }
  });

  it('retains the DB-owned original UserMessage barrier ahead of positive G2 Commit',async()=>{
    const migration=await readFile(new URL(
      '../supabase/migrations/20261021181000_seyeon_positive_same_transaction_commit_v1.sql',
      import.meta.url,
    ),'utf8');
    const originalLock=migration.indexOf('for share of m');
    const guard=migration.indexOf(
      "constraint='seyeon_positive_g2_snapshot_original_user_message_mismatch'",
    );
    const commit=migration.indexOf(
      'from public.cmd_commit_seyeon_chat_turn_runtime_v2(',
    );
    expect(migration).toContain("m.sender_type='user'");
    expect(migration).toContain("p_post_turn_snapshot_jsonb ->> 'userMessageId'");
    expect(migration).toContain('v_original_user_message_count <> 1');
    expect(originalLock).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(originalLock);
    expect(commit).toBeGreaterThan(guard);
  });

  it('runs the interlock before context-ready persistence and every model call in Production Chat', async () => {
    const runtime = await readFile(
      new URL('../apps/api/src/seyeon-production-chat-execution-v1.ts', import.meta.url),
      'utf8',
    );
    // Locate the actual zero-branch guard, not the import or a fragile
    // whitespace-specific source string. Guard MUST precede the DB Pin.
    const zeroBranch = runtime.indexOf(
      'if (exactModelPersonalSources.selectedPersonalRecordCount === 0)',
    );
    const gate = runtime.indexOf(
      'assertSeyeonPersonalRecordsNotUsedBeforeUnprotectedCommitV1(',
      zeroBranch,
    );
    expect(zeroBranch).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(zeroBranch);
    const contextReady = runtime.indexOf('await input.persistencePort.markContextReady({');
    const model = runtime.indexOf('const runtime = await runSeyeonCharacterTurnV2({');
    const generated = runtime.indexOf('await input.persistencePort.persistGenerated({');
    const positivePin = runtime.indexOf(
      'await input.positivePersonalSourcePort.pinBeforeModel({',
    );
    const positiveG2 = runtime.indexOf(
      'await input.positivePersonalSourcePort!.commitAfterValidation({',
    );
    const committed = runtime.indexOf(
      'const committed = positiveModelCorrelation === null',
    );
    expect(gate).toBeGreaterThan(-1);
    expect(contextReady).toBeGreaterThan(gate);
    expect(positivePin).toBeGreaterThan(contextReady);
    expect(model).toBeGreaterThan(positivePin);
    expect(generated).toBeGreaterThan(model);
    expect(committed).toBeGreaterThan(generated);
    expect(positiveG2).toBeGreaterThan(committed);
  });
});
