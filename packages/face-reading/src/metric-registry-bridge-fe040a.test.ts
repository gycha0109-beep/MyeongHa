import { describe, expect, it } from 'vitest';
import {
  FACE_CANONICAL_METRIC_REGISTRY_SOURCE_FE040A,
  FACE_CURRENT_PINNED_ARTIFACT_FE040A,
  FACE_METRIC_REGISTRY_BRIDGE_VERSION_FE040A,
  assessCurrentPinnedFaceMetricRegistryFE040A,
  isIssuedCanonicalFaceMetricRegistryAdmissionFE040A,
  loadCanonicalFaceMetricRegistryFE040A,
} from './metric-registry-bridge-fe040a.js';

describe('FE040B canonical metric registry consumer bridge', () => {
  it('keeps FE035B as the upstream canonical authority', () => {
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

  it('pins the immutable FE041D superseding distribution while preserving FE035B registry readiness', () => {
    expect(FACE_CURRENT_PINNED_ARTIFACT_FE040A).toMatchObject({
      distributionCommit: '37f3728996992144eaa60b083334e466ae648b98',
      distributionPath:
        'distribution/face-reading/fe041d/myeongha-face-reading-0.0.0.tgz',
      artifactSha256:
        'f306515639aef5366308018ec3374f35ee1c20c35adb107ee140381ee6c8cd6d',
      publicExportPath: './preview-engine',
      canonicalRegistryExportPath:
        './product-neutral-observation-contract-fe035b',
      canonicalRegistryExported: true,
    });

    expect(assessCurrentPinnedFaceMetricRegistryFE040A()).toMatchObject({
      status: 'ready',
      reason: 'canonical_registry_export_available',
      boundary: {
        registryAdmissionStillRequiresRuntimeValidation: true,
        localMetricDefinitionAuthorityIssued: false,
        operationalizationAuthorityIssued: false,
        traditionalBindingAuthorityIssued: false,
        productionInterpretationAuthorityIssued: false,
      },
    });
  });

  it('loads and admits the canonical FE035B registry from the pinned artifact', async () => {
    const result = await loadCanonicalFaceMetricRegistryFE040A();

    expect(result).toMatchObject({
      status: 'admitted',
      registryState: 'canonical_upstream_registry_admitted',
      upstreamContractVersion:
        'FE035B-PRODUCT-NEUTRAL-OBSERVATION-CONTRACT-v1',
      metricCount: 13,
      requiredMetricCount: 8,
      conditionalMetricCount: 5,
      boundary: {
        upstreamOwnsMetricAuthority: true,
        localMetricDefinitionAuthorityIssued: false,
        traditionalBindingAuthorityIssued: false,
        thresholdAuthorityIssued: false,
        calibrationAuthorityIssued: false,
        classificationAuthorityIssued: false,
        scoreAuthorityIssued: false,
        rankingAuthorityIssued: false,
        narrativeAuthorityIssued: false,
        productionInterpretationAuthorityIssued: false,
      },
    });
    expect(isIssuedCanonicalFaceMetricRegistryAdmissionFE040A(result))
      .toBe(true);
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
