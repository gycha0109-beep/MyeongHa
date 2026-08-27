import { describe, expect, it } from 'vitest';
import {
  FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16,
  PROVIDER_RELEASE_ATTESTATION_FR18,
  PROVIDER_RELEASE_EVIDENCE_FR18,
  assessProviderReleaseAttestationReadinessFR18,
  validateProviderReleaseAttestationFR18,
  validateProviderReleaseEvidenceFR18,
} from '../packages/face-reading/src/index.js';

describe('FR-18 provider release and laterality attestation', () => {
  it('validates the attestation and bounded evidence registry', () => {
    expect(validateProviderReleaseEvidenceFR18()).toBe(PROVIDER_RELEASE_EVIDENCE_FR18);
    expect(validateProviderReleaseAttestationFR18()).toBe(PROVIDER_RELEASE_ATTESTATION_FR18);
    expect(PROVIDER_RELEASE_EVIDENCE_FR18).toHaveLength(4);
  });

  it('pins exactly the FR-16 K_beauty dependency evidence', () => {
    const fr16 = FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.dependencyEvidence;
    const fr18 = PROVIDER_RELEASE_ATTESTATION_FR18.consumerDependency;
    expect(fr18.repository).toBe(fr16.repository);
    expect(fr18.repositoryCommit).toBe(fr16.repositoryCommit);
    expect(fr18.packageManifestBlobSha).toBe(fr16.packageManifestBlobSha);
    expect(fr18.packageName).toBe(fr16.packageName);
    expect(fr18.packageVersion).toBe(fr16.packageVersion);
  });

  it('keeps public package metadata separate from topology-byte attestation', () => {
    expect(PROVIDER_RELEASE_ATTESTATION_FR18.publishedPackageMetadata.packageVersion).toBe('0.10.35');
    expect(PROVIDER_RELEASE_ATTESTATION_FR18.publishedPackageMetadata.browserEntry).toBe('vision_bundle.mjs');
    expect(PROVIDER_RELEASE_ATTESTATION_FR18.publishedPackageMetadata.topologyBytesAttested).toBe(false);
    expect(PROVIDER_RELEASE_ATTESTATION_FR18.publishedBundleTopologyEvidenceRef).toBeNull();
    expect(PROVIDER_RELEASE_ATTESTATION_FR18.releaseExactState).toBe('unresolved');
  });

  it('records the 0.10.35 bump source as a development snapshot, never release-exact publication evidence', () => {
    const snapshot = PROVIDER_RELEASE_ATTESTATION_FR18.upstreamVersionSnapshot;
    expect(snapshot.versionBumpCommit).toBe('9d38d191b060cbfeaeb0c1aa20e47201f032ea35');
    expect(snapshot.topologySourceBlobSha).toBe('644de9d8c7cd90880d92b2393b4913fa93ace927');
    expect(snapshot.snapshotMeaning).toBe('development_version_source_snapshot');
    expect(snapshot.releaseExactForPublishedPackage).toBe(false);
  });

  it('attests provider left/right symbol names while forbidding image-space side inference', () => {
    const symbols = PROVIDER_RELEASE_ATTESTATION_FR18.laterality.symbols;
    expect(symbols.map((entry) => entry.providerTopologySymbol)).toEqual([
      'FACE_LANDMARKS_LEFT_EYE',
      'FACE_LANDMARKS_RIGHT_EYE',
      'FACE_LANDMARKS_LEFT_EYEBROW',
      'FACE_LANDMARKS_RIGHT_EYEBROW',
    ]);
    for (const entry of symbols) expect(entry.imageSpaceInferenceAllowed).toBe(false);
    expect(PROVIDER_RELEASE_ATTESTATION_FR18.laterality.captureTransformState).toBe('unresolved');
    expect(PROVIDER_RELEASE_ATTESTATION_FR18.laterality.captureMirrorContractRef).toBeNull();
    expect(PROVIDER_RELEASE_ATTESTATION_FR18.laterality.productionLateralityBindingAllowed).toBe(false);
    expect(PROVIDER_RELEASE_ATTESTATION_FR18.laterality.imageSpaceXOrderingMayDefineAnatomicalSide).toBe(false);
  });

  it('rejects package-version drift from FR-16', () => {
    const forged = {
      ...PROVIDER_RELEASE_ATTESTATION_FR18,
      consumerDependency: {
        ...PROVIDER_RELEASE_ATTESTATION_FR18.consumerDependency,
        packageVersion: '0.10.34',
      },
    } as never;
    expect(() => validateProviderReleaseAttestationFR18(forged)).toThrow(/exactly match the merged FR-16 dependency evidence/u);
  });

  it('rejects promotion of package metadata to topology-byte authority', () => {
    const forged = {
      ...PROVIDER_RELEASE_ATTESTATION_FR18,
      publishedPackageMetadata: {
        ...PROVIDER_RELEASE_ATTESTATION_FR18.publishedPackageMetadata,
        topologyBytesAttested: true,
      },
    } as never;
    expect(() => validateProviderReleaseAttestationFR18(forged)).toThrow(/no published bundle topology-byte attestation/u);
  });

  it('rejects promotion of the development version snapshot to release-exact evidence', () => {
    const forged = {
      ...PROVIDER_RELEASE_ATTESTATION_FR18,
      upstreamVersionSnapshot: {
        ...PROVIDER_RELEASE_ATTESTATION_FR18.upstreamVersionSnapshot,
        releaseExactForPublishedPackage: true,
      },
    } as never;
    expect(() => validateProviderReleaseAttestationFR18(forged)).toThrow(/must not be promoted to release-exact publication evidence/u);
  });

  it('rejects invented capture mirror authority while transform state is unresolved', () => {
    const forged = {
      ...PROVIDER_RELEASE_ATTESTATION_FR18,
      laterality: {
        ...PROVIDER_RELEASE_ATTESTATION_FR18.laterality,
        captureMirrorContractRef: 'capture.mirror.fake-v1',
      },
    } as never;
    expect(() => validateProviderReleaseAttestationFR18(forged)).toThrow(/unresolved capture transform cannot carry a mirror contract ref/u);
  });

  it('rejects image-space x ordering as anatomical left/right authority', () => {
    const forged = {
      ...PROVIDER_RELEASE_ATTESTATION_FR18,
      laterality: {
        ...PROVIDER_RELEASE_ATTESTATION_FR18.laterality,
        imageSpaceXOrderingMayDefineAnatomicalSide: true,
      },
    } as never;
    expect(() => validateProviderReleaseAttestationFR18(forged)).toThrow(/must not infer anatomical side from image-space ordering/u);
  });

  it('rejects hidden provider index material in a laterality symbol', () => {
    const forged = {
      ...PROVIDER_RELEASE_ATTESTATION_FR18,
      laterality: {
        ...PROVIDER_RELEASE_ATTESTATION_FR18.laterality,
        symbols: PROVIDER_RELEASE_ATTESTATION_FR18.laterality.symbols.map((entry, index) => index === 0
          ? { ...entry, landmarkIndex: 263 }
          : entry),
      },
    } as never;
    expect(() => validateProviderReleaseAttestationFR18(forged)).toThrow(/contains unauthorized field: landmarkIndex/u);
  });

  it('rejects provider activation while release exactness and laterality remain unresolved', () => {
    const forged = {
      ...PROVIDER_RELEASE_ATTESTATION_FR18,
      providerActivationAllowed: true,
    } as never;
    expect(() => validateProviderReleaseAttestationFR18(forged)).toThrow(/provider activation must remain blocked/u);
  });

  it('reports explicit release and laterality blockers', () => {
    const readiness = assessProviderReleaseAttestationReadinessFR18();
    expect(readiness.productionReady).toBe(false);
    expect(readiness.releaseExactState).toBe('unresolved');
    expect(readiness.lateralityState).toBe('unresolved');
    expect(readiness.blockers.join(' ')).toMatch(/published npm 0\.10\.35 bundle topology bytes/u);
    expect(readiness.blockers.join(' ')).toMatch(/development source snapshot/u);
    expect(readiness.blockers.join(' ')).toMatch(/mirroring/u);
    expect(readiness.blockers.join(' ')).toMatch(/image-space x ordering/u);
  });
});
