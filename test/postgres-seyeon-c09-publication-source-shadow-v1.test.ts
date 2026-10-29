import { describe, expect, it, vi } from 'vitest';
import type { PostgresSubjectExecutionScopeV1 } from '../apps/api/src/postgres-subject-execution.js';
import {
  createPostgresSeyeonC09PublicationSourceShadowV1,
  POSTGRES_SEYEON_C09_SOURCE_APPROVAL_SQL_V1,
  POSTGRES_SEYEON_C09_SOURCE_CONSENT_SQL_V1,
  POSTGRES_SEYEON_C09_SOURCE_REVOKE_SQL_V1,
} from '../apps/api/src/postgres-seyeon-c09-publication-source-shadow-v1.js';
import {
  createSeyeonC09LearningPublicationPlannerShadowV1,
  SEYEON_C09_LEARNING_ISSUE_SQL_SHADOW_V1,
  SEYEON_C09_LEARNING_REVOKE_SQL_SHADOW_V1,
} from '../apps/api/src/seyeon-c09-learning-evidence-publication-shadow-v1.js';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const E = '22222222-2222-4222-8222-222222222222';
const NOW = '2026-10-29T06:00:00.000Z';
const YESTERDAY = '2026-10-28T06:00:00.000Z';
const SOURCE_REF = 'fixture:shared:A';
const CONSENT_REF = 'fixture:consent:A';

function sourceRow(partial: Record<string, unknown> = {}) {
  return {
    subjectId: A,
    sourceRef: SOURCE_REF,
    characterId: 'seyeon',
    topicKey: 'python.programming',
    sourceKind: 'user_taught_verified',
    awareness: 'heard_of',
    visibility: 'character_shared',
    sourceSubjectId: null,
    approvalRef: 'fixture:approval:A',
    verifiedAt: NOW,
    learnedAt: YESTERDAY,
    validAt: YESTERDAY,
    sharingConsentRef: CONSENT_REF,
    privacyReviewRef: 'fixture:privacy:A',
    privacyReviewedAt: NOW,
    deidentifiedForSharing: true,
    sourceVerificationRef: 'fixture:source-verified:A',
    ...partial,
  };
}

function consentRow(partial: Record<string, unknown> = {}) {
  return {
    subjectId: A,
    sourceRef: SOURCE_REF,
    sharingConsentRef: CONSENT_REF,
    topicKey: 'python.programming',
    status: 'active',
    revision: '1',
    verifiedAt: NOW,
    ...partial,
  };
}

function revokeRow(partial: Record<string, unknown> = {}) {
  return {
    subjectId: A,
    evidenceId: E,
    characterId: 'seyeon',
    authorityRef: SOURCE_REF,
    revocationApproved: true,
    revokedAt: NOW,
    revision: '1',
    revocationRef: 'fixture:revocation:A',
    ...partial,
  };
}

function fixture(options: {
  source?: Record<string, unknown> | null;
  consent?: Record<string, unknown> | null;
  revoke?: Record<string, unknown> | null;
  permissionDenied?: boolean;
} = {}) {
  const query = vi.fn(async (sql: string, params: readonly unknown[]) => {
    if (options.permissionDenied) throw new Error('permission denied');
    if (sql === POSTGRES_SEYEON_C09_SOURCE_APPROVAL_SQL_V1) {
      expect(params).toEqual([A, SOURCE_REF]);
      return { rows: options.source === null ? [] : [sourceRow(options.source)] };
    }
    if (sql === POSTGRES_SEYEON_C09_SOURCE_CONSENT_SQL_V1) {
      expect(params).toEqual([A, SOURCE_REF, CONSENT_REF, 'python.programming']);
      return { rows: options.consent === null ? [] : [consentRow(options.consent)] };
    }
    if (sql === POSTGRES_SEYEON_C09_SOURCE_REVOKE_SQL_V1) {
      expect(params).toEqual([A, E]);
      return { rows: options.revoke === null ? [] : [revokeRow(options.revoke)] };
    }
    throw new Error('Unexpected SQL');
  });
  const scope = {
    resolvedSubject: { subjectId: A, subjectKind: 'member' },
    client: { query },
  } as unknown as PostgresSubjectExecutionScopeV1;
  const authority = createPostgresSeyeonC09PublicationSourceShadowV1({ scope });
  const planner = createSeyeonC09LearningPublicationPlannerShadowV1({
    subjectId: A,
    sourceAuthority: authority,
  });
  return { query, authority, planner };
}

describe('C09 server-only read adapter for proposed approval/consent/revocation ledgers', () => {
  it('binds scoped SQL source and live consent to the atomic issue function plan', async () => {
    const f = fixture();
    const prepared = await f.planner.prepareIssue({
      subjectId: A, sourceRef: SOURCE_REF,
    });
    expect(prepared.sql).toBe(SEYEON_C09_LEARNING_ISSUE_SQL_SHADOW_V1);
    expect(prepared.sql).not.toContain('insert into');
    expect(prepared.parameters[1]).toBe(A);
    expect(prepared.parameters.slice(2)).toEqual([
      SOURCE_REF, 'fixture:approval:A', CONSENT_REF, '1',
    ]);
    expect(prepared.scope).toBe('PROPOSAL_SQL_ONLY_NO_EXECUTION');
    expect(prepared.mayExecuteInProduction).toBe(false);
    expect(f.query).toHaveBeenCalledTimes(4);
  });

  it('reads owner-scoped active individual revocation proof and plans locked SQL', async () => {
    const f = fixture();
    const prepared = await f.planner.prepareRevoke({ subjectId: A, evidenceId: E });
    expect(prepared.sql).toBe(SEYEON_C09_LEARNING_REVOKE_SQL_SHADOW_V1);
    expect(prepared.sql).toContain('c09_revoke_learning_evidence_shadow_v1');
    expect(prepared.parameters).toEqual([A, E, 'fixture:revocation:A', '1']);
    expect(f.query).toHaveBeenCalledTimes(2);
  });

  it('fails closed when approval, consent or revocation source is absent', async () => {
    for (const settings of [
      { source: null },
      { consent: null },
      { permissionDenied: true },
      { source: { sourceVerificationRef: null } },
      { source: { subjectId: B } },
      { consent: { subjectId: B } },
      { consent: { status: 'revoked' } },
      { consent: { revision: '9007199254740994' } },
    ]) {
      const f = fixture(settings);
      await expect(f.planner.prepareIssue({ subjectId: A, sourceRef: SOURCE_REF }))
        .rejects.toBeDefined();
    }
    for (const settings of [
      { revoke: null }, { revoke: { revocationApproved: false } },
      { revoke: { subjectId: B } }, { permissionDenied: true },
    ]) {
      const f = fixture(settings);
      await expect(f.planner.prepareRevoke({ subjectId: A, evidenceId: E }))
        .rejects.toBeDefined();
    }
  });

  it('does not permit client-selected Subject or cross-owner source reads', async () => {
    const f = fixture();
    await expect(f.authority.readApprovedPublication({
      subjectId: B, sourceRef: SOURCE_REF,
    })).rejects.toMatchObject({ code: 'C09_PUBLICATION_SOURCE_NOT_DEPLOYED' });
    await expect(f.authority.readCurrentSharingConsent({
      subjectId: B, sourceRef: SOURCE_REF,
      sharingConsentRef: CONSENT_REF, topicKey: 'python.programming',
    })).rejects.toMatchObject({ code: 'C09_PUBLICATION_SOURCE_NOT_DEPLOYED' });
    expect(f.query).not.toHaveBeenCalled();
  });
});
