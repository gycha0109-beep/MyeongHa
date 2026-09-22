import { describe, expect, it } from 'vitest';
import {
  FACE_CANONICAL_METRIC_REGISTRY_SOURCE_FE040A,
  FACE_CURRENT_PINNED_ARTIFACT_FE040A,
  FACE_METRIC_REGISTRY_BRIDGE_VERSION_FE040A,
  assessCurrentPinnedFaceMetricRegistryFE040A,
  isIssuedCanonicalFaceMetricRegistryAdmissionFE040A,
  loadCanonicalFaceMetricRegistryFE040A,
} from './metric-registry-bridge-fe040a.js';

describe('FE040A canonical metric registry bridge', () => {
  it('pins upstream FE035B authority without redefining metric definitions', () => {
    expect(FACE_METRIC_REGISTRY_BRIDGE_VERSION_FE040A)
      .toBe('MHA-FACE-METRIC-REGISTRY-BRIDGE-FE040A-v1');
    expect(FACE_CANONICAL_METRIC_REGISTRY_SOURCE_FE040A).toMatchObject({
      repository: 'gycha0109-beep/Saju',
      sourceCommit: '0f7de13b18a9dd9966074f371cbfd9554490f0ef',
      sourceBlobSha: 'c9ed7dfb347144759694056e89d571c433d4dfc8',
      contractVersion: 'FE035B-PRODUCT-NEUTRAL-OBSERVATION-CONTRACT-v1',
      metricCount: 13,
      requiredMetricCount: 8,
      conditionalMetricCount: 5,
    });
  });

  it('records that the current FE024 artifact does not export the canonical registry', () => {
    expect(FACE_CURRENT_PINNED_ARTIFACT_FE040A).toMatchObject({
      distributionCommit: '1f80c30f5c829ce8d0d839cdd5816dad943c5afd',
      artifactSha256:
        '8d793c57e104fc0137a17dc631d208b468131b1d9a9668142a846e34dacbf84a',
      publicExportPath: './preview-engine',
      canonicalRegistryExported: false,
    });

    expect(assessCurrentPinnedFaceMetricRegistryFE040A()).toMatchObject({
      status: 'blocked',
      reason: 'canonical_registry_export_unavailable',
      boundary: {
        upstreamOwnsMetricAuthority: true,
        localMetricDefinitionAuthorityIssued: false,
        staticObservationAdmissionIssued: false,
        operationalizationAuthorityIssued: false,
        traditionalBindingAuthorityIssued: false,
        productionInterpretationAuthorityIssued: false,
      },
    });
  });

  it('fails closed when loading the canonical registry from the current pinned artifact', async () => {
    const result = await loadCanonicalFaceMetricRegistryFE040A();
    expect(result).toMatchObject({
      status: 'blocked',
      reason: 'canonical_registry_export_unavailable',
    });
    expect(isIssuedCanonicalFaceMetricRegistryAdmissionFE040A(result))
      .toBe(false);
  });

  it('does not treat a structurally forged object as an issued registry admission', () => {
    const forged = {
      schemaVersion:
        'myeongha-face-canonical-metric-registry-admission-v1',
      contractVersion: FACE_METRIC_REGISTRY_BRIDGE_VERSION_FE040A,
      status: 'admitted',
      registryState: 'canonical_upstream_registry_admitted',
    };

    expect(isIssuedCanonicalFaceMetricRegistryAdmissionFE040A(forged))
      .toBe(false);
  });
});
