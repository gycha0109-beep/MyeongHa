export const FACE_SOURCE_AUTHORITY_VERSION_FE039 =
  'MHA-FACE-SOURCE-AUTHORITY-FE039-v1' as const;

const SOURCE_CLASSES = [
  'primary_manual',
  'commentary',
  'scholarly_lineage',
  'modern_secondary',
] as const;
const WITNESS_STATUSES = ['candidate', 'verified', 'deprecated'] as const;
const PASSAGE_VERIFICATION_STATUSES = [
  'unverified_ocr',
  'scan_checked',
  'double_checked',
] as const;
const LINEAGE_RELATIONS = [
  'quotes',
  'adapts',
  'likely_derives_from',
  'same_tradition',
  'independent_uncertain',
] as const;
const LINEAGE_CONFIDENCE = ['high', 'medium', 'low'] as const;
const INTERPRETATION_SCOPES = [
  'morphology',
  'local_feature',
  'configuration',
  'type',
  'position_period',
  'domain',
] as const;
const METHODOLOGY_REVIEW_STATUSES = ['research', 'reviewed'] as const;
const ADMISSION_TARGETS = ['research', 'production_candidate'] as const;

export type FaceSourceClassFE039 = (typeof SOURCE_CLASSES)[number];
export type FaceWitnessStatusFE039 = (typeof WITNESS_STATUSES)[number];
export type FacePassageVerificationStatusFE039 =
  (typeof PASSAGE_VERIFICATION_STATUSES)[number];
export type FaceSourceLineageRelationTypeFE039 =
  (typeof LINEAGE_RELATIONS)[number];
export type FaceSourceLineageConfidenceFE039 =
  (typeof LINEAGE_CONFIDENCE)[number];
export type FaceMethodologyScopeFE039 = (typeof INTERPRETATION_SCOPES)[number];
export type FaceMethodologyReviewStatusFE039 =
  (typeof METHODOLOGY_REVIEW_STATUSES)[number];
export type FaceSourceAuthorityAdmissionTargetFE039 =
  (typeof ADMISSION_TARGETS)[number];

export interface FaceSourceWorkFE039 {
  readonly workId: string;
  readonly canonicalTitle: string;
  readonly alternateTitles: readonly string[];
  readonly attributedAuthors: readonly string[];
  readonly estimatedPeriod: string | null;
  readonly sourceClass: FaceSourceClassFE039;
}

export interface FaceSourceWitnessFE039 {
  readonly witnessId: string;
  readonly workId: string;
  readonly editionLabel: string;
  readonly publicationYear: number | null;
  readonly holdingInstitution: string | null;
  readonly digitalSourceUrl: string | null;
  readonly checksumSha256: string | null;
  readonly witnessStatus: FaceWitnessStatusFE039;
}

export interface FaceSourcePassageFE039 {
  readonly passageId: string;
  readonly witnessId: string;
  readonly volume: string | null;
  readonly chapter: string | null;
  readonly printedPage: string | null;
  readonly scanPage: number | null;
  readonly originalText: string;
  readonly normalizedText: string | null;
  readonly translation: string | null;
  readonly verificationStatus: FacePassageVerificationStatusFE039;
}

export interface FaceSourceLineageRelationFE039 {
  readonly fromWorkId: string;
  readonly toWorkId: string;
  readonly relation: FaceSourceLineageRelationTypeFE039;
  readonly evidenceRefs: readonly string[];
  readonly confidence: FaceSourceLineageConfidenceFE039;
}

export interface FaceMethodologyStatementFE039 {
  readonly statementId: string;
  readonly version: string;
  readonly methodologyKey: string;
  readonly sourcePassageRefs: readonly string[];
  readonly traditionalTerm: string;
  readonly semanticStatement: string;
  readonly interpretationScope: FaceMethodologyScopeFE039;
  readonly reviewStatus: FaceMethodologyReviewStatusFE039;
}

export interface FaceSourceAuthorityBundleFE039 {
  readonly schemaVersion: 'myeongha-face-source-authority-bundle-v1';
  readonly bundleRef: string;
  readonly admissionTarget: FaceSourceAuthorityAdmissionTargetFE039;
  readonly work: FaceSourceWorkFE039;
  readonly witness: FaceSourceWitnessFE039;
  readonly passages: readonly FaceSourcePassageFE039[];
  readonly methodologyStatements: readonly FaceMethodologyStatementFE039[];
  readonly lineageRelations: readonly FaceSourceLineageRelationFE039[];
}

export interface FaceSourceAuthorityAdmissionSuccessFE039 {
  readonly schemaVersion: 'myeongha-face-source-authority-admission-v1';
  readonly contractVersion: typeof FACE_SOURCE_AUTHORITY_VERSION_FE039;
  readonly status: 'admitted';
  readonly state: 'research_admitted' | 'production_candidate';
  readonly authorityRef: string;
  readonly bundleRef: string;
  readonly authorityBundleSha256: string;
  readonly workRef: string;
  readonly witnessRef: string;
  readonly passageRefs: readonly string[];
  readonly methodologyStatementRefs: readonly string[];
  readonly boundary: Readonly<{
    sourceAuthorityAdmitted: true;
    operationalizationAuthorityIssued: false;
    ruleAuthorityIssued: false;
    criterionAuthorityIssued: false;
    structuredClaimIssued: false;
    narrativeAuthorityIssued: false;
    classificationIssued: false;
    scoreIssued: false;
    rankingIssued: false;
    productionAuthorityIssued: false;
  }>;
}

export interface FaceSourceAuthorityAdmissionRejectedFE039 {
  readonly schemaVersion: 'myeongha-face-source-authority-admission-v1';
  readonly contractVersion: typeof FACE_SOURCE_AUTHORITY_VERSION_FE039;
  readonly status: 'rejected';
  readonly reason:
    | 'invalid_shape'
    | 'duplicate_reference'
    | 'broken_provenance'
    | 'deprecated_witness'
    | 'production_evidence_insufficient'
    | 'hashing_unavailable';
}

export type FaceSourceAuthorityAdmissionResultFE039 =
  | FaceSourceAuthorityAdmissionSuccessFE039
  | FaceSourceAuthorityAdmissionRejectedFE039;

const WORK_KEYS = [
  'workId',
  'canonicalTitle',
  'alternateTitles',
  'attributedAuthors',
  'estimatedPeriod',
  'sourceClass',
] as const;
const WITNESS_KEYS = [
  'witnessId',
  'workId',
  'editionLabel',
  'publicationYear',
  'holdingInstitution',
  'digitalSourceUrl',
  'checksumSha256',
  'witnessStatus',
] as const;
const PASSAGE_KEYS = [
  'passageId',
  'witnessId',
  'volume',
  'chapter',
  'printedPage',
  'scanPage',
  'originalText',
  'normalizedText',
  'translation',
  'verificationStatus',
] as const;
const LINEAGE_KEYS = [
  'fromWorkId',
  'toWorkId',
  'relation',
  'evidenceRefs',
  'confidence',
] as const;
const METHODOLOGY_KEYS = [
  'statementId',
  'version',
  'methodologyKey',
  'sourcePassageRefs',
  'traditionalTerm',
  'semanticStatement',
  'interpretationScope',
  'reviewStatus',
] as const;
const BUNDLE_KEYS = [
  'schemaVersion',
  'bundleRef',
  'admissionTarget',
  'work',
  'witness',
  'passages',
  'methodologyStatements',
  'lineageRelations',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length &&
    keys.every((key) => allowed.includes(key));
}

function isOneOf<T extends readonly string[]>(
  value: unknown,
  allowed: T,
): value is T[number] {
  return typeof value === 'string' &&
    (allowed as readonly string[]).includes(value);
}

function isRef(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[A-Za-z0-9._:-]{1,160}$/.test(value);
}

function isVersion(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[A-Za-z0-9._:+/-]{1,160}$/.test(value);
}

function isText(value: unknown, maxLength = 20_000): value is string {
  return typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maxLength;
}

function isNullableText(value: unknown, maxLength = 4000): boolean {
  return value === null || isText(value, maxLength);
}

function isStringArray(value: unknown, allowEmpty = true): value is string[] {
  return Array.isArray(value) &&
    (allowEmpty || value.length > 0) &&
    value.every((entry) => isText(entry, 1000));
}

function isRefArray(value: unknown, allowEmpty = false): value is string[] {
  return Array.isArray(value) &&
    (allowEmpty || value.length > 0) &&
    value.every(isRef);
}

function allUnique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function validWork(value: unknown): value is FaceSourceWorkFE039 {
  if (!isRecord(value) || !exactKeys(value, WORK_KEYS)) return false;
  return isRef(value.workId) &&
    isText(value.canonicalTitle, 1000) &&
    isStringArray(value.alternateTitles) &&
    isStringArray(value.attributedAuthors) &&
    isNullableText(value.estimatedPeriod, 1000) &&
    isOneOf(value.sourceClass, SOURCE_CLASSES);
}

function validWitness(value: unknown): value is FaceSourceWitnessFE039 {
  if (!isRecord(value) || !exactKeys(value, WITNESS_KEYS)) return false;
  return isRef(value.witnessId) &&
    isRef(value.workId) &&
    isText(value.editionLabel, 1000) &&
    (
      value.publicationYear === null ||
      (
        typeof value.publicationYear === 'number' &&
        Number.isInteger(value.publicationYear) &&
        value.publicationYear >= 1 &&
        value.publicationYear <= 3000
      )
    ) &&
    isNullableText(value.holdingInstitution, 1000) &&
    (
      value.digitalSourceUrl === null ||
      (
        typeof value.digitalSourceUrl === 'string' &&
        /^https:\/\//.test(value.digitalSourceUrl) &&
        value.digitalSourceUrl.length <= 4000
      )
    ) &&
    (
      value.checksumSha256 === null ||
      (
        typeof value.checksumSha256 === 'string' &&
        /^[0-9a-f]{64}$/.test(value.checksumSha256)
      )
    ) &&
    isOneOf(value.witnessStatus, WITNESS_STATUSES);
}

function validPassage(value: unknown): value is FaceSourcePassageFE039 {
  if (!isRecord(value) || !exactKeys(value, PASSAGE_KEYS)) return false;
  return isRef(value.passageId) &&
    isRef(value.witnessId) &&
    isNullableText(value.volume, 1000) &&
    isNullableText(value.chapter, 1000) &&
    isNullableText(value.printedPage, 1000) &&
    (
      value.scanPage === null ||
      (
        typeof value.scanPage === 'number' &&
        Number.isInteger(value.scanPage) &&
        value.scanPage >= 1
      )
    ) &&
    isText(value.originalText) &&
    isNullableText(value.normalizedText) &&
    isNullableText(value.translation) &&
    isOneOf(value.verificationStatus, PASSAGE_VERIFICATION_STATUSES);
}

function validLineage(
  value: unknown,
): value is FaceSourceLineageRelationFE039 {
  if (!isRecord(value) || !exactKeys(value, LINEAGE_KEYS)) return false;
  return isRef(value.fromWorkId) &&
    isRef(value.toWorkId) &&
    isOneOf(value.relation, LINEAGE_RELATIONS) &&
    isRefArray(value.evidenceRefs) &&
    allUnique(value.evidenceRefs) &&
    isOneOf(value.confidence, LINEAGE_CONFIDENCE);
}

function validMethodology(
  value: unknown,
): value is FaceMethodologyStatementFE039 {
  if (!isRecord(value) || !exactKeys(value, METHODOLOGY_KEYS)) return false;
  return isRef(value.statementId) &&
    isVersion(value.version) &&
    isRef(value.methodologyKey) &&
    isRefArray(value.sourcePassageRefs) &&
    allUnique(value.sourcePassageRefs) &&
    isText(value.traditionalTerm, 1000) &&
    isText(value.semanticStatement) &&
    isOneOf(value.interpretationScope, INTERPRETATION_SCOPES) &&
    isOneOf(value.reviewStatus, METHODOLOGY_REVIEW_STATUSES);
}

function validateBundleShape(
  value: unknown,
): value is FaceSourceAuthorityBundleFE039 {
  if (!isRecord(value) || !exactKeys(value, BUNDLE_KEYS)) return false;
  return value.schemaVersion === 'myeongha-face-source-authority-bundle-v1' &&
    isRef(value.bundleRef) &&
    isOneOf(value.admissionTarget, ADMISSION_TARGETS) &&
    validWork(value.work) &&
    validWitness(value.witness) &&
    Array.isArray(value.passages) &&
    value.passages.length > 0 &&
    value.passages.every(validPassage) &&
    Array.isArray(value.methodologyStatements) &&
    value.methodologyStatements.length > 0 &&
    value.methodologyStatements.every(validMethodology) &&
    Array.isArray(value.lineageRelations) &&
    value.lineageRelations.every(validLineage);
}

function sortedUniqueStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...values].sort((a, b) => a.localeCompare(b)));
}

function normalizedAuthorityMaterial(
  bundle: FaceSourceAuthorityBundleFE039,
): Record<string, unknown> {
  return {
    schemaVersion: bundle.schemaVersion,
    bundleRef: bundle.bundleRef,
    work: {
      workId: bundle.work.workId,
      canonicalTitle: bundle.work.canonicalTitle,
      alternateTitles: sortedUniqueStrings(bundle.work.alternateTitles),
      attributedAuthors: sortedUniqueStrings(bundle.work.attributedAuthors),
      estimatedPeriod: bundle.work.estimatedPeriod,
      sourceClass: bundle.work.sourceClass,
    },
    witness: {
      witnessId: bundle.witness.witnessId,
      workId: bundle.witness.workId,
      editionLabel: bundle.witness.editionLabel,
      publicationYear: bundle.witness.publicationYear,
      holdingInstitution: bundle.witness.holdingInstitution,
      digitalSourceUrl: bundle.witness.digitalSourceUrl,
      checksumSha256: bundle.witness.checksumSha256,
      witnessStatus: bundle.witness.witnessStatus,
    },
    passages: [...bundle.passages]
      .sort((a, b) => a.passageId.localeCompare(b.passageId))
      .map((passage) => ({
        passageId: passage.passageId,
        witnessId: passage.witnessId,
        volume: passage.volume,
        chapter: passage.chapter,
        printedPage: passage.printedPage,
        scanPage: passage.scanPage,
        originalText: passage.originalText,
        normalizedText: passage.normalizedText,
        translation: passage.translation,
        verificationStatus: passage.verificationStatus,
      })),
    methodologyStatements: [...bundle.methodologyStatements]
      .sort((a, b) => a.statementId.localeCompare(b.statementId))
      .map((statement) => ({
        statementId: statement.statementId,
        version: statement.version,
        methodologyKey: statement.methodologyKey,
        sourcePassageRefs: sortedUniqueStrings(statement.sourcePassageRefs),
        traditionalTerm: statement.traditionalTerm,
        semanticStatement: statement.semanticStatement,
        interpretationScope: statement.interpretationScope,
        reviewStatus: statement.reviewStatus,
      })),
    lineageRelations: [...bundle.lineageRelations]
      .sort((a, b) => {
        const left = `${a.fromWorkId}:${a.toWorkId}:${a.relation}`;
        const right = `${b.fromWorkId}:${b.toWorkId}:${b.relation}`;
        return left.localeCompare(right);
      })
      .map((relation) => ({
        fromWorkId: relation.fromWorkId,
        toWorkId: relation.toWorkId,
        relation: relation.relation,
        evidenceRefs: sortedUniqueStrings(relation.evidenceRefs),
        confidence: relation.confidence,
      })),
  };
}

async function sha256Hex(value: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function rejected(
  reason: FaceSourceAuthorityAdmissionRejectedFE039['reason'],
): FaceSourceAuthorityAdmissionRejectedFE039 {
  return Object.freeze({
    schemaVersion: 'myeongha-face-source-authority-admission-v1' as const,
    contractVersion: FACE_SOURCE_AUTHORITY_VERSION_FE039,
    status: 'rejected' as const,
    reason,
  });
}

function provenanceFailure(
  bundle: FaceSourceAuthorityBundleFE039,
): FaceSourceAuthorityAdmissionRejectedFE039['reason'] | null {
  const passageIds = bundle.passages.map((passage) => passage.passageId);
  const statementIds = bundle.methodologyStatements.map(
    (statement) => statement.statementId,
  );

  if (
    !allUnique(passageIds) ||
    !allUnique(statementIds) ||
    !allUnique(bundle.work.alternateTitles) ||
    !allUnique(bundle.work.attributedAuthors)
  ) {
    return 'duplicate_reference';
  }

  if (bundle.witness.workId !== bundle.work.workId) {
    return 'broken_provenance';
  }
  if (
    bundle.passages.some(
      (passage) => passage.witnessId !== bundle.witness.witnessId,
    )
  ) {
    return 'broken_provenance';
  }

  const passageSet = new Set(passageIds);
  if (
    bundle.methodologyStatements.some((statement) =>
      statement.sourcePassageRefs.some((ref) => !passageSet.has(ref))
    )
  ) {
    return 'broken_provenance';
  }
  if (
    bundle.lineageRelations.some((relation) =>
      relation.evidenceRefs.some((ref) => !passageSet.has(ref))
    )
  ) {
    return 'broken_provenance';
  }

  if (bundle.witness.witnessStatus === 'deprecated') {
    return 'deprecated_witness';
  }

  return null;
}

function productionEvidenceReady(
  bundle: FaceSourceAuthorityBundleFE039,
): boolean {
  if (bundle.witness.witnessStatus !== 'verified') return false;
  if (
    bundle.passages.some(
      (passage) => passage.verificationStatus === 'unverified_ocr',
    )
  ) {
    return false;
  }
  if (
    bundle.methodologyStatements.some(
      (statement) => statement.reviewStatus !== 'reviewed',
    )
  ) {
    return false;
  }
  return true;
}

export async function admitFaceSourceAuthorityBundleFE039(
  value: unknown,
): Promise<FaceSourceAuthorityAdmissionResultFE039> {
  if (!validateBundleShape(value)) return rejected('invalid_shape');

  const provenanceReason = provenanceFailure(value);
  if (provenanceReason) return rejected(provenanceReason);

  if (
    value.admissionTarget === 'production_candidate' &&
    !productionEvidenceReady(value)
  ) {
    return rejected('production_evidence_insufficient');
  }

  const material = JSON.stringify(normalizedAuthorityMaterial(value));
  const authorityBundleSha256 = await sha256Hex(material);
  if (!authorityBundleSha256) return rejected('hashing_unavailable');

  const state =
    value.admissionTarget === 'production_candidate'
      ? 'production_candidate'
      : 'research_admitted';
  const passageRefs = Object.freeze(
    value.passages
      .map((passage) => passage.passageId)
      .sort((a, b) => a.localeCompare(b)),
  );
  const methodologyStatementRefs = Object.freeze(
    value.methodologyStatements
      .map((statement) => statement.statementId)
      .sort((a, b) => a.localeCompare(b)),
  );
  const boundary = Object.freeze({
    sourceAuthorityAdmitted: true as const,
    operationalizationAuthorityIssued: false as const,
    ruleAuthorityIssued: false as const,
    criterionAuthorityIssued: false as const,
    structuredClaimIssued: false as const,
    narrativeAuthorityIssued: false as const,
    classificationIssued: false as const,
    scoreIssued: false as const,
    rankingIssued: false as const,
    productionAuthorityIssued: false as const,
  });

  return Object.freeze({
    schemaVersion: 'myeongha-face-source-authority-admission-v1' as const,
    contractVersion: FACE_SOURCE_AUTHORITY_VERSION_FE039,
    status: 'admitted' as const,
    state,
    authorityRef: `face-source-authority:${value.bundleRef}:${authorityBundleSha256}`,
    bundleRef: value.bundleRef,
    authorityBundleSha256,
    workRef: value.work.workId,
    witnessRef: value.witness.witnessId,
    passageRefs,
    methodologyStatementRefs,
    boundary,
  });
}
