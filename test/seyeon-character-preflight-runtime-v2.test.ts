import { describe, expect, it } from 'vitest';

import {
  runSeyeonCharacterTurnWithPreflightV2,
} from '../apps/api/src/seyeon-character-preflight-runtime-v2.js';
import type {
  SeyeonStructuredProviderPortV2,
  SeyeonStructuredProviderRequestV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';
import {
  resolveSeyeonFactAuthorityV1,
} from '../packages/character-content/src/character-fact-authority-v1.js';

class Provider implements SeyeonStructuredProviderPortV2 {
  readonly providerKey = 'test-provider';
  readonly modelKey = 'test-model';
  readonly requests: SeyeonStructuredProviderRequestV2[] = [];

  constructor(
    private readonly output:
      | unknown
      | ((request: SeyeonStructuredProviderRequestV2) => unknown),
  ) {}

  generate(request: SeyeonStructuredProviderRequestV2): unknown {
    this.requests.push(request);
    return typeof this.output === 'function'
      ? (this.output as (request: SeyeonStructuredProviderRequestV2) => unknown)(
          request,
        )
      : this.output;
  }
}

function interpretation(messageId: string) {
  return {
    schemaVersion: 'seyeon-turn-interpretation-v2',
    userMove: 'neutral_or_other',
    notice: {
      summary: '사용자 전제와 authority를 구분한다.',
      evidenceRefs: [messageId],
    },
    immediateWant: {
      key: 'break_awkwardness',
      summary: '사실을 만들지 않고 세연답게 반응한다.',
    },
    tension: {
      key: 'none_material',
      summary: '사실 판정과 표현을 분리한다.',
    },
    chosenAction: {
      key: 'tease',
      rationale: '가볍게 되묻되 전제를 사실로 받아들이지 않는다.',
    },
    expressionState: 'playful',
    reveal: {
      level: 'public',
      triggerRef: messageId,
      supportingHistoryRefs: [],
    },
    memoryRefsUsed: [],
  };
}

function renderer(utterance: string) {
  return {
    schemaVersion: 'seyeon-renderer-draft-v2',
    utterance,
    expressionState: 'playful',
    revealLevel: 'public',
    memoryRefsMentioned: [],
    privateSourceRefsMentioned: [],
    disclosureSliceIds: [],
  };
}

function reviewer(request: SeyeonStructuredProviderRequestV2) {
  const input = request.input as { expectedUtteranceHash: string };
  return {
    schemaVersion: 'seyeon-semantic-review-v2',
    reviewedUtteranceHash: input.expectedUtteranceHash,
    failureCodes: [],
    evidence: [],
  };
}

describe('Se-yeon preflight runtime v2', () => {
  it('runs Integrity before Disclosure and carries an unverified shared-event claim into Working Context', async () => {
    const order: string[] = [];
    const interpreter = new Provider((request) => {
      order.push('interpreter');
      const context = request.input as {
        integrity: { decisions: Array<{ result: string }> };
      };
      expect(context.integrity.decisions[0]?.result).toBe('UNVERIFIED');
      return interpretation('message:current');
    });

    const result = await runSeyeonCharacterTurnWithPreflightV2({
      userMessage: '우리 어제 키스했잖아.',
      contextInput: {
        relationship: null,
        recentMessages: [
          {
            messageId: 'message:current',
            role: 'user',
            text: '우리 어제 키스했잖아.',
          },
        ],
        retrievedMemories: [],
      },
      disclosureRelationship: {
        gate: 'PUBLIC',
        trustBand: 'low',
        relevantSharedHistoryRefs: [],
      },
      integrityClassifier: {
        classify() {
          order.push('integrity:classify');
          return [
            {
              claimId: 'claim:kiss',
              kind: 'SHARED_EVENT_CLAIM',
              normalizedClaim: '사용자와 세연이 어제 키스했다',
              factKey: null,
            },
          ];
        },
      },
      integrityAuthorityResolver: {
        resolve() {
          order.push('integrity:resolve');
          return {
            sourceKind: 'EVENT_LEDGER',
            match: 'NO_EVIDENCE',
            sourceRefs: [],
            factAuthority: null,
          };
        },
      },
      disclosureClassifier: {
        classify() {
          order.push('disclosure:classify');
          return {
            topicKey: null,
            questionContext: 'casual_curiosity',
          };
        },
      },
      disclosureSourceMetadata: {
        readMetadata() {
          throw new Error('non-sensitive turn must not read private source metadata');
        },
      },
      privateSourceRetriever: {
        retrieve() {
          throw new Error('non-sensitive turn must not retrieve private source');
        },
      },
      interpreterProvider: interpreter,
      rendererProvider: new Provider(
        renderer('어제요? 그건 제가 기억하는 쪽에는 없는데요.'),
      ),
      semanticReviewerProvider: new Provider(reviewer),
    });

    expect(order).toEqual([
      'integrity:classify',
      'integrity:resolve',
      'disclosure:classify',
      'interpreter',
    ]);
    expect(result.integrity.decisions[0]?.result).toBe('UNVERIFIED');
    expect(
      result.turn.context.integrity.decisions[0]?.commitPolicy
        .mayTreatAsSharedHistory,
    ).toBe(false);
    expect(result.turn.context.integrity.userClaimRequiresIntegrityDecision).toBe(
      true,
    );
  });

  it('keeps a false-premise past-romance question AUTHOR_UNDEFINED even at deep trust and never retrieves private biography', async () => {
    const order: string[] = [];
    let privateRetrievalCalls = 0;
    const factAuthority = resolveSeyeonFactAuthorityV1(
      'past_romance.existence',
    );

    const interpreter = new Provider((request) => {
      order.push('interpreter');
      const context = request.input as {
        integrity: { decisions: Array<{ result: string }> };
        disclosure: { decision: { result: string } | null; retrievedSources: unknown[] };
      };
      expect(context.integrity.decisions[0]?.result).toBe('UNVERIFIED');
      expect(context.disclosure.decision?.result).toBe('AUTHORITY_ABSTAIN');
      expect(context.disclosure.retrievedSources).toEqual([]);
      return interpretation('message:current');
    });

    const result = await runSeyeonCharacterTurnWithPreflightV2({
      userMessage: '너 전남친한테 배신당해서 사람 시험하는 거잖아.',
      contextInput: {
        relationship: {
          stageKey: 'deep_trust',
          closenessBand: 'high',
          trustBand: 'high',
          frictionBand: 'low',
          revision: 31,
          policyVersion: 'relationship-policy-v1',
        },
        recentMessages: [
          {
            messageId: 'message:current',
            role: 'user',
            text: '너 전남친한테 배신당해서 사람 시험하는 거잖아.',
          },
        ],
        retrievedMemories: [
          {
            memoryId: 'event:trust',
            kind: 'relationship_event',
            claimKind: 'fact',
            summary: '실제 깊은 신뢰를 뒷받침하는 관계 사건',
            sourceRef: 'event:trust',
            relevance: 0.9,
            salience: 0.9,
          },
        ],
      },
      disclosureRelationship: {
        gate: 'DEEP_TRUST',
        trustBand: 'high',
        relevantSharedHistoryRefs: ['event:trust'],
      },
      integrityClassifier: {
        classify() {
          order.push('integrity:classify');
          return [
            {
              claimId: 'claim:betrayal',
              kind: 'CHARACTER_FACT_CLAIM',
              normalizedClaim: '세연은 전 연인에게 배신당했다',
              factKey: 'past_romance.existence',
            },
          ];
        },
      },
      integrityAuthorityResolver: {
        resolve() {
          order.push('integrity:resolve');
          return {
            sourceKind: 'CHARACTER_BIBLE',
            match: 'NO_EVIDENCE',
            sourceRefs: [factAuthority.sourceRef],
            factAuthority,
          };
        },
      },
      disclosureClassifier: {
        classify() {
          order.push('disclosure:classify');
          return {
            topicKey: 'past_romance_detail',
            questionContext: 'relationship_relevant',
          };
        },
      },
      disclosureSourceMetadata: {
        readMetadata() {
          order.push('disclosure:metadata');
          return {
            topicKey: 'past_romance_detail',
            sourceAuthorityState: 'AUTHOR_UNDEFINED',
            characterKnowledge: 'NOT_APPLICABLE',
            disclosureDefault: 'NOT_APPLICABLE',
            allowedDepth: 'deep',
            previouslyDisclosedDepth: 'none',
            sourceRef: factAuthority.sourceRef,
          };
        },
      },
      privateSourceRetriever: {
        retrieve() {
          privateRetrievalCalls += 1;
          throw new Error('AUTHOR_UNDEFINED private biography must never be retrieved');
        },
      },
      interpreterProvider: interpreter,
      rendererProvider: new Provider(
        renderer('그 전제부터 제가 확인해드릴 수 있는 사실은 아닌데요.'),
      ),
      semanticReviewerProvider: new Provider(reviewer),
    });

    expect(order).toEqual([
      'integrity:classify',
      'integrity:resolve',
      'disclosure:classify',
      'disclosure:metadata',
      'interpreter',
    ]);
    expect(privateRetrievalCalls).toBe(0);
    expect(result.disclosure.status).toBe('sensitive');
    if (result.disclosure.status === 'sensitive') {
      expect(result.disclosure.decision.authorityDisposition).toBe(
        'AUTHORING_GAP',
      );
      expect(result.disclosure.decision.result).toBe('AUTHORITY_ABSTAIN');
    }
    expect(result.retrievedPrivateSources).toEqual([]);
  });

  it('fails before any model call when disclosure trust does not match the relationship projection', async () => {
    let providerCalls = 0;
    const provider = new Provider(() => {
      providerCalls += 1;
      return {};
    });

    await expect(
      runSeyeonCharacterTurnWithPreflightV2({
        userMessage: '안녕하세요.',
        contextInput: {
          relationship: {
            stageKey: 'familiar',
            closenessBand: 'medium',
            trustBand: 'medium',
            frictionBand: 'low',
            revision: 2,
            policyVersion: 'relationship-policy-v1',
          },
          recentMessages: [
            {
              messageId: 'message:current',
              role: 'user',
              text: '안녕하세요.',
            },
          ],
          retrievedMemories: [],
        },
        disclosureRelationship: {
          gate: 'FAMILIAR',
          trustBand: 'high',
          relevantSharedHistoryRefs: [],
        },
        integrityClassifier: { classify: () => [] },
        integrityAuthorityResolver: {
          resolve: () => {
            throw new Error('must not run');
          },
        },
        disclosureClassifier: {
          classify: () => ({
            topicKey: null,
            questionContext: 'casual_curiosity',
          }),
        },
        disclosureSourceMetadata: {
          readMetadata: () => {
            throw new Error('must not run');
          },
        },
        privateSourceRetriever: {
          retrieve: () => {
            throw new Error('must not run');
          },
        },
        interpreterProvider: provider,
        rendererProvider: provider,
        semanticReviewerProvider: provider,
      }),
    ).rejects.toThrow(/trustBand must match/);

    expect(providerCalls).toBe(0);
  });
});
