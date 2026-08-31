import { describe, expect, it } from 'vitest';
import {
  INDEPENDENT_FACE_SOURCE_ASSET_INTAKE_AUTHORITY_FRDATA07A,
  assertIndependentFaceSourceAssetsReadyForEmpiricalAdmissionFRData07A,
  bindIndependentFaceDatasetSourceAssetsFRData07A,
  computeIndependentFaceSourceAssetDigestFRData07A,
  freezeIndependentFaceSourceAssetRecordFRData07A,
  validateIndependentFaceSourceAssetIntakeAuthorityFRData07A,
  verifyFrozenIndependentFaceSourceAssetRecordFRData07A,
  type FrozenIndependentFaceSourceAssetRecordFRData07AV1,
  type IndependentFaceGroundTruthDatasetFRData07V1,
  type IndependentFaceSourceAssetIntakeInputFRData07AV1,
} from '../packages/face-reading/src/index.js';

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  bytes[16] = (width >>> 24) & 0xff;
  bytes[17] = (width >>> 16) & 0xff;
  bytes[18] = (width >>> 8) & 0xff;
  bytes[19] = width & 0xff;
  bytes[20] = (height >>> 24) & 0xff;
  bytes[21] = (height >>> 16) & 0xff;
  bytes[22] = (height >>> 8) & 0xff;
  bytes[23] = height & 0xff;
  bytes.set([8, 2, 0, 0, 0], 24);
  return bytes;
}

function input(options: {
  captureRef?: string;
  sourceInstanceRef?: string;
  sourceProvenanceRef?: string;
  bytes?: Uint8Array;
  width?: number | null;
  height?: number | null;
} = {}): IndependentFaceSourceAssetIntakeInputFRData07AV1 {
  const bytes = options.bytes ?? png(2, 3);
  const captureRef = options.captureRef ?? 'capture-frdata07a-001';
  const sourceInstanceRef = options.sourceInstanceRef ?? 'source-instance-frdata07a-001';
  return {
    schemaVersion: 'fr-data07a-independent-face-source-asset-intake-v1',
    acquisitionRef: `acquisition-${captureRef}`,
    captureRef,
    sourceProvenanceRef: options.sourceProvenanceRef ?? `provenance-${captureRef}`,
    sourceInstanceRef,
    sourcePageUrl: `https://example.invalid/source/${captureRef}`,
    sourcePageRevisionRef: `revision-${captureRef}`,
    sourceAssetUrl: `https://example.invalid/assets/${captureRef}.png`,
    declaredCanonicalAssetDigest: computeIndependentFaceSourceAssetDigestFRData07A(bytes),
    bytes,
    sourceReportedWidth: options.width === undefined ? 2 : options.width,
    sourceReportedHeight: options.height === undefined ? 3 : options.height,
    rightsBasisText: 'Synthetic fixture rights statement for contract testing only; not legal adjudication.',
    rightsEvidenceRefs: [`rights-evidence-${captureRef}`],
    rightsReviewState: 'source_rights_basis_recorded_not_legally_adjudicated',
    knownUseRestrictionNotes: [],
    privacySubjectRiskNotes: ['Synthetic fixture contains no real person and establishes no privacy authority.'],
    derivativeOfSourceInstanceRef: null,
    acquiredAt: '2026-08-31T10:00:00.000Z',
  };
}

function record(options: Parameters<typeof input>[0] = {}): FrozenIndependentFaceSourceAssetRecordFRData07AV1 {
  return freezeIndependentFaceSourceAssetRecordFRData07A(input(options));
}

function dataset(records: readonly FrozenIndependentFaceSourceAssetRecordFRData07AV1[]): IndependentFaceGroundTruthDatasetFRData07V1 {
  return {
    schemaVersion: 'fr-data07-independent-face-ground-truth-v1',
    datasetRef: 'dataset-frdata07a-contract-fixture',
    providerObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1',
    captures: records.map((entry, index) => ({
      captureRef: entry.captureRef,
      partition: index % 2 === 0 ? 'calibration' : 'holdout',
      canonicalAssetDigest: entry.canonicalAssetDigest,
      sourceProvenanceRef: entry.sourceProvenanceRef,
      sourceInstanceRef: entry.sourceInstanceRef,
      providerRunRef: null,
      providerRunStartedAt: null,
      providerRunExecutedAfterAnnotationFreeze: false,
    })),
    annotations: [],
    annotationLedgerFrozen: false,
    annotationLedgerDigest: null,
    annotationLedgerFrozenAt: null,
    providerRunsExecutedAfterFreeze: false,
  };
}

function mutableClone<T>(value: T): T {
  return structuredClone(value);
}

describe('FR-DATA-07A independent face source-asset intake', () => {
  it('defines mechanical intake only and keeps later verification and authority promotion fail-closed', () => {
    const authority = validateIndependentFaceSourceAssetIntakeAuthorityFRData07A();
    expect(authority).toBe(INDEPENDENT_FACE_SOURCE_ASSET_INTAKE_AUTHORITY_FRDATA07A);
    expect(authority.protocol.exactProvidedBytesSha256MatchRequired).toBe(true);
    expect(authority.protocol.supportedImageHeaderInspectionRequired).toBe(true);
    expect(authority.protocol.sourceReportedDimensionsWhenSuppliedMustExactlyMatchBytes).toBe(true);
    expect(authority.protocol.exactDatasetCaptureBindingRequired).toBe(true);
    expect(authority.protocol.frozenRecordRetainsRawBytes).toBe(false);
    expect(authority.protocol.frozenVerifierReperformsByteVerification).toBe(false);
    expect(authority.protocol.sourceMetadataThatCouldHintLabelMayBeIncludedInHumanAnnotationPacket).toBe(false);
    expect(authority.protocol.filenameOrSourceDescriptionMayDefineHumanFaceCountLabel).toBe(false);
    expect(authority.protocol.sourceUrlMayProveByteOriginWithoutExternalAuthentication).toBe(false);
    expect(authority.protocol.rightsMetadataMayConstituteLegalAdjudication).toBe(false);
    expect(authority.protocol.rightsMetadataMayConstitutePrivacyClearance).toBe(false);
    expect(authority.protocol.minimumAssetsForEmpiricalAdmission).toBeNull();
    expect(authority.protocol.acceptedRightsBasis).toBeNull();
    expect(authority.protocol.privacyRiskAcceptanceCriterion).toBeNull();
    expect(Object.values(authority.authorityBoundary).every((value) => value === false)).toBe(true);
  });

  it('binds exact bytes to canonical SHA-256 and inspects the encoded image header at intake', () => {
    const frozen = record();
    expect(frozen.canonicalAssetDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(frozen.byteLength).toBe(33);
    expect(frozen.contentSignature).toBe('image/png');
    expect(frozen.parserVariant).toBe('png_ihdr');
    expect(frozen.encodedWidth).toBe(2);
    expect(frozen.encodedHeight).toBe(3);
    expect(frozen.sourceReportedDimensionState).toBe('verified_exact_match');
    expect(frozen.exactByteDigestVerificationPerformedAtIntake).toBe(true);
    expect(frozen.imageHeaderInspectionPerformedAtIntake).toBe(true);
    expect(frozen.intakeVerificationReperformedByFrozenVerifier).toBe(false);
    expect(frozen.rawBytesRetainedByFrozenRecord).toBe(false);
    expect('bytes' in frozen).toBe(false);
    expect(verifyFrozenIndependentFaceSourceAssetRecordFRData07A(frozen)).toBe(frozen);
  });

  it('allows source-reported dimensions to be omitted without inventing them as source metadata', () => {
    const frozen = record({ width: null, height: null });
    expect(frozen.sourceReportedWidth).toBeNull();
    expect(frozen.sourceReportedHeight).toBeNull();
    expect(frozen.sourceReportedDimensionState).toBe('not_supplied');
    expect(frozen.encodedWidth).toBe(2);
    expect(frozen.encodedHeight).toBe(3);
  });

  it('rejects declared digest mismatch', () => {
    const candidate = input();
    expect(() => freezeIndependentFaceSourceAssetRecordFRData07A({
      ...candidate,
      declaredCanonicalAssetDigest: `sha256:${'0'.repeat(64)}`,
    })).toThrow(/digest does not match/u);
  });

  it('rejects source-reported dimensions that disagree with exact bytes', () => {
    expect(() => freezeIndependentFaceSourceAssetRecordFRData07A(input({ width: 20, height: 30 }))).toThrow(/do not match encoded bytes/u);
  });

  it('rejects incomplete source-reported dimension pairs', () => {
    expect(() => freezeIndependentFaceSourceAssetRecordFRData07A(input({ width: 2, height: null }))).toThrow(/supplied together/u);
  });

  it('rejects unsupported source-asset byte signatures', () => {
    const bytes = new TextEncoder().encode('not-an-image');
    expect(() => freezeIndependentFaceSourceAssetRecordFRData07A(input({ bytes, width: null, height: null }))).toThrow(/unsupported image byte signature/u);
  });

  it('requires absolute HTTP(S) source URLs', () => {
    const candidate = input();
    expect(() => freezeIndependentFaceSourceAssetRecordFRData07A({ ...candidate, sourceAssetUrl: 'file:///tmp/fixture.png' })).toThrow(/HTTP or HTTPS/u);
    expect(() => freezeIndependentFaceSourceAssetRecordFRData07A({ ...candidate, sourcePageUrl: '/relative/source' })).toThrow(/absolute HTTP\(S\) URL/u);
  });

  it('requires unique rights evidence refs and an explicit privacy/subject-risk screen record', () => {
    const candidate = input();
    expect(() => freezeIndependentFaceSourceAssetRecordFRData07A({ ...candidate, rightsEvidenceRefs: [] })).toThrow(/rightsEvidenceRefs must be non-empty/u);
    expect(() => freezeIndependentFaceSourceAssetRecordFRData07A({ ...candidate, rightsEvidenceRefs: ['rights-a', 'rights-a'] })).toThrow(/duplicate/u);
    expect(() => freezeIndependentFaceSourceAssetRecordFRData07A({ ...candidate, privacySubjectRiskNotes: [] })).toThrow(/privacySubjectRiskNotes must be non-empty/u);
  });

  it('rejects undeclared runtime authority fields at intake', () => {
    const candidate = {
      ...input(),
      empiricalAdmissionAuthorized: true,
    } as unknown as IndependentFaceSourceAssetIntakeInputFRData07AV1;
    expect(() => freezeIndependentFaceSourceAssetRecordFRData07A(candidate)).toThrow(/undeclared field empiricalAdmissionAuthorized/u);
  });

  it('makes frozen metadata identity deterministic and detects metadata tampering', () => {
    const first = record();
    const second = record();
    expect(first.recordDigest).toBe(second.recordDigest);
    const tampered = mutableClone(first) as unknown as { rightsBasisText: string } & FrozenIndependentFaceSourceAssetRecordFRData07AV1;
    tampered.rightsBasisText = 'mutated rights basis';
    expect(() => verifyFrozenIndependentFaceSourceAssetRecordFRData07A(tampered)).toThrow(/metadata digest mismatch/u);
  });

  it('rejects undeclared authority fields on persisted frozen records before digest semantics are trusted', () => {
    const tampered = {
      ...record(),
      trusted: true,
    } as unknown as FrozenIndependentFaceSourceAssetRecordFRData07AV1;
    expect(() => verifyFrozenIndependentFaceSourceAssetRecordFRData07A(tampered)).toThrow(/undeclared field trusted/u);
  });

  it('binds every FR-DATA-07 capture exactly without claiming byte re-verification or empirical promotion', () => {
    const records = [
      record({ captureRef: 'capture-frdata07a-cal', sourceInstanceRef: 'source-instance-frdata07a-cal', bytes: png(2, 3) }),
      record({ captureRef: 'capture-frdata07a-holdout', sourceInstanceRef: 'source-instance-frdata07a-holdout', bytes: png(4, 5), width: 4, height: 5 }),
    ];
    const report = bindIndependentFaceDatasetSourceAssetsFRData07A(dataset(records), records);
    expect(report.captureCoverageComplete).toBe(true);
    expect(report.canonicalAssetDigestBindingsExact).toBe(true);
    expect(report.sourceProvenanceBindingsExact).toBe(true);
    expect(report.sourceInstanceBindingsExact).toBe(true);
    expect(report.sourceAssetByteVerificationRecordedAtIntake).toBe(true);
    expect(report.sourceAssetByteVerificationReperformedByBinding).toBe(false);
    expect(report.sourceTransportAuthenticated).toBe(false);
    expect(report.rightsLegallyAdjudicated).toBe(false);
    expect(report.privacySubjectRiskIndependentlyAdjudicated).toBe(false);
    expect(report.humanFaceCountLabelsEstablishedBySourceMetadata).toBe(false);
    expect(report.empiricalAdmissionAuthorized).toBe(false);
    expect(report.providerScoringAuthorized).toBe(false);
    expect(report.productionGeometryAuthorized).toBe(false);
  });

  it('rejects incomplete source-asset coverage for the FR-DATA-07 capture set', () => {
    const records = [
      record({ captureRef: 'capture-frdata07a-cal', sourceInstanceRef: 'source-instance-frdata07a-cal', bytes: png(2, 3) }),
      record({ captureRef: 'capture-frdata07a-holdout', sourceInstanceRef: 'source-instance-frdata07a-holdout', bytes: png(4, 5), width: 4, height: 5 }),
    ];
    expect(() => bindIndependentFaceDatasetSourceAssetsFRData07A(dataset(records), records.slice(0, 1))).toThrow(/coverage must exactly match/u);
  });

  it('rejects FR-DATA-07 canonical digest drift from the source-asset intake record', () => {
    const records = [record()];
    const base = dataset(records);
    const candidateDataset: IndependentFaceGroundTruthDatasetFRData07V1 = {
      ...base,
      captures: base.captures.map((capture, index) => index === 0 ? { ...capture, canonicalAssetDigest: `sha256:${'1'.repeat(64)}` } : capture),
    };
    expect(() => bindIndependentFaceDatasetSourceAssetsFRData07A(candidateDataset, records)).toThrow(/canonical asset digest does not match/u);
  });

  it('rejects FR-DATA-07 sourceProvenanceRef drift from the source-asset intake record', () => {
    const records = [record()];
    const base = dataset(records);
    const candidateDataset: IndependentFaceGroundTruthDatasetFRData07V1 = {
      ...base,
      captures: base.captures.map((capture, index) => index === 0 ? { ...capture, sourceProvenanceRef: 'different-provenance-ref' } : capture),
    };
    expect(() => bindIndependentFaceDatasetSourceAssetsFRData07A(candidateDataset, records)).toThrow(/sourceProvenanceRef does not match/u);
  });

  it('rejects FR-DATA-07 sourceInstanceRef drift from the source-asset intake record', () => {
    const records = [record()];
    const base = dataset(records);
    const candidateDataset: IndependentFaceGroundTruthDatasetFRData07V1 = {
      ...base,
      captures: base.captures.map((capture, index) => index === 0 ? { ...capture, sourceInstanceRef: 'different-source-instance-ref' } : capture),
    };
    expect(() => bindIndependentFaceDatasetSourceAssetsFRData07A(candidateDataset, records)).toThrow(/sourceInstanceRef does not match/u);
  });

  it('never treats source metadata, rights notes, or exact byte binding as labels, transport authentication, or empirical admission', () => {
    const frozen = record();
    expect(frozen.humanFaceCountLabelEstablished).toBe(false);
    expect(frozen.partitionAssignmentAuthorized).toBe(false);
    expect(frozen.empiricalAdmissionAuthorized).toBe(false);
    expect(frozen.providerScoringAuthorized).toBe(false);
    expect(frozen.sourceAssetUrlCryptographicallyAuthenticatedByThisRecord).toBe(false);
    expect(frozen.providedBytesProvenToOriginateFromSourceAssetUrl).toBe(false);
    expect(frozen.rightsLegallyAdjudicated).toBe(false);
    expect(frozen.privacySubjectRiskIndependentlyAdjudicated).toBe(false);
  });

  it('always blocks empirical admission from FR-DATA-07A alone', () => {
    expect(() => assertIndependentFaceSourceAssetsReadyForEmpiricalAdmissionFRData07A()).toThrow(/cannot authorize empirical admission/u);
  });
});
