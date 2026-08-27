import { describe, expect, it } from 'vitest';
import {
  FACE_AUTHORITY_FR3_RESEARCH_REGISTRY_V0,
  FACE_FR3_METHOD_REFS_V0,
  FACE_NOSE_BRIDGE_CALIBRATION_PROTOCOL_RESEARCH_V0,
  evaluateFaceCalibrationLabelConsensus,
  validateFaceCalibrationDatasetManifest,
  validateFaceCalibrationLabelDataset,
  validateFaceCalibrationProtocolRegistry,
  type FaceAuthorityRegistry,
  type FaceCalibrationDatasetManifest,
  type FaceCalibrationLabelDataset,
  type FaceCalibrationManifestRecord,
  type FaceCalibrationProtocolRegistry,
} from '../packages/face-reading/src/index.js';

const metricRef = 'neutral.nose.bridge.centerline_rms_deviation@0.1.0';
const study = FACE_NOSE_BRIDGE_CALIBRATION_PROTOCOL_RESEARCH_V0.studies[0]!;
const captureProtocol = FACE_NOSE_BRIDGE_CALIBRATION_PROTOCOL_RESEARCH_V0.captureProtocols[0]!;
const labelingProtocol = FACE_NOSE_BRIDGE_CALIBRATION_PROTOCOL_RESEARCH_V0.labelingProtocols[0]!;

function validationContext(faceAuthorityRegistry: FaceAuthorityRegistry = FACE_AUTHORITY_FR3_RESEARCH_REGISTRY_V0) {
  return {
    faceAuthorityRegistry,
    knownNeutralMetricRefs: new Set([metricRef]),
  };
}

function recordsForParticipant(participantKey: string, partition: 'selection' | 'holdout') {
  const records = [];
  for (const session of ['s1', 's2']) {
    for (const ordinal of [1, 2]) {
      records.push({
        observationRef: `obs:${participantKey}:${session}:${ordinal}`,
        reviewItemRef: `review:${participantKey}:${session}:${ordinal}`,
        participantKey,
        captureFamilyKey: `family:${participantKey}`,
        captureSessionKey: `${participantKey}:${session}`,
        captureOrdinal: ordinal,
        partition,
        metricRef,
        protocolRef: 'capture.nose_bridge.repeat_frontal@0.3.0',
        accepted: true,
      } as const);
    }
  }
  return records;
}

function rejectedRecord(
  record: FaceCalibrationManifestRecord,
  reason: string,
): FaceCalibrationManifestRecord {
  const { reviewItemRef: _reviewItemRef, ...rest } = record;
  return { ...rest, accepted: false, rejectionReason: reason };
}

function validManifest(): FaceCalibrationDatasetManifest {
  return {
    manifestId: 'manifest.nose_bridge.test',
    version: '1.0.0',
    studyRef: 'study.face.nose_bridge.straight@0.3.0',
    records: [
      ...recordsForParticipant('p-selection', 'selection'),
      ...recordsForParticipant('p-holdout', 'holdout'),
    ],
  };
}

function labelsForManifest(manifest: FaceCalibrationDatasetManifest): FaceCalibrationLabelDataset {
  return {
    datasetId: 'labels.nose_bridge.test',
    version: '1.0.0',
    studyRef: manifest.studyRef,
    records: manifest.records.flatMap((record) => {
      if (!record.accepted || record.reviewItemRef === undefined) return [];
      return [
        { itemRef: record.reviewItemRef, reviewerKey: 'r1', label: 'met' as const, labelingProtocolRef: 'label.shenxiang.discernment.bridge_straight@0.3.0' },
        { itemRef: record.reviewItemRef, reviewerKey: 'r2', label: 'met' as const, labelingProtocolRef: 'label.shenxiang.discernment.bridge_straight@0.3.0' },
        { itemRef: record.reviewItemRef, reviewerKey: 'r3', label: 'abstain' as const, labelingProtocolRef: 'label.shenxiang.discernment.bridge_straight@0.3.0' },
      ];
    }),
  };
}

function promoteProtocolForCollection(): FaceCalibrationProtocolRegistry {
  const registry = FACE_NOSE_BRIDGE_CALIBRATION_PROTOCOL_RESEARCH_V0;
  return {
    ...registry,
    supportArtifacts: registry.supportArtifacts.map((artifact) => {
      if (artifact.kind === 'review_artifact_retention_policy') {
        return { ...artifact, maxRetentionDays: 30, status: 'reviewed' as const };
      }
      return { ...artifact, status: 'reviewed' as const };
    }),
    captureProtocols: registry.captureProtocols.map((protocol) => ({ ...protocol, status: 'reviewed' as const })),
    labelingProtocols: registry.labelingProtocols.map((protocol) => ({ ...protocol, status: 'reviewed' as const })),
    splitPolicies: registry.splitPolicies.map((policy) => ({ ...policy, status: 'reviewed' as const })),
    studies: registry.studies.map((candidate) => ({
      ...candidate,
      executionState: 'authorized_to_collect' as const,
      blockingReasons: [],
      status: 'reviewed' as const,
    })),
  };
}

function promoteFaceAuthority(sourceChecked: boolean): FaceAuthorityRegistry {
  return {
    ...FACE_AUTHORITY_FR3_RESEARCH_REGISTRY_V0,
    passages: FACE_AUTHORITY_FR3_RESEARCH_REGISTRY_V0.passages.map((passage) =>
      passage.passageId === 'passage.shenxiang.five_officers.discernment' && sourceChecked
        ? { ...passage, verificationStatus: 'scan_checked' as const }
        : passage,
    ),
    methodologies: FACE_AUTHORITY_FR3_RESEARCH_REGISTRY_V0.methodologies.map((methodology) =>
      `${methodology.methodologyId}@${methodology.version}` === FACE_FR3_METHOD_REFS_V0.shenxiangFiveOfficers
        ? { ...methodology, reviewStatus: 'reviewed' as const }
        : methodology,
    ),
  };
}

describe('FR-6 protocol authority', () => {
  it('accepts the blocked research protocol and makes its privacy posture explicit', () => {
    expect(() =>
      validateFaceCalibrationProtocolRegistry(
        FACE_NOSE_BRIDGE_CALIBRATION_PROTOCOL_RESEARCH_V0,
        validationContext(),
      ),
    ).not.toThrow();

    expect(captureProtocol.reviewArtifactPolicy).toMatchObject({
      containsPotentiallyIdentifyingFace: true,
      participantPolicy: 'consented_pseudonymous',
      identityMatchingAllowed: false,
      trainingReuseAllowed: false,
    });
    expect(captureProtocol.sourceImagePolicy).toMatchObject({
      exifStrippedBeforeProcessing: true,
      originalDeletedAfterReviewArtifactCreation: true,
      trainingReuseAllowed: false,
      identityEmbeddingAllowed: false,
    });
    expect(study.executionState).toBe('blocked');
  });

  it('requires quality, retention, and labeling instruction refs to resolve to typed support artifacts', () => {
    const registry = FACE_NOSE_BRIDGE_CALIBRATION_PROTOCOL_RESEARCH_V0;
    const invalid: FaceCalibrationProtocolRegistry = {
      ...registry,
      captureProtocols: registry.captureProtocols.map((protocol) => ({
        ...protocol,
        qualityPolicyRef: 'quality.does.not.exist@1.0.0',
      })),
    };
    expect(() => validateFaceCalibrationProtocolRegistry(invalid, validationContext())).toThrow(/qualityPolicyRef must resolve/u);
  });

  it('blocks human collection while the traditional source remains unverified electronic text', () => {
    expect(() =>
      validateFaceCalibrationProtocolRegistry(
        promoteProtocolForCollection(),
        validationContext(promoteFaceAuthority(false)),
      ),
    ).toThrow(/before all traditional sources are scan_checked/u);
  });

  it('blocks collection if a linked support artifact remains research-only', () => {
    const promoted = promoteProtocolForCollection();
    const invalid: FaceCalibrationProtocolRegistry = {
      ...promoted,
      supportArtifacts: promoted.supportArtifacts.map((artifact, index) =>
        index === 0 ? { ...artifact, status: 'research' as const } : artifact,
      ),
    };
    expect(() =>
      validateFaceCalibrationProtocolRegistry(invalid, validationContext(promoteFaceAuthority(true))),
    ).toThrow(/support artifact is research-only/u);
  });

  it('can structurally authorize collection only in a test fixture after every source/protocol/support gate is raised', () => {
    expect(() =>
      validateFaceCalibrationProtocolRegistry(
        promoteProtocolForCollection(),
        validationContext(promoteFaceAuthority(true)),
      ),
    ).not.toThrow();
  });
});

describe('FR-6 participant-level split and repeat capture manifest', () => {
  it('accepts a participant-disjoint selection/holdout manifest with independent repeated captures', () => {
    expect(() => validateFaceCalibrationDatasetManifest(validManifest(), study, captureProtocol)).not.toThrow();
  });

  it('rejects participant leakage even when observation refs are different', () => {
    const manifest = validManifest();
    const first = manifest.records[0]!;
    const invalid: FaceCalibrationDatasetManifest = {
      ...manifest,
      records: [
        ...manifest.records,
        {
          ...first,
          observationRef: 'obs:leaked-copy',
          reviewItemRef: 'review:leaked-copy',
          captureSessionKey: 'p-selection:s3',
          captureOrdinal: 1,
          partition: 'holdout',
        },
      ],
    };
    expect(() => validateFaceCalibrationDatasetManifest(invalid, study, captureProtocol)).toThrow(/Participant leakage/u);
  });

  it('rejects capture-family reuse across participants', () => {
    const manifest = validManifest();
    const target = manifest.records.find((record) => record.participantKey === 'p-holdout')!;
    const invalid: FaceCalibrationDatasetManifest = {
      ...manifest,
      records: manifest.records.map((record) =>
        record.observationRef === target.observationRef
          ? { ...record, captureFamilyKey: 'family:p-selection' }
          : record,
      ),
    };
    expect(() => validateFaceCalibrationDatasetManifest(invalid, study, captureProtocol)).toThrow(/Capture family belongs to multiple participants/u);
  });

  it('rejects manifests that omit an accepted holdout partition', () => {
    const manifest = validManifest();
    const invalid: FaceCalibrationDatasetManifest = {
      ...manifest,
      records: manifest.records.map((record) =>
        record.partition === 'holdout'
          ? rejectedRecord(record, 'test-only rejection')
          : record,
      ),
    };
    expect(() => validateFaceCalibrationDatasetManifest(invalid, study, captureProtocol)).toThrow(/both selection and holdout/u);
  });

  it('rejects a participant with too few independent accepted sessions', () => {
    const manifest = validManifest();
    const invalid: FaceCalibrationDatasetManifest = {
      ...manifest,
      records: manifest.records.map((record) =>
        record.participantKey === 'p-selection' && record.captureSessionKey.endsWith(':s2')
          ? rejectedRecord(record, 'test-only rejection')
          : record,
      ),
    };
    expect(() => validateFaceCalibrationDatasetManifest(invalid, study, captureProtocol)).toThrow(/insufficient independent accepted sessions/u);
  });
});

describe('FR-6 blinded label dataset and consensus', () => {
  it('requires all accepted review items to receive independent reviewer coverage', () => {
    const manifest = validManifest();
    const labels = labelsForManifest(manifest);
    expect(() => validateFaceCalibrationLabelDataset(labels, manifest, study, labelingProtocol)).not.toThrow();

    const missing: FaceCalibrationLabelDataset = {
      ...labels,
      records: labels.records.filter((record) => record.itemRef !== manifest.records[0]!.reviewItemRef),
    };
    expect(() => validateFaceCalibrationLabelDataset(missing, manifest, study, labelingProtocol)).toThrow(/insufficient independent reviewer labels/u);
  });

  it('rejects duplicate labels from the same reviewer for the same item', () => {
    const manifest = validManifest();
    const labels = labelsForManifest(manifest);
    const duplicate = labels.records[0]!;
    const invalid: FaceCalibrationLabelDataset = {
      ...labels,
      records: [...labels.records, { ...duplicate }],
    };
    expect(() => validateFaceCalibrationLabelDataset(invalid, manifest, study, labelingProtocol)).toThrow(/Duplicate reviewer label/u);
  });

  it('rejects labels for rejected or unknown review artifacts', () => {
    const manifest = validManifest();
    const labels = labelsForManifest(manifest);
    const invalid: FaceCalibrationLabelDataset = {
      ...labels,
      records: [...labels.records, {
        itemRef: 'review:not-in-manifest',
        reviewerKey: 'r1',
        label: 'met',
        labelingProtocolRef: 'label.shenxiang.discernment.bridge_straight@0.3.0',
      }],
    };
    expect(() => validateFaceCalibrationLabelDataset(invalid, manifest, study, labelingProtocol)).toThrow(/not an accepted review item/u);
  });

  it('computes deterministic met/not-met/no-consensus without exposing metric values to reviewers', () => {
    const protocolRef = 'label.shenxiang.discernment.bridge_straight@0.3.0';
    const dataset: FaceCalibrationLabelDataset = {
      datasetId: 'labels.consensus.test',
      version: '1.0.0',
      studyRef: 'study.face.nose_bridge.straight@0.3.0',
      records: [
        { itemRef: 'a', reviewerKey: 'r1', label: 'met', labelingProtocolRef: protocolRef },
        { itemRef: 'a', reviewerKey: 'r2', label: 'met', labelingProtocolRef: protocolRef },
        { itemRef: 'a', reviewerKey: 'r3', label: 'abstain', labelingProtocolRef: protocolRef },
        { itemRef: 'b', reviewerKey: 'r1', label: 'not_met', labelingProtocolRef: protocolRef },
        { itemRef: 'b', reviewerKey: 'r2', label: 'not_met', labelingProtocolRef: protocolRef },
        { itemRef: 'b', reviewerKey: 'r3', label: 'met', labelingProtocolRef: protocolRef },
        { itemRef: 'c', reviewerKey: 'r1', label: 'met', labelingProtocolRef: protocolRef },
        { itemRef: 'c', reviewerKey: 'r2', label: 'not_met', labelingProtocolRef: protocolRef },
        { itemRef: 'c', reviewerKey: 'r3', label: 'abstain', labelingProtocolRef: protocolRef },
      ],
    };

    expect(evaluateFaceCalibrationLabelConsensus(dataset, labelingProtocol)).toEqual([
      { itemRef: 'a', state: 'met', metCount: 2, notMetCount: 0, abstainCount: 1, nonAbstainCount: 2, agreementFraction: 1 },
      { itemRef: 'b', state: 'not_met', metCount: 1, notMetCount: 2, abstainCount: 0, nonAbstainCount: 3, agreementFraction: 2 / 3 },
      { itemRef: 'c', state: 'no_consensus', metCount: 1, notMetCount: 1, abstainCount: 1, nonAbstainCount: 2, agreementFraction: 0.5 },
    ]);
  });

  it('keeps label records structurally blind to metric values', () => {
    const sample = labelsForManifest(validManifest()).records[0]!;
    expect('metricValue' in sample).toBe(false);
    expect('peerLabels' in sample).toBe(false);
  });
});