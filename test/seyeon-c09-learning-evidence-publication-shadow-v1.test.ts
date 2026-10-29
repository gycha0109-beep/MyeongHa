import { describe, expect, it, vi } from 'vitest';
import {
  createSeyeonC09LearningPublicationPlannerShadowV1,
  SEYEON_C09_LEARNING_ISSUE_SQL_SHADOW_V1,
  SEYEON_C09_LEARNING_REVOKE_SQL_SHADOW_V1,
} from '../apps/api/src/seyeon-c09-learning-evidence-publication-shadow-v1.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const EVIDENCE = '33333333-3333-4333-8333-333333333333';
const WHEN = '2026-10-29T07:00:00.000Z';
const LEARNED = '2026-10-28T07:00:00.000Z';

function approved(overrides: Record<string, unknown> = {}) {
  return {
    subjectId: A, sourceRef: 'source:lesson:1',
    characterId: 'seyeon',
    topicKey: 'python.programming',
    sourceKind: 'user_taught_verified',
    awareness: 'heard_of',
    visibility: 'character_shared',
    sourceSubjectId: null,
    approvalRef: 'approval:operator-1',
    verifiedAt: WHEN,
    learnedAt: LEARNED,
    validAt: LEARNED,
    sharingConsentRef: 'consent:deidentified-share-1',
    privacyReviewRef: 'review:approved-1',
    privacyReviewedAt: WHEN,
    verifiedOriginalSource: true,
    approvedForKnowledgePublication: true,
    deidentifiedForSharing: true,
    ...overrides,
  };
}
function revocation(overrides: Record<string, unknown> = {}) {
  return {
    subjectId: A, evidenceId: EVIDENCE,
    characterId: 'seyeon', authorityRef: 'source:lesson:1',
    revocationApproved: true, revokedAt: WHEN,
    ...overrides,
  };
}
function system(input: { issue?: Record<string, unknown>; revoke?: Record<string, unknown>; rejectIssue?: boolean } = {}) {
  const source = {
    readApprovedPublication: vi.fn(async () => input.rejectIssue ? null : approved(input.issue)),
    readApprovedRevocation: vi.fn(async () => revocation(input.revoke)),
  };
  return {
    planner: createSeyeonC09LearningPublicationPlannerShadowV1({
      subjectId: A, sourceAuthority: source,
    }),
    source,
  };
}

describe('C09 learning admission: independently-approved SQL proposal only', () => {
  it('prepares parameterized shared-learning ISSUE only with verified source, sharing consent and privacy review', async () => {
    const { planner, source } = system();
    const command = await planner.prepareIssue({
      subjectId: A, sourceRef: 'source:lesson:1',
    });
    expect(command.operation).toBe('ISSUE');
    expect(command.sql).toBe(SEYEON_C09_LEARNING_ISSUE_SQL_SHADOW_V1);
    expect(command.scope).toBe('PROPOSAL_SQL_ONLY_NO_EXECUTION');
    expect(command.mayExecuteInProduction).toBe(false);
    expect(command.parameters).toHaveLength(16);
    expect(command.parameters[2]).toBe('python.programming');
    expect(command.parameters[7]).toBe(null);
    expect(command.parameters[8]).toBe('true');
    expect(command.parameters[9]).toBe(WHEN);
    expect(command.parameters[11]).toBe('consent:deidentified-share-1');
    expect(command.parameters[12]).toBe('approval:operator-1');
    expect(source.readApprovedPublication).toHaveBeenCalledOnce();
    expect(JSON.stringify(command)).not.toContain('full lesson text');
  });

  it('prepares private learning only in its exact canonical subject scope, never shared', async () => {
    const { planner } = system({ issue: {
      visibility: 'user_private', sourceSubjectId: A,
      sharingConsentRef: null, privacyReviewRef: null,
      privacyReviewedAt: null, deidentifiedForSharing: false,
    } });
    const plan = await planner.prepareIssue({ subjectId: A, sourceRef: 'source:lesson:1' });
    expect(plan.parameters[7]).toBe(A);
    expect(plan.parameters[8]).toBe('false');
    expect(plan.parameters[9]).toBe(null);
    expect(plan.parameters[11]).toBe(null);
  });

  it('blocks missing consent, missing privacy review and forged source approval before SQL preparation', async () => {
    for (const issue of [
      { sharingConsentRef: null },
      { privacyReviewRef: null },
      { privacyReviewedAt: null },
      { deidentifiedForSharing: false },
      { verifiedOriginalSource: false },
      { approvedForKnowledgePublication: false },
      { sourceSubjectId: A },
      { visibility: 'user_private', sourceSubjectId: B, sharingConsentRef: null, privacyReviewRef: null, privacyReviewedAt: null },
      { awareness: 'proficient_because_user_said_so' },
      { learnedAt: '2026-10-30T00:00:00.000Z' },
    ]) {
      const { planner } = system({ issue });
      await expect(planner.prepareIssue({ subjectId: A, sourceRef: 'source:lesson:1' }))
        .rejects.toMatchObject({ code: 'C09_LEARNING_PUBLICATION_NOT_AUTHORIZED' });
    }
  });

  it('rejects missing source receipt, cross-subject request and model-supplied approval', async () => {
    const { planner, source } = system({ rejectIssue: true });
    await expect(planner.prepareIssue({ subjectId: A, sourceRef: 'source:lesson:1' }))
      .rejects.toMatchObject({ code: 'C09_LEARNING_PUBLICATION_NOT_AUTHORIZED' });
    await expect(planner.prepareIssue({ subjectId: B, sourceRef: 'source:lesson:1' }))
      .rejects.toMatchObject({ code: 'C09_LEARNING_PUBLICATION_NOT_AUTHORIZED' });
    expect(source.readApprovedPublication).toHaveBeenCalledTimes(1);
  });

  it('prepares a revocation only with matching independently approved source authority', async () => {
    const { planner, source } = system();
    const plan = await planner.prepareRevoke({ subjectId: A, evidenceId: EVIDENCE });
    expect(plan.operation).toBe('REVOKE');
    expect(plan.sql).toBe(SEYEON_C09_LEARNING_REVOKE_SQL_SHADOW_V1);
    expect(plan.parameters).toEqual([EVIDENCE, 'source:lesson:1', WHEN]);
    expect(plan.mayExecuteInProduction).toBe(false);
    expect(source.readApprovedRevocation).toHaveBeenCalledOnce();
  });

  it('rejects false, cross-user, incomplete or stale revocation approval', async () => {
    for (const revoke of [
      { revocationApproved: false },
      { subjectId: B },
      { evidenceId: '00000000-0000-4000-8000-000000000000' },
      { authorityRef: '' },
      { revokedAt: 'not-a-date' },
    ]) {
      const { planner } = system({ revoke });
      await expect(planner.prepareRevoke({ subjectId: A, evidenceId: EVIDENCE }))
        .rejects.toMatchObject({ code: 'C09_LEARNING_PUBLICATION_NOT_AUTHORIZED' });
    }
    const { planner } = system();
    await expect(planner.prepareRevoke({ subjectId: B, evidenceId: EVIDENCE }))
      .rejects.toMatchObject({ code: 'C09_LEARNING_PUBLICATION_NOT_AUTHORIZED' });
  });
});
