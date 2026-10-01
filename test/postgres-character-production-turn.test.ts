import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  CHARACTER_OUTPUT_GUARD_VERSION_V1,
  canonicalJson,
  type CharacterDialogueEnvelopeV1,
} from '../packages/domain/src/index.js';
import {
  createPostgresCharacterProductionTurnPersistencePortV1,
} from '../apps/api/src/postgres-character-production-turn.js';
import type { PostgresTransactionQueryV1 } from '../apps/api/src/postgres-subject-execution.js';

const envelope: CharacterDialogueEnvelopeV1 = Object.freeze({
  schemaVersion: 'v1',
  framingBefore: '먼저 큰 흐름부터 볼게요.',
  protectedSajuSegments: Object.freeze([]),
  protectedSajuDisclosures: Object.freeze([]),
  calculationAmbiguity: Object.freeze([]),
  framingAfter: '여기서 더 보고 싶은 부분이 있나요?',
  emotion: 'calm',
  animationCue: null,
  memoryProposals: Object.freeze([]),
  relationshipEventProposals: Object.freeze([]),
  suggestedActions: Object.freeze([]),
});

const contentHash = `sha256:v1:${createHash('sha256')
  .update(canonicalJson(envelope))
  .digest('hex')}`;

function ids(): () => string {
  const values = [
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000005',
  ];
  return () => {
    const value = values.shift();
    if (value === undefined) throw new Error('test id factory exhausted');
    return value;
  };
}

describe('PostgreSQL Character Production turn adapter', () => {
  it('returns null for a turn that has not committed', async () => {
    const client = {
      query: vi.fn(async () => ({ rows: [] })),
    } as unknown as PostgresTransactionQueryV1;
    const port = createPostgresCharacterProductionTurnPersistencePortV1(client, ids());

    await expect(
      port.readCommitted({
        subjectId: '20000000-0000-4000-8000-000000000001',
        turnId: '30000000-0000-4000-8000-000000000001',
      }),
    ).resolves.toBeNull();
  });

  it('maps the authoritative committed replay including stored renderer provenance', async () => {
    const client = {
      query: vi.fn(async () => ({
        rows: [{
          turnId: '30000000-0000-4000-8000-000000000001',
          attemptId: '40000000-0000-4000-8000-000000000001',
          messageId: '50000000-0000-4000-8000-000000000001',
          sequenceNo: '7',
          providerKey: 'openai',
          modelKey: 'gpt-test',
          envelope,
        }],
      })),
    } as unknown as PostgresTransactionQueryV1;
    const port = createPostgresCharacterProductionTurnPersistencePortV1(client, ids());

    await expect(
      port.readCommitted({
        subjectId: '20000000-0000-4000-8000-000000000001',
        turnId: '30000000-0000-4000-8000-000000000001',
      }),
    ).resolves.toEqual({
      turnId: '30000000-0000-4000-8000-000000000001',
      attemptId: '40000000-0000-4000-8000-000000000001',
      messageId: '50000000-0000-4000-8000-000000000001',
      sequenceNo: 7,
      providerKey: 'openai',
      modelKey: 'gpt-test',
      envelope,
    });
  });

  it('allocates a server-generated attempt and preserves DB replay authority', async () => {
    const query = vi.fn(async () => ({
      rows: [{
        attemptId: '10000000-0000-4000-8000-000000000001',
        attemptNo: 2,
        replayed: false,
      }],
    }));
    const client = { query } as unknown as PostgresTransactionQueryV1;
    const port = createPostgresCharacterProductionTurnPersistencePortV1(client, ids());

    await expect(
      port.allocateAttempt({
        subjectId: '20000000-0000-4000-8000-000000000001',
        turnId: '30000000-0000-4000-8000-000000000001',
        plannerVersion: 'planner-v1',
      }),
    ).resolves.toEqual({
      attemptId: '10000000-0000-4000-8000-000000000001',
      attemptNo: 2,
      replayed: false,
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('cmd_character_production_allocate_attempt_runtime_v1'),
      [
        '20000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        'planner-v1',
      ],
    );
  });

  it('pins renderer/provider/prompt provenance and hashes the exact guarded envelope', async () => {
    const query = vi.fn(async () => ({ rows: [{ replayed: false }] }));
    const client = { query } as unknown as PostgresTransactionQueryV1;
    const port = createPostgresCharacterProductionTurnPersistencePortV1(client, ids());

    await port.stageGenerated({
      subjectId: '20000000-0000-4000-8000-000000000001',
      turnId: '30000000-0000-4000-8000-000000000001',
      attemptId: '40000000-0000-4000-8000-000000000001',
      characterId: 'seyeon',
      readingId: '60000000-0000-4000-8000-000000000001',
      contentBundleId: '70000000-0000-4000-8000-000000000001',
      providerKey: 'openai',
      modelKey: 'gpt-test',
      rendererVersion: 'renderer-v1',
      promptVersion: 'prompt-v7',
      envelope,
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('cmd_character_production_stage_generated_runtime_v1'),
      [
        '20000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        'seyeon',
        '60000000-0000-4000-8000-000000000001',
        '70000000-0000-4000-8000-000000000001',
        'openai',
        'gpt-test',
        'renderer-v1',
        'prompt-v7',
        envelope,
        contentHash,
      ],
    );
  });

  it('pins the same generated hash into Output Guard validation', async () => {
    const query = vi.fn(async () => ({ rows: [{ replayed: false }] }));
    const client = { query } as unknown as PostgresTransactionQueryV1;
    const port = createPostgresCharacterProductionTurnPersistencePortV1(client, ids());

    await port.stageValidationPassed({
      subjectId: '20000000-0000-4000-8000-000000000001',
      turnId: '30000000-0000-4000-8000-000000000001',
      attemptId: '40000000-0000-4000-8000-000000000001',
      envelope,
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('cmd_character_production_validate_runtime_v1'),
      [
        '20000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        CHARACTER_OUTPUT_GUARD_VERSION_V1,
        contentHash,
      ],
    );
  });

  it('commits only the exact staged hash and returns the DB-assigned message sequence', async () => {
    const query = vi.fn(async () => ({
      rows: [{
        turnId: '30000000-0000-4000-8000-000000000001',
        attemptId: '40000000-0000-4000-8000-000000000001',
        messageId: '10000000-0000-4000-8000-000000000001',
        sequenceNo: 8,
        replayed: false,
      }],
    }));
    const client = { query } as unknown as PostgresTransactionQueryV1;
    const port = createPostgresCharacterProductionTurnPersistencePortV1(client, ids());

    await expect(
      port.commitValidated({
        subjectId: '20000000-0000-4000-8000-000000000001',
        threadId: '80000000-0000-4000-8000-000000000001',
        turnId: '30000000-0000-4000-8000-000000000001',
        attemptId: '40000000-0000-4000-8000-000000000001',
        characterId: 'seyeon',
        providerKey: 'openai',
        modelKey: 'gpt-test',
        envelope,
      }),
    ).resolves.toMatchObject({
      turnId: '30000000-0000-4000-8000-000000000001',
      attemptId: '40000000-0000-4000-8000-000000000001',
      messageId: '10000000-0000-4000-8000-000000000001',
      sequenceNo: 8,
      providerKey: 'openai',
      modelKey: 'gpt-test',
      envelope,
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('cmd_character_production_commit_runtime_v1'),
      [
        '20000000-0000-4000-8000-000000000001',
        '80000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000002',
        'seyeon',
        'openai',
        'gpt-test',
        contentHash,
      ],
    );
  });

  it('records bounded fail-closed codes without persisting arbitrary error messages', async () => {
    const query = vi.fn(async () => ({ rows: [{ replayed: false }] }));
    const client = { query } as unknown as PostgresTransactionQueryV1;
    const port = createPostgresCharacterProductionTurnPersistencePortV1(client, ids());

    await port.recordValidationFailure({
      subjectId: '20000000-0000-4000-8000-000000000001',
      turnId: '30000000-0000-4000-8000-000000000001',
      attemptId: '40000000-0000-4000-8000-000000000001',
      error: Object.assign(new Error('do not persist this raw message'), {
        constraint: 'cmd_chat_validate_grounding_set_conflict',
      }),
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('cmd_character_production_fail_runtime_v1'),
      [
        '20000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000001',
        'CHARACTER_VALIDATION_cmd_chat_validate_grounding_set_conflict',
      ],
    );
    expect(JSON.stringify(query.mock.calls)).not.toContain('do not persist this raw message');
  });

  it('fails closed on malformed committed envelope rows', async () => {
    const client = {
      query: vi.fn(async () => ({
        rows: [{
          turnId: '30000000-0000-4000-8000-000000000001',
          attemptId: '40000000-0000-4000-8000-000000000001',
          messageId: '50000000-0000-4000-8000-000000000001',
          sequenceNo: 1,
          providerKey: 'openai',
          modelKey: 'gpt-test',
          envelope: { schemaVersion: 'v1', emotion: 'calm' },
        }],
      })),
    } as unknown as PostgresTransactionQueryV1;
    const port = createPostgresCharacterProductionTurnPersistencePortV1(client, ids());

    await expect(
      port.readCommitted({
        subjectId: '20000000-0000-4000-8000-000000000001',
        turnId: '30000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toThrow(/protectedSajuSegments/u);
  });
});
