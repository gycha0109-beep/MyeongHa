import { describe, expect, it } from 'vitest';
import {
  assessSajuHeldStagingEvidenceIndexV1,
  SAJU_HELD_STAGING_REQUIRED_EVIDENCE_V1,
} from '../apps/api/src/saju-held-staging-evidence-index-v1.js';
import { digestSajuHeldStagingTargetManifestV1 } from
  '../apps/api/src/saju-held-staging-target-manifest-v1.js';
import { digestSajuHeldStagingConnectionPlanV1 } from
  '../apps/api/src/saju-held-staging-connection-plan-v1.js';
import { stagingTrustFixture } from './helpers/saju-staging-trust-fixture.js';

function fixture() {
  const f = stagingTrustFixture();
  const manifestDigest = digestSajuHeldStagingTargetManifestV1(f.manifest);
  const connectionPlanDigest = digestSajuHeldStagingConnectionPlanV1(f.plan);
  const entries = SAJU_HELD_STAGING_REQUIRED_EVIDENCE_V1.map((s, i) => ({
    evidenceId: s.id,
    sourceKind: s.sourceKind,
    environmentId: f.manifest.environmentId,
    manifestDigest,
    connectionPlanDigest,
    myeonghaCommitSha: f.manifest.myeonghaCommitSha,
    sajuCommitSha: f.manifest.sajuCommitSha,
    artifactDigest: (i + 1).toString(16).padStart(64, '0'),
    auditRecordId: 'audit:' + s.id,
    collectorId: 'collector:independent',
    reviewerId: 'reviewer:independent',
    claimedObservedAtMs: f.nowMs - 1000,
  }));
  return {
    manifest: f.manifest,
    reviewedManifest: structuredClone(f.manifest),
    connectionPlan: f.plan,
    reviewedConnectionPlan: structuredClone(f.plan),
    nowMs: f.nowMs,
    entries,
  };
}

describe('8C-2B-2D-3-04-03A held operational evidence index — no I/O', () => {
  it('accepts structurally complete R01-R14 index but explicitly NEVER verifies provenance or permits action', () => {
    const r = assessSajuHeldStagingEvidenceIndexV1(fixture());
    expect(r.inventory).toBe('INDEXED_UNVERIFIED');
    expect(r.targetBinding).toBe('DECLARED_MATCH_UNVERIFIED');
    expect(r.missingEvidenceIds).toEqual([]);
    expect(r.blockedEvidenceIds).toEqual([]);
    expect(r).toMatchObject({
      evidenceProvenance: 'NOT_VERIFIED',
      operationalEvidence: 'NOT_VERIFIED',
      rootAuthority: 'NOT_VERIFIED',
      stagingConnection: 'NOT_VERIFIED',
      stagingAdmission: 'HOLD',
      sourceAuthority: 'NOT_EVALUATED',
      releaseAuthorization: 'NOT_EVALUATED',
      canRunOnce: false, canExecute: false, canPublish: false, canSell: false,
    });
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.missingEvidenceIds)).toBe(true);
    expect(Object.isFrozen(r.blockedEvidenceIds)).toBe(true);
    expect(JSON.stringify(r)).not.toContain('collector:independent');
    expect(JSON.stringify(r)).not.toContain('artifactDigest');
  });

  it.each(SAJU_HELD_STAGING_REQUIRED_EVIDENCE_V1)(
    'blocks missing index entry $id', ({ id }) => {
      const v = fixture();
      const r = assessSajuHeldStagingEvidenceIndexV1({
        ...v, entries: v.entries.filter(e => e.evidenceId !== id),
      });
      expect(r.inventory).toBe('BLOCKED');
      expect(r.missingEvidenceIds).toContain(id);
      expect(r.canRunOnce).toBe(false);
    },
  );

  it.each(SAJU_HELD_STAGING_REQUIRED_EVIDENCE_V1)(
    'rejects $id with wrong source kind', ({ id }) => {
      const v = fixture();
      const r = assessSajuHeldStagingEvidenceIndexV1({
        ...v, entries: v.entries.map(e => e.evidenceId === id
          ? { ...e, sourceKind: 'TARGET_SELF_REPORT' } : e),
      });
      expect(r.inventory).toBe('BLOCKED');
      expect(r.blockedEvidenceIds).toContain(id);
    },
  );

  it.each([
    ['environment', (e:ReturnType<typeof fixture>['entries'][number]) => ({
      ...e, environmentId: 'myeongha-staging-rogue',
    })],
    ['manifest', (e:ReturnType<typeof fixture>['entries'][number]) => ({
      ...e, manifestDigest: 'f'.repeat(64),
    })],
    ['plan', (e:ReturnType<typeof fixture>['entries'][number]) => ({
      ...e, connectionPlanDigest: 'f'.repeat(64),
    })],
    ['MyeongHa SHA', (e:ReturnType<typeof fixture>['entries'][number]) => ({
      ...e, myeonghaCommitSha: 'f'.repeat(40),
    })],
    ['Saju SHA', (e:ReturnType<typeof fixture>['entries'][number]) => ({
      ...e, sajuCommitSha: 'f'.repeat(40),
    })],
    ['same collector and reviewer', (e:ReturnType<typeof fixture>['entries'][number]) => ({
      ...e, reviewerId: e.collectorId,
    })],
    ['raw URL as audit ref', (e:ReturnType<typeof fixture>['entries'][number]) => ({
      ...e, auditRecordId: 'https://secret.example.com/path?token=secret',
    })],
    ['future observation', (e:ReturnType<typeof fixture>['entries'][number]) => ({
      ...e, claimedObservedAtMs: Number.MAX_SAFE_INTEGER,
    })],
    ['unknown field', (e:ReturnType<typeof fixture>['entries'][number]) => ({
      ...e, token: 'do-not-accept',
    })],
  ] as const)('blocks %s on a single entry', (_label, mutate) => {
    const v = fixture();
    const changed = v.entries.map((e, i) => i === 3 ? mutate(e) : e);
    const report = assessSajuHeldStagingEvidenceIndexV1({ ...v, entries: changed });
    expect(report.inventory).toBe('BLOCKED');
    expect(report.blockedEvidenceIds).toContain('R04');
    expect(report.canExecute).toBe(false);
  });

  it('rejects reused artifact hash and audit reference across distinct evidence IDs', () => {
    const v = fixture();
    const sameArtifact = [...v.entries];
    sameArtifact[1] = { ...sameArtifact[1]!, artifactDigest: sameArtifact[0]!.artifactDigest };
    const report = assessSajuHeldStagingEvidenceIndexV1({ ...v, entries: sameArtifact });
    expect(report.blockedEvidenceIds).toEqual(['R01', 'R02']);
    expect(report.inventory).toBe('BLOCKED');
    const sameAudit = [...v.entries];
    sameAudit[1] = { ...sameAudit[1]!, auditRecordId: sameAudit[0]!.auditRecordId };
    const auditReport = assessSajuHeldStagingEvidenceIndexV1({ ...v, entries: sameAudit });
    expect(auditReport.blockedEvidenceIds).toEqual(['R01', 'R02']);
  });

  it('rejects duplicate ID, missing ID, unexpected ID and too many entries', () => {
    const v = fixture();
    const twice = [...v.entries.slice(0, 13), v.entries[0]];
    const report = assessSajuHeldStagingEvidenceIndexV1({ ...v, entries: twice });
    expect(report.inventory).toBe('BLOCKED');
    expect(report.missingEvidenceIds).toContain('R14');
    expect(report.blockedEvidenceIds).toContain('R01');
    expect(assessSajuHeldStagingEvidenceIndexV1({
      ...v, entries: [...v.entries, { ...v.entries[0], evidenceId: 'R15' }],
    }).inventory).toBe('BLOCKED');
  });

  it('never trusts an unreviewed connection plan, stale manifest, bad clock or exotic object', () => {
    const v = fixture();
    expect(assessSajuHeldStagingEvidenceIndexV1({
      ...v, reviewedConnectionPlan: { ...v.reviewedConnectionPlan,
        admissionDb: { ...v.reviewedConnectionPlan.admissionDb, targetId: 'rogue-target' } },
    }).targetBinding).toBe('BLOCKED');
    expect(assessSajuHeldStagingEvidenceIndexV1({
      ...v, reviewedManifest: { ...v.manifest, sajuCommitSha: 'f'.repeat(40) },
    }).inventory).toBe('BLOCKED');
    expect(assessSajuHeldStagingEvidenceIndexV1({ ...v, nowMs: 'tomorrow' }).inventory)
      .toBe('BLOCKED');
    expect(assessSajuHeldStagingEvidenceIndexV1({
      ...v, entries: v.entries.map((e, i) => i === 0
        ? Object.assign(Object.create({ injected: true }), e) : e),
    }).inventory).toBe('BLOCKED');
  });
});
