import { describe, expect, it } from 'vitest';

import {
  guardCharacterRendererOutput,
  hashProtectedSajuTextV1,
  type CharacterDialogueEnvelopeV1,
  type CharacterRuntimeContextV1,
} from '../packages/domain/src/index.js';
import {
  commitCharacterChatTurnNoEffectsV1,
  persistValidatedCharacterGenerationV1,
  projectCharacterDialogueEnvelopeBodyTextV1,
  projectValidatedCharacterDialogueForPersistenceV1,
} from '../apps/api/src/postgres-chat-turn-generation-runtime.js';
import type {
  PostgresTransactionQueryV1,
} from '../apps/api/src/postgres-subject-execution.js';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const TURN_ID = '22222222-2222-4222-8222-222222222222';
const ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';

function guardContext(): CharacterRuntimeContextV1 {
  const readingRef = 'reading-generation-runtime-test';
  const segmentText = '검증된 사주 본문입니다.';
  const disclosureText = '이 내용은 현재 자료 범위 안에서만 해석합니다.';

  return {
    rendererPolicy: {
      allowedEmotionIds: ['neutral'],
      allowedAnimationCueIds: ['idle'],
    },
    saju: {
      readingRef,
      domain: 'general',
      coverageState: 'complete',
      protectedSegments: [{
        segmentId: 'segment-1',
        sourceReadingRef: readingRef,
        sourceRef: 'response.reading.sections.0.blocks.0',
        contentHash: hashProtectedSajuTextV1(segmentText),
        text: segmentText,
      }],
      disclosures: [{
        segmentId: 'disclosure-1',
        sourceReadingRef: readingRef,
        sourceRef: 'response.reading.disclosures.0',
        contentHash: hashProtectedSajuTextV1(disclosureText),
        text: disclosureText,
      }],
      ambiguity: ['출생시각 경계에 따라 세부 해석이 달라질 수 있습니다.'],
      capability: {
        domain: 'general',
        role: 'primary',
        canInitiate: true,
        capabilityVersion: 'cap-v1',
      },
    },
  } as unknown as CharacterRuntimeContextV1;
}

function validatedEnvelope(): CharacterDialogueEnvelopeV1 {
  return guardCharacterRendererOutput({
    context: guardContext(),
    allowedSuggestedActionKeys: ['open_records'],
    rawOutput: {
      schemaVersion: 'v1',
      framingBefore: '먼저 확인된 내용부터 보겠습니다.',
      framingAfter: '지금 상황과 연결해서 더 보고 싶은 부분이 있습니까?',
      emotion: 'neutral',
      animationCue: 'idle',
      memoryProposals: [],
      relationshipEventProposals: [],
      suggestedActions: [{ actionKey: 'open_records' }],
    },
  });
}

class ScriptedClient implements PostgresTransactionQueryV1 {
  readonly calls: { text: string; values?: readonly unknown[] }[] = [];

  constructor(
    private readonly rowsByBinding: Readonly<Record<string, readonly unknown[]>>,
  ) {}

  async query<Row>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ readonly rows: readonly Row[] }> {
    this.calls.push(values === undefined ? { text } : { text, values });

    const binding = Object.keys(this.rowsByBinding).find((key) => text.includes(key));
    if (binding === undefined) {
      throw new Error(`Unexpected SQL: ${text}`);
    }

    return {
      rows: this.rowsByBinding[binding] as readonly Row[],
    };
  }
}

describe('Validated Character dialogue persistence projection', () => {
  it('renders only exact validated envelope text in deterministic visible order', () => {
    const envelope = validatedEnvelope();

    expect(projectCharacterDialogueEnvelopeBodyTextV1(envelope)).toBe(
      [
        '먼저 확인된 내용부터 보겠습니다.',
        '검증된 사주 본문입니다.',
        '이 내용은 현재 자료 범위 안에서만 해석합니다.',
        '출생시각 경계에 따라 세부 해석이 달라질 수 있습니다.',
        '지금 상황과 연결해서 더 보고 싶은 부분이 있습니까?',
      ].join('\n\n'),
    );

    const projection = projectValidatedCharacterDialogueForPersistenceV1(envelope);
    expect(projection.messagePayload).toBe(envelope);
    expect(projection.messageSchemaVersion).toBe('character-dialogue-v1');
    expect(projection.contentHash).toMatch(/^sha256:v1:[0-9a-f]{64}$/u);
  });

  it('rejects a structural envelope lookalike that did not pass the server Output Guard', () => {
    const valid = validatedEnvelope();
    const forged = Object.freeze({
      ...valid,
      framingBefore: '위조된 문장',
    }) as CharacterDialogueEnvelopeV1;

    expect(() =>
      projectValidatedCharacterDialogueForPersistenceV1(forged),
    ).toThrow(/not minted by the server Output Guard/u);
  });
});

describe('Production Chat generation persistence adapter', () => {
  it('stages and validates the exact same guarded envelope hash through runtime wrappers', async () => {
    const client = new ScriptedClient({
      cmd_stage_chat_turn_generated_runtime_v1: [{ replayed: false }],
      cmd_validate_chat_turn_generated_runtime_v1: [{ replayed: false }],
    });
    const envelope = validatedEnvelope();

    const result = await persistValidatedCharacterGenerationV1({
      client,
      resolvedSubjectId: SUBJECT_ID,
      turnId: TURN_ID,
      attemptId: ATTEMPT_ID,
      generationAiExecutionLogId: '44444444-4444-4444-8444-444444444444',
      validationAiExecutionLogId: '55555555-5555-4555-8555-555555555555',
      providerKey: 'test-provider',
      modelKey: 'test-model',
      promptVersion: 'character-renderer-prompt-v1',
      rendererVersion: 'character-renderer-v1',
      outputGuardVersion: 'myeongha-character-output-guard-v1',
      envelope,
      groundingRefs: [],
    });

    expect(result.generatedReplayed).toBe(false);
    expect(result.validationReplayed).toBe(false);
    expect(client.calls).toHaveLength(2);
    expect(client.calls[0]!.text).toContain(
      'cmd_stage_chat_turn_generated_runtime_v1',
    );
    expect(client.calls[1]!.text).toContain(
      'cmd_validate_chat_turn_generated_runtime_v1',
    );

    const stagedHash = client.calls[0]!.values?.[11];
    expect(stagedHash).toBe(result.contentHash);

    const validationResult = JSON.parse(
      client.calls[1]!.values?.[5] as string,
    ) as Record<string, unknown>;
    expect(validationResult).toMatchObject({
      schemaVersion: 'v1',
      passed: true,
      generatedContentHash: result.contentHash,
      outputGuardVersion: 'myeongha-character-output-guard-v1',
    });

    const persistedPayload = JSON.parse(
      client.calls[0]!.values?.[9] as string,
    ) as Record<string, unknown>;
    expect(persistedPayload).toEqual(envelope);
  });

  it('rejects duplicate grounding refs before PostgreSQL', async () => {
    const client = new ScriptedClient({});

    await expect(
      persistValidatedCharacterGenerationV1({
        client,
        resolvedSubjectId: SUBJECT_ID,
        turnId: TURN_ID,
        attemptId: ATTEMPT_ID,
        generationAiExecutionLogId: '44444444-4444-4444-8444-444444444444',
        validationAiExecutionLogId: '55555555-5555-4555-8555-555555555555',
        providerKey: 'test-provider',
        modelKey: 'test-model',
        promptVersion: 'prompt-v1',
        rendererVersion: 'renderer-v1',
        outputGuardVersion: 'guard-v1',
        envelope: validatedEnvelope(),
        groundingRefs: [
          '66666666-6666-4666-8666-666666666666',
          '66666666-6666-4666-8666-666666666666',
        ],
      }),
    ).rejects.toThrow(/must not contain duplicates/u);

    expect(client.calls).toEqual([]);
  });

  it('commits only through the no-effects runtime wrapper', async () => {
    const client = new ScriptedClient({
      cmd_commit_chat_turn_no_effects_runtime_v1: [{
        turnId: TURN_ID,
        attemptId: ATTEMPT_ID,
        messageId: '77777777-7777-4777-8777-777777777777',
        sequenceNo: 2,
        replayed: false,
      }],
    });

    await expect(
      commitCharacterChatTurnNoEffectsV1({
        client,
        resolvedSubjectId: SUBJECT_ID,
        threadId: '88888888-8888-4888-8888-888888888888',
        turnId: TURN_ID,
        attemptId: ATTEMPT_ID,
        messageId: '77777777-7777-4777-8777-777777777777',
        outboxEventId: '99999999-9999-4999-8999-999999999999',
      }),
    ).resolves.toEqual({
      turnId: TURN_ID,
      attemptId: ATTEMPT_ID,
      messageId: '77777777-7777-4777-8777-777777777777',
      sequenceNo: 2,
      replayed: false,
    });

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]!.text).toContain(
      'cmd_commit_chat_turn_no_effects_runtime_v1',
    );
    expect(client.calls[0]!.text).not.toContain('cmd_commit_chat_turn_v1(');
  });
});
