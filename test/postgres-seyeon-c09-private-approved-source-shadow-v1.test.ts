import { describe, expect, it, vi } from 'vitest';
import type { PostgresSubjectExecutionScopeV1 } from '../apps/api/src/postgres-subject-execution.js';
import {
  createPostgresSeyeonC09PrivateApprovedSourceShadowV1,
  POSTGRES_SEYEON_C09_PRIVATE_SOURCE_CURRENT_PROOF_SQL_V1,
} from '../apps/api/src/postgres-seyeon-c09-private-approved-source-shadow-v1.js';
import {
  POSTGRES_SEYEON_C09_SOURCE_APPROVAL_SQL_V1,
} from '../apps/api/src/postgres-seyeon-c09-publication-source-shadow-v1.js';
import {
  createSeyeonC09LearningPublicationPlannerShadowV1,
} from '../apps/api/src/seyeon-c09-learning-evidence-publication-shadow-v1.js';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SOURCE = 'c09:conversation:11111111-1111-4111-8111-111111111111';
const DAY = '2026-10-29T03:00:00.000Z';

function fixture(options: {
  approved?: boolean;
  throwProof?: boolean;
  revokeBetweenReads?: boolean;
  shared?: boolean;
} = {}) {
  let proofReads = 0;
  const query = vi.fn(async (sql: string, params: readonly unknown[]) => {
    if (sql === POSTGRES_SEYEON_C09_PRIVATE_SOURCE_CURRENT_PROOF_SQL_V1) {
      expect(params).toEqual([A, SOURCE]);
      proofReads++;
      if (options.throwProof) throw new Error('missing authority');
      return { rows: [{
        currentlyVerified: options.approved !== false &&
          (!options.revokeBetweenReads || proofReads === 1),
      }] };
    }
    if (sql === POSTGRES_SEYEON_C09_SOURCE_APPROVAL_SQL_V1) {
      expect(params).toEqual([A, SOURCE]);
      return { rows: [{
        subjectId: A, sourceRef: SOURCE, characterId: 'seyeon',
        topicKey: 'python.programming', sourceKind: 'user_taught_verified',
        awareness: 'heard_of',
        visibility: options.shared ? 'character_shared' : 'user_private',
        sourceSubjectId: options.shared ? null : A,
        approvalRef: 'fixture:optin:A', verifiedAt: DAY,
        learnedAt: DAY, validAt: DAY,
        sharingConsentRef: options.shared ? 'fixture:sharing:A' : null,
        privacyReviewRef: options.shared ? 'fixture:privacy:A' : null,
        privacyReviewedAt: options.shared ? DAY : null,
        deidentifiedForSharing: Boolean(options.shared),
        sourceVerificationRef: 'conversation:11111111-1111-4111-8111-111111111111:sha:abc',
      }] };
    }
    throw Error('unexpected SQL');
  });
  const scope = {
    resolvedSubject: { subjectId: A, subjectKind: 'member' },
    client: { query },
  } as unknown as PostgresSubjectExecutionScopeV1;
  const authority = createPostgresSeyeonC09PrivateApprovedSourceShadowV1({ scope });
  return { authority, query };
}

describe('C09 private original authority: proof must be current and non-shareable', () => {
  it('allows a bounded private SQL issue plan only after independent double proof', async () => {
    const { authority, query } = fixture();
    const planner = createSeyeonC09LearningPublicationPlannerShadowV1({
      subjectId: A, sourceAuthority: authority,
    });
    const plan = await planner.prepareIssue({ subjectId: A, sourceRef: SOURCE });
    expect(plan.mayExecuteInProduction).toBe(false);
    expect(plan.scope).toBe('PROPOSAL_SQL_ONLY_NO_EXECUTION');
    expect(plan.parameters.slice(1)).toEqual([
      A, SOURCE, 'fixture:optin:A', null, null,
    ]);
    expect(query).toHaveBeenCalledTimes(6);
  });

  it('refuses missing proof, permission failure, revoked proof and shared scope', async () => {
    for (const options of [
      { approved: false },
      { throwProof: true },
      { revokeBetweenReads: true },
      { shared: true },
    ]) {
      const f = fixture(options);
      await expect(f.authority.readApprovedPublication({
        subjectId: A, sourceRef: SOURCE,
      })).rejects.toMatchObject({ code: 'C09_PRIVATE_ORIGINAL_PROOF_UNAVAILABLE' });
    }
  });

  it('rejects subject spoofing and rejects use of shared consent path', async () => {
    const f = fixture();
    await expect(f.authority.readApprovedPublication({
      subjectId: B, sourceRef: SOURCE,
    })).rejects.toMatchObject({ code: 'C09_PRIVATE_ORIGINAL_PROOF_UNAVAILABLE' });
    await expect(f.authority.readCurrentSharingConsent({
      subjectId: A, sourceRef: SOURCE,
      sharingConsentRef: 'fixture:sharing:A', topicKey: 'python.programming',
    })).rejects.toMatchObject({ code: 'C09_PRIVATE_ORIGINAL_PROOF_UNAVAILABLE' });
    expect(f.query).not.toHaveBeenCalled();
  });
});
