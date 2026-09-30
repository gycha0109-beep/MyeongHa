import { describe, expect, it } from 'vitest';

import {
  canonicalJson,
  type CharacterDialogueEnvelopeV1,
} from '../packages/domain/src/index.js';
import {
  createPostgresCharacterProductionTurnPersistenceV1,
  type CharacterProductionFailurePolicyV1,
} from '../apps/api/src/postgres-character-production-turn-persistence.js';
import type {
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';
import { createHash } from 'node:crypto';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const TURN_ID = '22222222-2222-4222-8222-222222222222';
const ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';
const RENDER_LOG_ID = '44444444-4444-4444-8444-444444444444';
const GUARD_LOG_ID = '55555555-5555-4555-8555-555555555555';
const MESSAGE_ID = '66666666-6666-4666-8666-666666666666';
const OUTBOX_ID = '77777777-7777-4777-8777-777777777777';
const THREAD_ID = '88888888-8888-4888-8888-888888888888';
const READING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
const GROUNDING_ID = '99999999-9999-4999-8999-999999999999';

function envelope(): CharacterDialogueEnvelopeV1 {
  return Object.freeze({
    schemaVersion: 'v1',
    framingBefore: '제 생일은 3월 18일이에요.',
    protectedSajuSegments: Object.freeze([]),
    protectedSajuDisclosures: Object.freeze([]),
    calculationAmbiguity: Object.freeze([]),
    framingAfter: null,
    emotion: 'neutral',
    animationCue: 'idle',
    memoryProposals: Object.freeze([]),
    relationshipEventProposals: Object.freeze([]),
    suggestedActions: Object.freeze([]),
  });
}

class RecordingPool implements PostgresSubjectPoolV1 {
  readonly calls: { text: string; values: readonly unknown[] }[] = [];
  readonly transactionGroups: string[][] = [];
  #activeGroup: string[] | null = null;
  committedRow: Record<string, unknown> | null = null;

  async connect(): Promise<PostgresSubjectConnectionV1> {
    const pool = this;
    return {
      async query<Row = Record<string, unknown>>(
        text: string,
        values: readonly unknown[] = [],
      ): Promise<{ rows: readonly Row[] }> {
        pool.calls.push({ text, values });

        if (text === 'BEGIN') {
          pool.#activeGroup = ['BEGIN'];
          pool.transactionGroups.push(pool.#activeGroup);
          return { rows: [] };
        }
        pool.#activeGroup?.push(text);
        if (text === 'COMMIT' || text === 'ROLLBACK') {
          pool.#activeGroup = null;
          return { rows: [] };
        }

        if (text.includes('begin_member_subject_context_v1')) {
          return {
            rows: [{
              subjectId: SUBJECT_ID,
              subjectKind: 'member',
            }] as unknown as Row[],
          };
        }

        if (text.includes('cmd_allocate_chat_turn_attempt_runtime_v1')) {
          return {
            rows: [{
              attemptId: ATTEMPT_ID,
              attemptNo: 1,
              replayed: false,
            }] as unknown as Row[],
          };
        }

        if (text.includes('cmd_commit_chat_turn_runtime_v1')) {
          return {
            rows: [{
              turnId: TURN_ID,
              attemptId: ATTEMPT_ID,
              messageId: MESSAGE_ID,
              sequenceNo: 2,
              replayed: false,
            }] as unknown as Row[],
          };
        }

        if (text.includes('qry_committed_chat_turn_runtime_v1')) {
          return {
            rows: (pool.committedRow === null
              ? []
              : [pool.committedRow]) as unknown as Row[],
          };
        }

        return { rows: [] };
      },
      release() {},
    };
  }
}

const verifiedEvidence = Object.freeze({
  kind: 'member' as const,
  verifiedAuthUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
});

function uuids() {
  const values = [
    ATTEMPT_ID,
    RENDER_LOG_ID,
    GUARD_LOG_ID,
    MESSAGE_ID,
    OUTBOX_ID,
  ];
  let index = 0;
  return () => {
    const value = values[index];
    if (value === undefined) throw new Error('UUID fixture exhausted.');
    index += 1;
    return value;
  };
}

const failurePolicy: CharacterProductionFailurePolicyV1 = {
  classify({ phase }) {
    return phase === 'context'
      ? { failureState: 'failed_retryable', errorCode: 'CONTEXT_TEMPORARY' }
      : { failureState: 'failed_final', errorCode: 'PRODUCTION_FAILED' };
  },
};

describe('PostgreSQL Production Character turn persistence', () => {
  it('pins one guarded-envelope hash across renderer, generated, guard, validation and commit', async () => {
    const pool = new RecordingPool();
    const groundingCalls: unknown[] = [];
    const persistence = createPostgresCharacterProductionTurnPersistenceV1({
      pool,
      verifiedEvidence,
      createUuid: uuids(),
      rendererVersion: 'renderer-runtime-v1',
      rendererPromptVersion: 'renderer-prompt-v1',
      outputGuardPromptVersion: 'output-guard-prompt-v1',
      failurePolicy,
      groundingAuthority: {
        readGroundingIds(input) {
          groundingCalls.push(input);
          return [GROUNDING_ID];
        },
      },
    });

    const allocated = await persistence.allocateAttempt({
      subjectId: SUBJECT_ID,
      turnId: TURN_ID,
      plannerVersion: 'planner-v1',
    });
    expect(allocated).toEqual({
      attemptId: ATTEMPT_ID,
      attemptNo: 1,
      replayed: false,
    });

    await persistence.markContextReady({
      subjectId: SUBJECT_ID,
      turnId: TURN_ID,
      attemptId: ATTEMPT_ID,
    });

    const guarded = envelope();
    await persistence.stageGenerated({
      subjectId: SUBJECT_ID,
      turnId: TURN_ID,
      attemptId: ATTEMPT_ID,
      characterId: 'seyeon',
      readingId: READING_ID,
      contentBundleId: 'bundle-test',
      providerKey: 'provider-test',
      modelKey: 'model-test',
      envelope: guarded,
    });

    await persistence.stageValidationPassed({
      subjectId: SUBJECT_ID,
      turnId: TURN_ID,
      attemptId: ATTEMPT_ID,
      envelope: guarded,
    });

    const committed = await persistence.commitValidated({
      subjectId: SUBJECT_ID,
      threadId: THREAD_ID,
      turnId: TURN_ID,
      attemptId: ATTEMPT_ID,
      characterId: 'seyeon',
      providerKey: 'provider-test',
      modelKey: 'model-test',
      envelope: guarded,
    });

    expect(committed).toMatchObject({
      turnId: TURN_ID,
      attemptId: ATTEMPT_ID,
      messageId: MESSAGE_ID,
      sequenceNo: 2,
      providerKey: 'provider-test',
      modelKey: 'model-test',
      envelope: guarded,
    });

    const expectedHash = `sha256:v1:${createHash('sha256')
      .update(canonicalJson(guarded), 'utf8')
      .digest('hex')}`;

    const rendererLog = pool.calls.find(
      (call) =>
        call.text.includes('cmd_record_chat_success_ai_execution_runtime_v1') &&
        call.values[4] === 'renderer',
    );
    const generated = pool.calls.find((call) =>
      call.text.includes('cmd_mark_chat_turn_generated_runtime_v1'),
    );
    const guardLog = pool.calls.find(
      (call) =>
        call.text.includes('cmd_record_chat_success_ai_execution_runtime_v1') &&
        call.values[4] === 'output_guard',
    );
    const validation = pool.calls.find((call) =>
      call.text.includes('cmd_validate_chat_turn_attempt_runtime_v1'),
    );

    expect(rendererLog).toBeDefined();
    expect(generated).toBeDefined();
    expect(guardLog).toBeDefined();
    expect(validation).toBeDefined();

    expect(JSON.parse(rendererLog!.values[10] as string)).toEqual({
      generatedContentHash: expectedHash,
    });
    expect(generated!.values[9]).toBe(expectedHash);
    expect(JSON.parse(generated!.values[7] as string)).toEqual(guarded);
    expect(generated!.values[8]).toBe('character-dialogue-v1');
    expect(generated!.values[6]).toBeNull();

    expect(JSON.parse(guardLog!.values[10] as string)).toEqual({
      generatedContentHash: expectedHash,
    });
    expect(JSON.parse(validation!.values[5] as string)).toMatchObject({
      passed: true,
      generatedContentHash: expectedHash,
    });

    expect(rendererLog!.values[11]).toBe(READING_ID);
    expect(rendererLog!.values[12]).toBe(JSON.stringify([GROUNDING_ID]));
    expect(generated!.values[10]).toBe(JSON.stringify([GROUNDING_ID]));
    expect(guardLog!.values[11]).toBe(READING_ID);
    expect(guardLog!.values[12]).toBe(JSON.stringify([GROUNDING_ID]));
    expect(groundingCalls).toEqual([{
      subjectId: SUBJECT_ID,
      turnId: TURN_ID,
      attemptId: ATTEMPT_ID,
      characterId: 'seyeon',
      readingId: READING_ID,
    }]);

    expect(
      pool.calls
        .filter(
          (call) =>
            call.text.includes('cmd_') ||
            call.text.includes('qry_committed_chat_turn_runtime_v1'),
        )
        .map((call) => {
      if (call.text.includes('qry_committed_chat_turn_runtime_v1')) return 'read';
      if (call.text.includes('cmd_allocate_chat_turn_attempt_runtime_v1')) return 'allocate';
      if (call.text.includes('cmd_mark_chat_turn_context_ready_runtime_v1')) return 'context';
      if (
        call.text.includes('cmd_record_chat_success_ai_execution_runtime_v1') &&
        call.values[4] === 'renderer'
      ) return 'renderer_log';
      if (call.text.includes('cmd_mark_chat_turn_generated_runtime_v1')) return 'generated';
      if (
        call.text.includes('cmd_record_chat_success_ai_execution_runtime_v1') &&
        call.values[4] === 'output_guard'
      ) return 'guard_log';
      if (call.text.includes('cmd_validate_chat_turn_attempt_runtime_v1')) return 'validated';
      if (call.text.includes('cmd_commit_chat_turn_runtime_v1')) return 'committed';
      return 'other';
        }),
    ).toEqual([
      'allocate',
      'context',
      'renderer_log',
      'generated',
      'guard_log',
      'validated',
      'committed',
    ]);

    expect(pool.transactionGroups).toHaveLength(5);
    expect(
      pool.transactionGroups.every(
        (group) => group[0] === 'BEGIN' && group.at(-1) === 'COMMIT',
      ),
    ).toBe(true);

    const generatedTransaction = pool.transactionGroups.find((group) =>
      group.some((text) =>
        text.includes('cmd_mark_chat_turn_generated_runtime_v1'),
      ),
    );
    expect(
      generatedTransaction?.filter(
        (text) =>
          text.includes('cmd_record_chat_success_ai_execution_runtime_v1') ||
          text.includes('cmd_mark_chat_turn_generated_runtime_v1'),
      ),
    ).toHaveLength(2);

    const validationTransaction = pool.transactionGroups.find((group) =>
      group.some((text) =>
        text.includes('cmd_validate_chat_turn_attempt_runtime_v1'),
      ),
    );
    expect(
      validationTransaction?.filter(
        (text) =>
          text.includes('cmd_record_chat_success_ai_execution_runtime_v1') ||
          text.includes('cmd_validate_chat_turn_attempt_runtime_v1'),
      ),
    ).toHaveLength(2);
  });

  it('delegates retryability to the supplied failure policy instead of inferring it', async () => {
    const pool = new RecordingPool();
    const persistence = createPostgresCharacterProductionTurnPersistenceV1({
      pool,
      verifiedEvidence,
      createUuid: uuids(),
      rendererVersion: 'renderer-runtime-v1',
      rendererPromptVersion: 'renderer-prompt-v1',
      outputGuardPromptVersion: 'output-guard-prompt-v1',
      failurePolicy,
      groundingAuthority: {
        readGroundingIds() {
          return [];
        },
      },
    });

    await persistence.recordContextFailure({
      subjectId: SUBJECT_ID,
      turnId: TURN_ID,
      attemptId: ATTEMPT_ID,
      error: new Error('temporary'),
    });
    await persistence.recordValidationFailure({
      subjectId: SUBJECT_ID,
      turnId: TURN_ID,
      attemptId: ATTEMPT_ID,
      error: new Error('bad output'),
    });

    const failures = pool.calls.filter((call) =>
      call.text.includes('cmd_mark_chat_turn_failed_runtime_v1'),
    );
    expect(failures).toHaveLength(2);
    expect(failures[0]!.values.slice(3)).toEqual([
      'failed_retryable',
      'CONTEXT_TEMPORARY',
    ]);
    expect(failures[1]!.values.slice(3)).toEqual([
      'failed_final',
      'PRODUCTION_FAILED',
    ]);
  });

  it('rejects validation if the guarded envelope changes after generated staging', async () => {
    const pool = new RecordingPool();
    const persistence = createPostgresCharacterProductionTurnPersistenceV1({
      pool,
      verifiedEvidence,
      createUuid: uuids(),
      rendererVersion: 'renderer-runtime-v1',
      rendererPromptVersion: 'renderer-prompt-v1',
      outputGuardPromptVersion: 'output-guard-prompt-v1',
      failurePolicy,
      groundingAuthority: {
        readGroundingIds() {
          return [];
        },
      },
    });

    await persistence.stageGenerated({
      subjectId: SUBJECT_ID,
      turnId: TURN_ID,
      attemptId: ATTEMPT_ID,
      characterId: 'seyeon',
      readingId: READING_ID,
      contentBundleId: 'bundle-test',
      providerKey: 'provider-test',
      modelKey: 'model-test',
      envelope: envelope(),
    });

    await expect(
      persistence.stageValidationPassed({
        subjectId: SUBJECT_ID,
        turnId: TURN_ID,
        attemptId: ATTEMPT_ID,
        envelope: {
          ...envelope(),
          framingBefore: 'changed after staging',
        },
      }),
    ).rejects.toThrow(/changed after generated staging/u);

    expect(
      pool.calls.some(
        (call) =>
          call.text.includes('cmd_record_chat_success_ai_execution_runtime_v1') &&
          call.values[4] === 'output_guard',
      ),
    ).toBe(false);
  });

  it('reads only a committed character-dialogue-v1 payload', async () => {
    const guarded = envelope();
    const pool = new RecordingPool();
    pool.committedRow = {
      turnId: TURN_ID,
      attemptId: ATTEMPT_ID,
      messageId: MESSAGE_ID,
      sequenceNo: 2,
      provider: 'provider-test',
      model: 'model-test',
      bodyText: null,
      messagePayloadJsonb: guarded,
      messageSchemaVersion: 'character-dialogue-v1',
    };
    const persistence = createPostgresCharacterProductionTurnPersistenceV1({
      pool,
      verifiedEvidence,
      createUuid: uuids(),
      rendererVersion: 'renderer-runtime-v1',
      rendererPromptVersion: 'renderer-prompt-v1',
      outputGuardPromptVersion: 'output-guard-prompt-v1',
      failurePolicy,
      groundingAuthority: {
        readGroundingIds() {
          return [];
        },
      },
    });

    await expect(
      persistence.readCommitted({
        subjectId: SUBJECT_ID,
        turnId: TURN_ID,
      }),
    ).resolves.toMatchObject({
      turnId: TURN_ID,
      attemptId: ATTEMPT_ID,
      messageId: MESSAGE_ID,
      providerKey: 'provider-test',
      modelKey: 'model-test',
      envelope: guarded,
    });
  });
});
