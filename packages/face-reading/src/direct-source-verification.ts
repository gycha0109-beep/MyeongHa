import type { PassageVerificationStatus, SourcePassage } from './contracts.js';
import { FaceAuthorityValidationError } from './validation.js';

export type DirectSourceVerificationState =
  | 'witness_verified_passage_unlocated'
  | 'page_located_unchecked'
  | 'scan_checked'
  | 'double_checked';

export interface DirectSourceWitnessCandidate {
  readonly candidateId: string;
  readonly version: string;
  readonly workRef: string;
  readonly witnessId: string;
  readonly editionLabel: string;
  readonly publicationYear: number;
  readonly digitalSourceUrl: string;
  readonly pageCount: number;
  readonly fileSizeBytes: number;
  readonly checksumSha1?: string;
  readonly targetConceptRefs: readonly string[];
  readonly targetChapterLabel: string;
  readonly state: DirectSourceVerificationState;
  readonly mayPromoteOtherWitness: false;
}

export interface DirectSourcePageVerificationRecord {
  readonly verificationId: string;
  readonly version: string;
  readonly candidateRef: string;
  readonly witnessId: string;
  readonly passageId: string;
  readonly chapter: string;
  readonly scanPage: number;
  readonly printedPage?: string;
  readonly originalText: string;
  readonly visualEvidenceRefs: readonly string[];
  readonly checkerRefs: readonly string[];
  readonly state: 'scan_checked' | 'double_checked';
  readonly mayPromoteOtherWitness: false;
}

export interface DirectSourceVerificationRegistry {
  readonly registryId: string;
  readonly version: string;
  readonly candidates: readonly DirectSourceWitnessCandidate[];
  readonly pageVerifications: readonly DirectSourcePageVerificationRecord[];
}

const STABLE_KEY = /^[a-z0-9][a-z0-9._:-]{0,191}$/u;

function stableKey(value: string, path: string): void {
  if (!STABLE_KEY.test(value)) throw new FaceAuthorityValidationError(`${path} must be a stable authority key.`);
}

function nonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) throw new FaceAuthorityValidationError(`${path} must be non-empty.`);
}

function uniqueNonEmpty(values: readonly string[], path: string): void {
  if (values.length === 0) throw new FaceAuthorityValidationError(`${path} must be non-empty.`);
  const seen = new Set<string>();
  for (const value of values) {
    nonEmpty(value, path);
    if (seen.has(value)) throw new FaceAuthorityValidationError(`${path} contains duplicate ref: ${value}`);
    seen.add(value);
  }
}

function candidateRef(candidate: DirectSourceWitnessCandidate): string {
  return `${candidate.candidateId}@${candidate.version}`;
}

export function validateDirectSourceVerificationRegistry(registry: DirectSourceVerificationRegistry): void {
  stableKey(registry.registryId, 'directSourceVerificationRegistry.registryId');
  nonEmpty(registry.version, `${registry.registryId}.version`);

  const candidates = new Map<string, DirectSourceWitnessCandidate>();
  const witnessIds = new Set<string>();
  for (const candidate of registry.candidates) {
    stableKey(candidate.candidateId, 'directSourceCandidate.candidateId');
    nonEmpty(candidate.version, `${candidate.candidateId}.version`);
    nonEmpty(candidate.workRef, `${candidate.candidateId}.workRef`);
    stableKey(candidate.witnessId, `${candidate.candidateId}.witnessId`);
    nonEmpty(candidate.editionLabel, `${candidate.candidateId}.editionLabel`);
    nonEmpty(candidate.digitalSourceUrl, `${candidate.candidateId}.digitalSourceUrl`);
    nonEmpty(candidate.targetChapterLabel, `${candidate.candidateId}.targetChapterLabel`);
    uniqueNonEmpty(candidate.targetConceptRefs, `${candidate.candidateId}.targetConceptRefs`);
    if (!Number.isInteger(candidate.publicationYear) || candidate.publicationYear < 1) {
      throw new FaceAuthorityValidationError(`${candidate.candidateId}.publicationYear must be positive integer.`);
    }
    if (!Number.isInteger(candidate.pageCount) || candidate.pageCount < 1) {
      throw new FaceAuthorityValidationError(`${candidate.candidateId}.pageCount must be positive integer.`);
    }
    if (!Number.isInteger(candidate.fileSizeBytes) || candidate.fileSizeBytes < 1) {
      throw new FaceAuthorityValidationError(`${candidate.candidateId}.fileSizeBytes must be positive integer.`);
    }
    if (candidate.mayPromoteOtherWitness !== false) {
      throw new FaceAuthorityValidationError(`${candidate.candidateId} must not promote another witness.`);
    }
    const ref = candidateRef(candidate);
    if (candidates.has(ref)) throw new FaceAuthorityValidationError(`Duplicate direct-source candidate: ${ref}`);
    if (witnessIds.has(candidate.witnessId)) throw new FaceAuthorityValidationError(`Duplicate candidate witnessId: ${candidate.witnessId}`);
    candidates.set(ref, candidate);
    witnessIds.add(candidate.witnessId);
  }

  const verificationRefs = new Set<string>();
  const passageIds = new Set<string>();
  for (const record of registry.pageVerifications) {
    stableKey(record.verificationId, 'directSourceVerification.verificationId');
    nonEmpty(record.version, `${record.verificationId}.version`);
    const ref = `${record.verificationId}@${record.version}`;
    if (verificationRefs.has(ref)) throw new FaceAuthorityValidationError(`Duplicate page verification: ${ref}`);
    verificationRefs.add(ref);

    const candidate = candidates.get(record.candidateRef);
    if (candidate === undefined) throw new FaceAuthorityValidationError(`${ref} references unknown candidate ${record.candidateRef}.`);
    if (record.witnessId !== candidate.witnessId) {
      throw new FaceAuthorityValidationError(`${ref} witnessId does not match candidate witness.`);
    }
    stableKey(record.passageId, `${ref}.passageId`);
    if (passageIds.has(record.passageId)) throw new FaceAuthorityValidationError(`Duplicate verified passageId: ${record.passageId}`);
    passageIds.add(record.passageId);
    nonEmpty(record.chapter, `${ref}.chapter`);
    if (!Number.isInteger(record.scanPage) || record.scanPage < 1 || record.scanPage > candidate.pageCount) {
      throw new FaceAuthorityValidationError(`${ref}.scanPage must be within candidate page count.`);
    }
    nonEmpty(record.originalText, `${ref}.originalText`);
    uniqueNonEmpty(record.visualEvidenceRefs, `${ref}.visualEvidenceRefs`);
    uniqueNonEmpty(record.checkerRefs, `${ref}.checkerRefs`);
    if (record.state === 'double_checked' && record.checkerRefs.length < 2) {
      throw new FaceAuthorityValidationError(`${ref} double_checked requires at least two checker refs.`);
    }
    if (record.mayPromoteOtherWitness !== false) {
      throw new FaceAuthorityValidationError(`${ref} must not promote another witness.`);
    }
  }
}

export function materializeVerifiedSourcePassage(
  record: DirectSourcePageVerificationRecord,
  registry: DirectSourceVerificationRegistry,
): SourcePassage {
  validateDirectSourceVerificationRegistry(registry);
  const candidate = registry.candidates.find((item) => candidateRef(item) === record.candidateRef);
  if (candidate === undefined || candidate.witnessId !== record.witnessId) {
    throw new FaceAuthorityValidationError(`Cannot materialize passage from unresolved direct-source candidate ${record.candidateRef}.`);
  }
  const status: PassageVerificationStatus = record.state === 'double_checked' ? 'double_checked' : 'scan_checked';
  return {
    passageId: record.passageId,
    witnessId: record.witnessId,
    chapter: record.chapter,
    scanPage: record.scanPage,
    ...(record.printedPage === undefined ? {} : { printedPage: record.printedPage }),
    originalText: record.originalText,
    verificationStatus: status,
  };
}

export const FACE_DIRECT_SOURCE_VERIFICATION_RESEARCH_V0: DirectSourceVerificationRegistry = {
  registryId: 'direct-source-verification.face.research_v0',
  version: '0.1.0',
  candidates: [
    {
      candidateId: 'candidate.shenxiang_baohanlou_1786.volume2',
      version: '0.1.0',
      workRef: 'work.shenxiang_quanbian',
      witnessId: 'witness.shenxiang_quanbian.baohanlou_1786_v2',
      editionLabel: '寶翰樓 1786 刊本 卷2 — Wikimedia Commons SSID-13003394 scan',
      publicationYear: 1786,
      digitalSourceUrl: 'https://commons.wikimedia.org/wiki/File:SSID-13003394_神相全編_卷2.pdf',
      pageCount: 86,
      fileSizeBytes: 13946173,
      checksumSha1: '3f2388c7a8f70c564d1e04fa8bdb059ce8a25365',
      targetConceptRefs: [
        'method.shenxiang.five_officers@0.1.0',
        'criterion.discernment.bridge_straight',
      ],
      targetChapterLabel: '卷二 / 五官說 / 審辨官',
      state: 'witness_verified_passage_unlocated',
      mayPromoteOtherWitness: false,
    },
  ],
  pageVerifications: [],
};
