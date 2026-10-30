import { describe, expect, it } from 'vitest';
import {
  resolveSeyeonC09KnowledgeDecisionShadowV1,
  type SeyeonC09KnowledgeEvidenceShadowV1,
  type SeyeonC09KnowledgePolicyShadowV1,
} from '../packages/domain/src/seyeon-c09-epistemic-resolver-shadow-v1.js';

const NOW = '2026-10-29T05:00:00.000Z';
const EARLIER = '2026-10-28T05:00:00.000Z';
const AFTER = '2026-10-30T05:00:00.000Z';

function policy(
  baseline: SeyeonC09KnowledgePolicyShadowV1['baseline'] = 'explicit_unaware',
  domainPolicy: SeyeonC09KnowledgePolicyShadowV1['domainPolicy'] = 'bounded',
): SeyeonC09KnowledgePolicyShadowV1 {
  return {
    characterId: 'seyeon',
    topicKey: 'python.programming',
    policyVersion: 'test-canon-c09-1',
    authoritySourceRef: 'canon:test-fixture:python',
    domainPolicy,
    baseline,
  };
}

function evidence(
  overrides: Partial<SeyeonC09KnowledgeEvidenceShadowV1> = {},
): SeyeonC09KnowledgeEvidenceShadowV1 {
  return {
    evidenceId: 'e1',
    characterId: 'seyeon',
    topicKey: 'python.programming',
    sourceKind: 'user_taught_verified',
    authorityRef: 'server:approved:lesson:1',
    verifiedByServer: true,
    awareness: 'heard_of',
    visibility: 'character_shared',
    subjectId: null,
    approvedForCharacterSharing: true,
    privacyReviewed: true,
    learnedAt: EARLIER,
    validAt: EARLIER,
    supersededAt: null,
    ...overrides,
  };
}

function resolve(input: {
  subjectId?: string;
  requestKind?: 'general_question' | 'technical_execution' | 'learning_offer';
  policy?: SeyeonC09KnowledgePolicyShadowV1;
  evidence?: readonly SeyeonC09KnowledgeEvidenceShadowV1[];
  asOfTurn?: string;
} = {}) {
  return resolveSeyeonC09KnowledgeDecisionShadowV1({
    subjectId: input.subjectId ?? 'subject-B',
    requestKind: input.requestKind ?? 'general_question',
    policy: input.policy ?? policy(),
    evidence: input.evidence ?? [],
    asOfTurn: input.asOfTurn ?? NOW,
  });
}

describe('C09 epistemic projection: known != model training, no implicit public memory', () => {
  it('explicit unaware cannot become Python expert just because LLM knows Python', () => {
    const d = resolve({ requestKind: 'technical_execution' });
    expect(d.characterKnowledgeLevel).toBe('unaware');
    expect(d.responsePermission).toBe('withhold');
    expect(d.allowedEvidenceIds).toEqual([]);
    expect(d.permitsKnowledgeCommit).toBe(false);
  });

  it('explicit unaware general inquiry permits learning posture, not fabricated past learning', () => {
    const d = resolve();
    expect(d.responsePermission).toBe('learn');
    expect(d.claimBoundaries).toContain('no_unverified_learning_history');
  });

  it('a missing topic record is not automatically explicit unaware or blanket refusal of everyday knowledge', () => {
    const d = resolve({
      policy: policy('not_recorded', 'ambient'),
    });
    expect(d.characterKnowledgeLevel).toBe('unspecified');
    expect(d.responsePermission).toBe('normal');
  });

  it('bounded topic without an explicit unaware rule remains unspecified and cannot invent specialized competence', () => {
    const d = resolve({
      policy: policy('not_recorded', 'bounded'),
    });
    expect(d.characterKnowledgeLevel).toBe('unspecified');
    expect(d.responsePermission).toBe('partial');
  });

  it('verified public learning can transfer level heard_of to another user without author or private text', () => {
    const d = resolve({ subjectId: 'subject-B', evidence: [evidence()] });
    expect(d.characterKnowledgeLevel).toBe('heard_of');
    expect(d.allowedEvidenceIds).toEqual(['e1']);
    expect(d.sourceScope).toBe('character_shared');
    expect(d.responsePermission).toBe('partial');
    expect(d).not.toHaveProperty('teacherId');
    expect(JSON.stringify(d)).not.toContain('subject-A');
  });

  it('heard_of from A does not authorize B to execute Python programs', () => {
    const d = resolve({ requestKind: 'technical_execution', subjectId: 'subject-B', evidence: [evidence()] });
    expect(d.responsePermission).toBe('withhold');
  });

  it('practice evidence permits technical execution but cannot automatically make the character proficient', () => {
    const d = resolve({ requestKind: 'technical_execution', evidence: [
      evidence({ awareness: 'practiced' }),
    ] });
    expect(d.responsePermission).toBe('normal');
    expect(d.characterKnowledgeLevel).toBe('practiced');
  });

  it('private user A lesson cannot transfer to user B', () => {
    const privateRecord = evidence({
      visibility: 'user_private',
      subjectId: 'subject-A',
      approvedForCharacterSharing: false,
      privacyReviewed: false,
    });
    expect(resolve({ subjectId: 'subject-A', evidence: [privateRecord] }).characterKnowledgeLevel)
      .toBe('heard_of');
    const b = resolve({ subjectId: 'subject-B', evidence: [privateRecord] });
    expect(b.characterKnowledgeLevel).toBe('unaware');
    expect(b.allowedEvidenceIds).toEqual([]);
    expect(b.responsePermission).toBe('learn');
  });

  it('requires BOTH sharing consent and privacy review before user taught fact may become shared', () => {
    for (const broken of [
      evidence({ approvedForCharacterSharing: false }),
      evidence({ privacyReviewed: false }),
      evidence({ subjectId: 'subject-A' }),
      evidence({ verifiedByServer: false as true }),
      evidence({ sourceKind: 'user_claim' as 'user_taught_verified' }),
    ]) {
      expect(() => resolve({ evidence: [broken] })).toThrowError('KNOWLEDGE_EVIDENCE_INVALID');
    }
  });

  it('learning at a future time and superseded knowledge are not available now', () => {
    const future = evidence({ learnedAt: AFTER, validAt: AFTER });
    const superseded = evidence({ evidenceId: 'e2', supersededAt: NOW });
    const d = resolve({ evidence: [future, superseded] });
    expect(d.allowedEvidenceIds).toEqual([]);
    expect(d.characterKnowledgeLevel).toBe('unaware');
  });

  it('unsupported author-only knowledge remains withheld even when common ambient knowledge is allowed', () => {
    const restricted = resolve({
      policy: policy('not_recorded', 'authority_only'),
      evidence: [evidence()],
    });
    expect(restricted.responsePermission).toBe('withhold');
    const authored = resolve({
      policy: policy('not_recorded', 'authority_only'),
      evidence: [evidence({ sourceKind: 'canon' })],
    });
    expect(authored.responsePermission).toBe('partial');
  });

  it('rejects duplicated evidence ids, wrong topic and invalid timestamps', () => {
    expect(() => resolve({ evidence: [evidence(), evidence()] }))
      .toThrowError('KNOWLEDGE_EVIDENCE_INVALID');
    expect(() => resolve({ evidence: [evidence({ topicKey: 'numpy.optimization' })] }))
      .toThrowError('KNOWLEDGE_EVIDENCE_INVALID');
    expect(() => resolve({ asOfTurn: 'not-a-date' }))
      .toThrowError('KNOWLEDGE_POLICY_INVALID');
  });
});
