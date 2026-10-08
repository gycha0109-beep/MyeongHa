import { describe, expect, it, vi } from 'vitest';
import { runCharacterGovernedPreflightV1 } from '../apps/api/src/character-governed-preflight-v1.js';
import { createSeyeonUnifiedGovernanceCandidateV1 } from '../apps/api/src/seyeon-unified-governance-candidate-v1.js';

function candidate(raw: unknown) {
  const generate = vi.fn(async () => raw);
  const originalIntegrity = vi.fn(async () => { throw new Error('legacy classifier must not run'); });
  const originalDisclosure = vi.fn(async () => { throw new Error('legacy classifier must not run'); });
  const resolve = vi.fn(() => ({
    state: 'MISSING' as const, authorityRefs: [], provenanceRefs: ['test:unresolved'],
  }));
  const retrieve = vi.fn(() => []);
  const governance = createSeyeonUnifiedGovernanceCandidateV1({
    provider: { providerKey: 'test', modelKey: 'test', generate },
    governance: {
      relationship: { gate: 'PUBLIC', trustBand: 'low', relevantSharedHistoryRefs: [] },
      integrity: {
        classifier: { classify: originalIntegrity },
        authorityResolver: { resolve },
      },
      disclosure: {
        classifier: { classify: originalDisclosure },
        sourceDescriptor: { readDescriptor() { throw new Error('unexpected source access'); } },
        factAuthorityResolver: { resolve() { throw new Error('unexpected private authority'); } },
        retriever: { retrieve },
      },
    },
  });
  return { governance, generate, resolve, retrieve, originalIntegrity, originalDisclosure };
}

async function preflight(governance: ReturnType<typeof candidate>['governance'], userText = '안녕') {
  return runCharacterGovernedPreflightV1({
    characterId: 'seyeon',
    userText,
    userMessageRef: 'user-message-1',
    relationship: governance.relationship,
    integrity: governance.integrity,
    disclosure: governance.disclosure,
  });
}

describe('Seyeon governed one-call preflight candidate (NOT live)', () => {
  it('uses one structured API call while retaining both existing preflight evaluators', async () => {
    const { governance, generate, originalIntegrity, originalDisclosure } = candidate({
      claims: [], topicKey: null, questionContext: 'casual_curiosity',
    });
    const result = await preflight(governance);
    expect(generate).toHaveBeenCalledOnce();
    expect(result.integrity.decisions).toEqual([]);
    expect(result.disclosure.status).toBe('not_sensitive');
    expect(result.retrievedPrivateSources).toEqual([]);
    expect(originalIntegrity).not.toHaveBeenCalled();
    expect(originalDisclosure).not.toHaveBeenCalled();
  });

  it('does not promote fabricated shared history as authority', async () => {
    const { governance, generate, resolve } = candidate({
      claims: [{ claimId: 'claim1', kind: 'SHARED_EVENT_CLAIM', statement: '우리 이미 만났어.' }],
      topicKey: null, questionContext: 'casual_curiosity',
    });
    const result = await preflight(governance, '우리 이미 만났어.');
    expect(generate).toHaveBeenCalledOnce();
    expect(resolve).toHaveBeenCalledOnce();
    expect(result.integrity.decisions).toHaveLength(1);
    expect(result.integrity.decisions[0]?.mayEnterWorkingContextAsFact).not.toBe(true);
  });

  it('fails closed for invalid model topics and never retrieves private records', async () => {
    const { governance, generate, retrieve } = candidate({
      claims: [], topicKey: 'invented-private-topic', questionContext: 'casual_curiosity',
    });
    await expect(preflight(governance)).rejects.toThrow();
    expect(generate).toHaveBeenCalledOnce();
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('rejects cross-turn and cross-character reuse before calling the provider again', async () => {
    const { governance, generate } = candidate({
      claims: [], topicKey: null, questionContext: 'casual_curiosity',
    });
    await preflight(governance);
    await expect(preflight(governance, '다른 메시지')).rejects.toThrow('two different user messages');
    await expect(governance.integrity.classifier.classify({
      characterId: 'another-character', userText: '안녕',
    })).rejects.toThrow('one bounded Se-yeon user turn');
    expect(generate).toHaveBeenCalledOnce();
  });
});
