import { describe, expect, it } from 'vitest';
import {
  buildCharacterGovernedPreflightContextLayersV1,
} from '../apps/api/src/character-governed-preflight-context-layers-v1.js';
import {
  evaluateCharacterIntegrityClaimV1,
} from '../packages/domain/src/character-integrity-gate-v1.js';
import type {
  CharacterDisclosurePreflightResultV2,
} from '../apps/api/src/character-disclosure-preflight-v2.js';

const claim = Object.freeze({
  claimId: 'c1',
  kind: 'USER_SELF_REPORT' as const,
  statement: '나의 마음에 대한 개인적인 진술',
  sourceRef: 'message-user',
});

function input() {
  return {
    characterId: 'baekheon',
    currentUserMessageId: 'message-user',
    integrity: {
      schemaVersion: 'character-integrity-preflight-v1' as const,
      characterId: 'baekheon',
      userMessageRef: 'message-user',
      classification: {
        claims: [{ claimId: claim.claimId, kind: claim.kind, statement: claim.statement }],
      },
      decisions: [evaluateCharacterIntegrityClaimV1({ claim })],
    },
    disclosure: {
      schemaVersion: 'character-disclosure-preflight-v2' as const,
      status: 'not_sensitive' as const,
      classification: {
        topicKey: null,
        questionContext: 'casual_curiosity' as const,
      },
      source: null,
      factAuthority: null,
      decision: null,
    },
  };
}

describe('offline governed Integrity/Disclosure decision projection', () => {
  it('preserves USER_ASSERTED rather than upgrading it to a verified Fact', () => {
    const result = buildCharacterGovernedPreflightContextLayersV1(input());
    expect(result.disclosureDecision).toBeUndefined();
    expect(result.integrityClaimDecisions).toHaveLength(1);
    const payload = JSON.parse(result.integrityClaimDecisions[0]!.text);
    expect(payload).toMatchObject({
      claimKind: 'USER_SELF_REPORT',
      result: 'USER_ASSERTED',
      verifiedFactAllowed: false,
      userAssertionAllowed: true,
    });
    expect(JSON.stringify(result)).not.toContain(claim.statement);
    expect(result.integrityClaimDecisions[0]!.sourceRef)
      .toBe('integrity:message-user:1');
  });

  it('projects sensitive boundary decisions without private source content', () => {
    const base = input();
    const disclosure = {
      schemaVersion: 'character-disclosure-preflight-v2',
      status: 'sensitive',
      classification: {
        topicKey: 'deep_vulnerability',
        questionContext: 'pressuring',
      },
      source: { topicKey: 'deep_vulnerability' },
      decision: {
        schemaVersion: 'character-disclosure-decision-v2',
        characterId: 'baekheon',
        topicKey: 'deep_vulnerability',
        result: 'BOUNDARY',
        reasonCode: 'PRESSURING_CONTEXT',
        retrievalScope: { depth: 'none', sourceRef: null },
        behaviorAction: 'Keep the private boundary.',
        authorityGap: false,
        knowledgeGap: false,
        privatePayload: 'NEVER_SHOW_PRIVATE_SOURCE',
      },
    } as unknown as CharacterDisclosurePreflightResultV2;
    const result = buildCharacterGovernedPreflightContextLayersV1({
      ...base,
      disclosure,
    });
    expect(JSON.parse(result.disclosureDecision!.text)).toMatchObject({
      result: 'BOUNDARY',
      disclosureDepth: 'none',
      privateSourceContentIncluded: false,
    });
    expect(JSON.stringify(result)).not.toContain('NEVER_SHOW_PRIVATE_SOURCE');
  });

  it('refuses a stale or foreign preflight instead of mixing different turns', () => {
    const base = input();
    for (const stale of [
      { ...base, currentUserMessageId: 'another-turn' },
      { ...base, characterId: 'yeoul' },
      { ...base, integrity: {
        ...base.integrity,
        classification: { claims: [{ ...base.integrity.classification.claims[0]!, statement: 'changed' }] },
      } },
    ]) {
      expect(() => buildCharacterGovernedPreflightContextLayersV1(stale))
        .toThrow('Governed preflight context is not pinned');
    }
  });
});
