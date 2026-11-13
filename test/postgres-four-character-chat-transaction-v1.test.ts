import { describe, expect, it, vi } from 'vitest';
import {
  FourCharacterProductionExecutionHeldV1,
  type FourCharacterAtomicReservationV1,
  type FourCharacterGeneratedDraftV1,
  type FourCharacterValidatedReplyV1,
  type PublishedFourCharacterModelSourceV1,
} from '../apps/api/src/four-character-production-chat-executor-v1.js';
import {
  createPostgresFourCharacterChatTransactionPortV1,
  type FourCharacterSubjectTransactionRunnerV1,
} from '../apps/api/src/postgres-four-character-chat-transaction-v1.js';

const subjectId = '11111111-1111-4111-8111-111111111111';
const threadId = '22222222-2222-4222-8222-222222222222';
const threadCharacterId = '33333333-3333-4333-8333-333333333333';
const releaseId = '44444444-4444-4444-8444-444444444444';
const bundleId = '55555555-5555-4555-8555-555555555555';
const turnId = '66666666-6666-4666-8666-666666666666';
const attemptId = '77777777-7777-4777-8777-777777777777';
const costReservationId = '88888888-8888-4888-8888-888888888888';
const sourceDigest = 'sha256:v1:' + 'a'.repeat(64);

function heldPort() {
  const run = vi.fn(async () => {
    throw new Error('A database transaction must not open for an over-limit message.');
  });
  const runner = { run } as unknown as FourCharacterSubjectTransactionRunnerV1;
  return {
    port: createPostgresFourCharacterChatTransactionPortV1({ runner }),
    run,
  };
}

describe('PostgreSQL four-Character chat message bounds', () => {
  it('rejects over-limit user text before opening the receive transaction', async () => {
    const h = heldPort();

    await expect(h.port.reserveAttempt({
      subjectId,
      threadId,
      clientTurnId: 'client-turn-1',
      characterId: 'baekheon',
      releaseId,
      bundleId,
      sourceDigest,
      userText: '😀'.repeat(4001),
    })).rejects.toThrow(FourCharacterProductionExecutionHeldV1);

    expect(h.run).not.toHaveBeenCalled();
  });

  it('rejects over-limit assistant text before opening the commit transaction', async () => {
    const h = heldPort();
    const bodyText = '😀'.repeat(4001);
    const reservation: FourCharacterAtomicReservationV1 = {
      status: 'reserved',
      subjectId,
      threadId,
      threadCharacterId,
      characterId: 'baekheon',
      releaseId,
      bundleId,
      sourceDigest,
      turnId,
      attemptId,
      costReservationId,
    };
    const source: PublishedFourCharacterModelSourceV1 = {
      status: 'published',
      characterId: 'baekheon',
      releaseId,
      bundleId,
      contentVersion: 'approved-v1',
      assetManifestHash: 'approved-assets',
      cueSchemaVersion: 'approved-cues',
      bibleSourceRef: 'approved://bible/baekheon',
      runtimeSourceRef: 'approved://runtime/baekheon',
      sourceDigest,
      canonicalContext: 'approved context',
    };
    const generated: FourCharacterGeneratedDraftV1 = {
      characterId: 'baekheon',
      bodyText,
      providerKey: 'approved-provider',
      modelKey: 'approved-model',
      usage: { inputTokens: 1, outputTokens: 1 },
    };
    const validated: FourCharacterValidatedReplyV1 = {
      characterId: 'baekheon',
      bodyText,
      outputGuardVersion: 'approved-guard-v1',
      groundingRefs: [],
      approved: true,
    };

    await expect(h.port.commitValidatedAndIssue({
      reservation, source, generated, validated,
    })).rejects.toThrow(FourCharacterProductionExecutionHeldV1);

    expect(h.run).not.toHaveBeenCalled();
  });
});
