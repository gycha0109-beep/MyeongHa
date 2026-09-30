import { describe, expect, it } from 'vitest';

import type { CharacterDialogueEnvelopeV1 } from '../packages/domain/src/index.js';
import {
  CHARACTER_DIALOGUE_MESSAGE_SCHEMA_VERSION_V1,
  serializeCharacterDialogueEnvelopeForPersistenceV1,
} from '../apps/api/src/character-dialogue-message-persistence.js';

function envelope(): CharacterDialogueEnvelopeV1 {
  return {
    schemaVersion: 'v1',
    framingBefore: '먼저 기록을 보겠습니다.',
    protectedSajuSegments: [{
      segmentId: 'segment-1',
      sourceReadingRef: 'reading-1',
      sourceRef: 'source-1',
      contentHash: 'sha256:v1:segment',
      text: '검증된 사주 본문입니다.',
    }],
    protectedSajuDisclosures: [{
      segmentId: 'disclosure-1',
      sourceReadingRef: 'reading-1',
      sourceRef: 'disclosure-source-1',
      contentHash: 'sha256:v1:disclosure',
      text: '검증된 고지 문구입니다.',
    }],
    calculationAmbiguity: ['계산상 애매성이 있습니다.'],
    framingAfter: '현재 상황과 연결해 보실까요?',
    emotion: 'neutral',
    animationCue: null,
    memoryProposals: [],
    relationshipEventProposals: [],
    suggestedActions: [],
  };
}

describe('Character dialogue message persistence v1', () => {
  it('renders visible text in deterministic guarded-envelope order', () => {
    const result = serializeCharacterDialogueEnvelopeForPersistenceV1(envelope());

    expect(result.bodyText).toBe([
      '먼저 기록을 보겠습니다.',
      '검증된 사주 본문입니다.',
      '검증된 고지 문구입니다.',
      '계산상 애매성이 있습니다.',
      '현재 상황과 연결해 보실까요?',
    ].join('\n\n'));
    expect(result.messageSchemaVersion).toBe(
      CHARACTER_DIALOGUE_MESSAGE_SCHEMA_VERSION_V1,
    );
    expect(result.messagePayloadJsonb).toEqual({
      schemaVersion: CHARACTER_DIALOGUE_MESSAGE_SCHEMA_VERSION_V1,
      envelope: envelope(),
    });
    expect(result.contentHash).toMatch(/^sha256:v1:[0-9a-f]{64}$/u);
  });

  it('is deterministic for the exact same validated envelope', () => {
    const first = serializeCharacterDialogueEnvelopeForPersistenceV1(envelope());
    const second = serializeCharacterDialogueEnvelopeForPersistenceV1(envelope());
    expect(second).toEqual(first);
  });

  it('rejects unresolved side-effect proposals and envelopes with no visible text', () => {
    expect(() =>
      serializeCharacterDialogueEnvelopeForPersistenceV1({
        ...envelope(),
        relationshipEventProposals: ['RETURN_VISIT'],
      }),
    ).toThrow(/side-effect proposals/u);

    expect(() =>
      serializeCharacterDialogueEnvelopeForPersistenceV1({
        ...envelope(),
        framingBefore: null,
        protectedSajuSegments: [],
        protectedSajuDisclosures: [],
        calculationAmbiguity: [],
        framingAfter: null,
      }),
    ).toThrow(/no visible persisted text/u);
  });
});
