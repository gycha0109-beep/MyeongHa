import { describe, expect, it } from 'vitest';
import {
  InMemoryCharacterChatCommitPortV1,
  runMockCharacterChatTurn,
  type CharacterRuntimeContextAssemblyInputV1,
} from '../apps/api/src/index.js';
import type { CharacterDialogueEnvelopeV1 } from '../packages/domain/src/index.js';

const committedEnvelope: CharacterDialogueEnvelopeV1 = {
  schemaVersion: 'v1',
  framingBefore: '이미 검증된 응답입니다.',
  protectedSajuSegments: [],
  protectedSajuDisclosures: [],
  calculationAmbiguity: [],
  framingAfter: null,
  emotion: 'neutral',
  animationCue: null,
  memoryProposals: [],
  relationshipEventProposals: [],
  suggestedActions: [],
};

describe('committed Character Chat replay provenance', () => {
  it('returns the original committed provider/model without invoking a replacement renderer', () => {
    const commitPort = new InMemoryCharacterChatCommitPortV1();
    const committed = commitPort.commit({
      turnId: 'turn-replay-provenance',
      attemptId: 'attempt-original',
      providerKey: 'provider-original',
      modelKey: 'model-original',
      envelope: committedEnvelope,
    });

    let replacementCalls = 0;
    const result = runMockCharacterChatTurn({
      turnId: 'turn-replay-provenance',
      attemptId: 'attempt-retry',
      capability: {
        needsSaju: false,
        characterCapabilityAllowed: false,
        userConsentAllowed: false,
        sajuDomainAvailability: 'not_requested',
        worldStateAllowed: false,
        entitlementAllowed: false,
        contentPolicyAllowed: false,
        clientCapabilityAllowed: false,
      },
      contextInput: {} as CharacterRuntimeContextAssemblyInputV1,
      allowedSuggestedActionKeys: [],
      renderer: {
        providerKey: 'provider-replacement',
        modelKey: 'model-replacement',
        render() {
          replacementCalls += 1;
          throw new Error('replacement renderer must not run');
        },
      },
      commitPort,
    });

    expect(result.status).toBe('delivered');
    if (result.status !== 'delivered') throw new Error('Expected delivered replay.');
    expect(result.replayedCommittedTurn).toBe(true);
    expect(result.providerKey).toBe('provider-original');
    expect(result.modelKey).toBe('model-original');
    expect(result.commitReceipt).toEqual(committed.receipt);
    expect(result.envelope).toEqual(committedEnvelope);
    expect(replacementCalls).toBe(0);
  });
});
