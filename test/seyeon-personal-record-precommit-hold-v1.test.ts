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
    retrievedMemories: memories,
    personalRecordAdmissions: admissions,
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
      context([relationship], [{ reason: 'UNSUPPORTED_SCHEMA' }]),
    ).state).toBe('no_admitted_personal_records');
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

  it('runs the interlock before context-ready persistence and every model call in Production Chat', async () => {
    const runtime = await readFile(
      new URL('../apps/api/src/seyeon-production-chat-execution-v1.ts', import.meta.url),
      'utf8',
    );
    const gate = runtime.indexOf(
      'assertSeyeonPersonalRecordsNotUsedBeforeUnprotectedCommitV1(\n          productionContext,',
    );
    const contextReady = runtime.indexOf('await input.persistencePort.markContextReady({');
    const model = runtime.indexOf('const runtime = await runSeyeonCharacterTurnV2({');
    const generated = runtime.indexOf('await input.persistencePort.persistGenerated({');
    const committed = runtime.indexOf('const committed = await input.persistencePort.commitTurn({');
    expect(gate).toBeGreaterThan(-1);
    expect(contextReady).toBeGreaterThan(gate);
    expect(model).toBeGreaterThan(contextReady);
    expect(generated).toBeGreaterThan(model);
    expect(committed).toBeGreaterThan(generated);
  });
});
