import { describe, expect, it } from 'vitest';

import { runCharacterGovernedPreflightV1 } from '../apps/api/src/character-governed-preflight-v1.js';
import type { CharacterFactAuthorityEntryV1 } from '../packages/character-content/src/character-fact-authority-v1.js';

function factAuthority(
  overrides: Partial<CharacterFactAuthorityEntryV1> = {},
): CharacterFactAuthorityEntryV1 {
  return {
    factKey: 'past_romance.existence',
    sourceAuthority: 'CANON',
    characterKnowledge: 'KNOWN',
    disclosureDefault: 'FAMILIAR',
    sourceSection: 'J4',
    closureNote: 'test fixture',
    ...overrides,
  };
}

const relationship = {
  gate: 'DEEP_TRUST' as const,
  trustBand: 'high' as const,
  relevantSharedHistoryRefs: ['event:deep-trust'],
};

describe('Character governed preflight v1', () => {
  it('enforces Integrity -> Disclosure -> retrieval and never forwards false-premise text to retriever', async () => {
    const calls: string[] = [];
    const retrieverInputs: unknown[] = [];
    const userText = '전남친한테 배신당해서 사람 시험하는 거잖아.';

    const result = await runCharacterGovernedPreflightV1({
      characterId: 'seyeon',
      userMessageRef: 'message:false-premise-1',
      userText,
      relationship,
      integrity: {
        classifier: {
          classify(input) {
            calls.push('integrity.classifier');
            expect(input.userText).toBe(userText);
            return {
              claims: [{
                claimId: 'claim:betrayal',
                kind: 'CHARACTER_FACT_CLAIM',
                statement: '세연은 전 연인에게 배신당했다.',
              }],
            };
          },
        },
        authorityResolver: {
          resolve() {
            calls.push('integrity.authority');
            return {
              state: 'MISSING',
              authorityRefs: ['bible:J4'],
              factAuthority: factAuthority(),
            };
          },
        },
      },
      disclosure: {
        classifier: {
          classify(input) {
            calls.push('disclosure.classifier');
            expect(input.userQuestion).toBe(userText);
            return {
              topicKey: 'past_romance_detail',
              questionContext: 'relationship_relevant',
            };
          },
        },
        sourceDescriptor: {
          readDescriptor(input) {
            calls.push('disclosure.descriptor');
            expect(input).toEqual({
              characterId: 'seyeon',
              topicKey: 'past_romance_detail',
            });
            return {
              topicKey: 'past_romance_detail',
              factKey: 'past_romance.existence',
              sourceRef: 'bible:J4',
              allowedDepth: 'deep',
              previouslyDisclosedDepth: 'none',
            };
          },
        },
        factAuthorityResolver: {
          resolve(input) {
            calls.push('disclosure.fact-authority');
            expect(input).toEqual({
              characterId: 'seyeon',
              factKey: 'past_romance.existence',
            });
            return factAuthority();
          },
        },
        retriever: {
          retrieve(input) {
            calls.push('disclosure.retriever');
            retrieverInputs.push(input);
            return [{
              topicKey: input.topicKey,
              factKey: input.factKey,
              depth: input.depth,
              sourceRef: input.sourceRef,
              content: 'authoritative source-backed private content',
            }];
          },
        },
      },
    });

    expect(calls).toEqual([
      'integrity.classifier',
      'integrity.authority',
      'disclosure.classifier',
      'disclosure.descriptor',
      'disclosure.fact-authority',
      'disclosure.retriever',
    ]);
    expect(result.integrity.decisions[0]?.result).toBe('UNVERIFIED');
    expect(result.disclosure.status).toBe('sensitive');
    expect(result.retrievedPrivateSources).toHaveLength(1);
    expect(JSON.stringify(retrieverInputs)).not.toContain('배신');
    expect(JSON.stringify(retrieverInputs)).not.toContain(userText);
  });

  it('runs Integrity first and stops before Disclosure when Integrity fails closed', async () => {
    const calls: string[] = [];
    await expect(runCharacterGovernedPreflightV1({
      characterId: 'seyeon',
      userMessageRef: 'message:invalid-integrity',
      userText: '우리 어제 키스했잖아.',
      relationship,
      integrity: {
        classifier: {
          classify() {
            calls.push('integrity.classifier');
            return { claims: 'invalid' };
          },
        },
        authorityResolver: {
          resolve() {
            calls.push('integrity.authority');
            return { state: 'MISSING', authorityRefs: [] };
          },
        },
      },
      disclosure: {
        classifier: {
          classify() {
            calls.push('disclosure.classifier');
            return { topicKey: null, questionContext: 'casual_curiosity' };
          },
        },
        sourceDescriptor: {
          readDescriptor() {
            throw new Error('must not run');
          },
        },
        factAuthorityResolver: {
          resolve() {
            throw new Error('must not run');
          },
        },
        retriever: {
          retrieve() {
            throw new Error('must not run');
          },
        },
      },
    })).rejects.toThrow(/claims must be an array/);
    expect(calls).toEqual(['integrity.classifier']);
  });

  it('does not create authority, disclosure history, relationship events, or retrieval through 100 repeats', async () => {
    let retrievalCalls = 0;
    let descriptorCalls = 0;

    for (let index = 0; index < 100; index += 1) {
      const result = await runCharacterGovernedPreflightV1({
        characterId: 'seyeon',
        userMessageRef: 'message:repeat-' + index,
        userText: '전남친한테 배신당했잖아.',
        relationship,
        integrity: {
          classifier: {
            classify() {
              return {
                claims: [{
                  claimId: 'claim:repeat-' + index,
                  kind: 'CHARACTER_FACT_CLAIM',
                  statement: '세연은 전 연인에게 배신당했다.',
                }],
              };
            },
          },
          authorityResolver: {
            resolve() {
              return {
                state: 'MISSING',
                authorityRefs: ['bible:J4'],
                factAuthority: factAuthority({
                  sourceAuthority: 'AUTHOR_UNDEFINED',
                  characterKnowledge: 'NOT_APPLICABLE',
                  disclosureDefault: 'NOT_APPLICABLE',
                }),
              };
            },
          },
        },
        disclosure: {
          classifier: {
            classify() {
              return {
                topicKey: 'past_romance_detail',
                questionContext: 'relationship_relevant',
              };
            },
          },
          sourceDescriptor: {
            readDescriptor() {
              descriptorCalls += 1;
              return {
                topicKey: 'past_romance_detail',
                factKey: 'past_romance.existence',
                sourceRef: 'bible:J4',
                allowedDepth: 'deep',
                previouslyDisclosedDepth: 'none',
              };
            },
          },
          factAuthorityResolver: {
            resolve() {
              return factAuthority({
                sourceAuthority: 'AUTHOR_UNDEFINED',
                characterKnowledge: 'NOT_APPLICABLE',
                disclosureDefault: 'NOT_APPLICABLE',
              });
            },
          },
          retriever: {
            retrieve() {
              retrievalCalls += 1;
              return [];
            },
          },
        },
      });

      expect(result.integrity.decisions[0]?.result).toBe('UNVERIFIED');
      expect(result.integrity.decisions[0]?.mayCreateRelationshipEvent).toBe(false);
      expect(result.integrity.decisions[0]?.mayMutateRelationshipState).toBe(false);
      expect(result.disclosure.status).toBe('sensitive');
      if (result.disclosure.status === 'sensitive') {
        expect(result.disclosure.decision.result).toBe('AUTHORITY_ABSTAIN');
        expect(result.disclosure.decision.reasonCode).toBe('AUTHOR_UNDEFINED');
        expect(result.disclosure.source.previouslyDisclosedDepth).toBe('none');
      }
      expect(result.retrievedPrivateSources).toEqual([]);
    }

    expect(descriptorCalls).toBe(100);
    expect(retrievalCalls).toBe(0);
  });
});
