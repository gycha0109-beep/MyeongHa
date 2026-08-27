import type {
  CharacterFaceGrounding,
  FaceClaim,
  ProductFaceReadingSemanticV3,
} from './contracts.js';
import {
  FACE_FR3_RESEARCH_PACK_V0,
  FIVE_OFFICER_CRITERIA_V0,
  FIVE_OFFICER_DEFINITIONS_V0,
  buildFiveOfficerResearchClaims,
  evaluateFiveOfficerStaticSupport,
  type FiveOfficerAssessment,
  type FiveOfficerAssessmentInput,
  type FiveOfficerCriterionDefinition,
  type FiveOfficerKey,
} from './five-officers-six-fus-research-v0.js';
import { projectCharacterFaceGrounding } from './semantic-projection.js';
import { FaceAuthorityValidationError } from './validation.js';

export type FaceResearchAssertionAuthority = 'research_fixture' | 'reviewed_human_label';

export interface FaceResearchDiagnosisInput {
  readonly readingRef: string;
  readonly engineVersion: string;
  readonly sourceSnapshotRef: string;
  readonly assertionAuthority: FaceResearchAssertionAuthority;
  readonly evidenceRefs: readonly string[];
  readonly fiveOfficers: readonly FiveOfficerAssessmentInput[];
}

export interface FaceResearchNarrativeBlock {
  readonly blockKey: string;
  readonly kind: 'framing' | 'verdict' | 'feature' | 'tension';
  readonly claimRefs: readonly string[];
  readonly text: string;
}

export interface FaceResearchTopFeature {
  readonly rank: number;
  readonly claimRef: string;
  readonly semanticKey: string;
  readonly text: string;
}

export interface FaceResearchConsumerNarrative {
  readonly framing: string;
  readonly verdict: string;
  readonly topFeatures: readonly FaceResearchTopFeature[];
  readonly hiddenTension: string | null;
  readonly blocks: readonly FaceResearchNarrativeBlock[];
}

export interface FaceResearchDiagnosisOutput {
  readonly status: 'research_only';
  readonly semanticSignature: string;
  readonly reading: ProductFaceReadingSemanticV3;
  readonly claims: readonly FaceClaim[];
  readonly narrative: FaceResearchConsumerNarrative;
}

interface OfficerRuntimeEntry {
  readonly input: FiveOfficerAssessmentInput;
  readonly assessment: FiveOfficerAssessment;
  readonly claims: readonly FaceClaim[];
  readonly summaryClaim: FaceClaim;
  readonly evaluatedStaticCount: number;
  readonly canonicalOrder: number;
}

const METHODOLOGY_PACK_REF = `${FACE_FR3_RESEARCH_PACK_V0.packId}@${FACE_FR3_RESEARCH_PACK_V0.version}`;
const OFFICER_ORDER = Object.freeze(FIVE_OFFICER_DEFINITIONS_V0.map((definition) => definition.officerKey));
const TARGET_LABELS: Readonly<Record<FiveOfficerKey, string>> = Object.freeze({
  listening: '귀',
  longevity: '눈썹',
  inspection: '눈',
  discernment: '코',
  intake: '입',
});
const PROHIBITED_INFERENCES = Object.freeze([
  'medical_diagnosis',
  'mental_disorder',
  'criminality',
  'race_ethnicity',
  'sexual_orientation',
  'pregnancy',
  'objective_intelligence',
  'biometric_identity',
]);
const HEDGING_PATTERNS = Object.freeze([
  /가능성이/u,
  /일 수도/u,
  /아마/u,
  /것 같습니다/u,
  /추정됩니다/u,
  /정확히는 알 수 없/u,
  /보입니다/u,
]);
const issuedResearchDiagnoses = new WeakSet<object>();

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

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function officerDefinition(officerKey: FiveOfficerKey) {
  const definition = FIVE_OFFICER_DEFINITIONS_V0.find((candidate) => candidate.officerKey === officerKey);
  if (definition === undefined) throw new FaceAuthorityValidationError(`Unknown five-officer key: ${officerKey}`);
  return definition;
}

function criteriaForOfficer(officerKey: FiveOfficerKey): readonly FiveOfficerCriterionDefinition[] {
  return FIVE_OFFICER_CRITERIA_V0.filter((criterion) => criterion.officerKey === officerKey);
}

function summaryClaimRef(assessment: FiveOfficerAssessment): string {
  return `claim.research.five_officers.${assessment.officerKey}.static_support.${assessment.staticSupportState}`;
}

function buildEntry(input: FiveOfficerAssessmentInput): OfficerRuntimeEntry {
  const assessment = evaluateFiveOfficerStaticSupport(input);
  const claims = buildFiveOfficerResearchClaims(input, assessment);
  const expectedSummaryRef = summaryClaimRef(assessment);
  const summaryClaim = claims.find((claim) => claim.claimRef === expectedSummaryRef);
  if (summaryClaim === undefined) throw new FaceAuthorityValidationError(`Missing summary claim: ${expectedSummaryRef}`);
  return {
    input,
    assessment,
    claims,
    summaryClaim,
    evaluatedStaticCount: assessment.metStaticCriterionIds.length + assessment.failedStaticCriterionIds.length,
    canonicalOrder: OFFICER_ORDER.indexOf(input.officerKey),
  };
}

function stateRank(state: FiveOfficerAssessment['staticSupportState']): number {
  if (state === 'complete') return 3;
  if (state === 'contradicted') return 2;
  return 1;
}

function sortLeadEntries(entries: readonly OfficerRuntimeEntry[]): readonly OfficerRuntimeEntry[] {
  return [...entries].sort((left, right) => {
    const stateDiff = stateRank(right.assessment.staticSupportState) - stateRank(left.assessment.staticSupportState);
    if (stateDiff !== 0) return stateDiff;
    const evaluatedDiff = right.evaluatedStaticCount - left.evaluatedStaticCount;
    if (evaluatedDiff !== 0) return evaluatedDiff;
    const metDiff = right.assessment.metStaticCriterionIds.length - left.assessment.metStaticCriterionIds.length;
    if (metDiff !== 0) return metDiff;
    return left.canonicalOrder - right.canonicalOrder;
  });
}

function sortContradictedEntries(entries: readonly OfficerRuntimeEntry[]): readonly OfficerRuntimeEntry[] {
  return entries.filter((entry) => entry.assessment.staticSupportState === 'contradicted').sort((left, right) => {
    const failedDiff = right.assessment.failedStaticCriterionIds.length - left.assessment.failedStaticCriterionIds.length;
    if (failedDiff !== 0) return failedDiff;
    const evaluatedDiff = right.evaluatedStaticCount - left.evaluatedStaticCount;
    if (evaluatedDiff !== 0) return evaluatedDiff;
    return left.canonicalOrder - right.canonicalOrder;
  });
}

function canonicalSemanticSignature(entries: readonly OfficerRuntimeEntry[]): string {
  const byOfficer = new Map(entries.map((entry) => [entry.input.officerKey, entry] as const));
  const sections: string[] = [];
  for (const officerKey of OFFICER_ORDER) {
    const entry = byOfficer.get(officerKey);
    if (entry === undefined) continue;
    const staticCriteria = criteriaForOfficer(officerKey).filter((criterion) => criterion.staticV1Eligible);
    const states = staticCriteria
      .map((criterion) => `${criterion.criterionId}=${entry.input.criterionStates[criterion.criterionId] ?? 'not_evaluated'}`)
      .sort();
    sections.push(`${officerKey}[${states.join(',')}]`);
  }
  return `face-research-diagnosis@0.1.0|${sections.join('|')}`;
}

function uniqueSourceRefs(entries: readonly OfficerRuntimeEntry[]): readonly string[] {
  return [...new Set(entries.flatMap((entry) => officerDefinition(entry.input.officerKey).sourceRefs))].sort();
}

function buildTensionClaim(
  strong: OfficerRuntimeEntry | undefined,
  weak: OfficerRuntimeEntry | undefined,
): FaceClaim | null {
  if (strong === undefined || weak === undefined) return null;
  if (strong.assessment.staticSupportState !== 'complete' || weak.assessment.staticSupportState !== 'contradicted') return null;
  return {
    claimRef: `claim.research.five_officers.tension.${strong.input.officerKey}_complete__${weak.input.officerKey}_contradicted`,
    claimType: 'FACE_TENSION_INTERPRETATION',
    tier: 'F3',
    methodologyRef: strong.summaryClaim.methodologyRef,
    sourceRefs: uniqueSourceRefs([strong, weak]),
    semanticKey: `face.five_officers.tension.${strong.input.officerKey}_complete.${weak.input.officerKey}_contradicted`,
    axis: 'five_officers',
    pattern: `${strong.input.officerKey}_complete__${weak.input.officerKey}_contradicted`,
    salience: 'primary',
  };
}

function localCriterionForClaim(claim: FaceClaim): FiveOfficerCriterionDefinition | undefined {
  if (claim.claimType !== 'FACE_LOCAL_INTERPRETATION') return undefined;
  return FIVE_OFFICER_CRITERIA_V0.find((criterion) =>
    claim.claimRef === `claim.research.${criterion.criterionId}.${claim.pattern}`,
  );
}

function summaryText(entry: OfficerRuntimeEntry): string {
  const name = entry.assessment.traditionalOfficerName;
  if (entry.assessment.staticSupportState === 'complete') return `${name}의 정적 조건은 모두 들어맞습니다.`;
  if (entry.assessment.staticSupportState === 'contradicted') return `${name}의 정적 조건에는 분명한 깨짐이 있습니다.`;
  return `${name}은 정적 조건이 덜 들어와 이번 판독의 중심축에서 제외합니다.`;
}

function localText(claim: FaceClaim): string {
  const criterion = localCriterionForClaim(claim);
  if (criterion === undefined) throw new FaceAuthorityValidationError(`Cannot render local claim: ${claim.claimRef}`);
  const name = criterion.traditionalOfficerName;
  if (claim.pattern === 'met') return `${name}에서 ‘${criterion.sourceConcept}’ 조건이 분명하게 잡힙니다.`;
  if (claim.pattern === 'not_met') return `${name}에서 ‘${criterion.sourceConcept}’ 조건은 분명히 깨집니다.`;
  throw new FaceAuthorityValidationError(`Unsupported local-claim pattern: ${claim.pattern ?? 'missing'}`);
}

function verdictText(lead: OfficerRuntimeEntry): string {
  const name = lead.assessment.traditionalOfficerName;
  const target = TARGET_LABELS[lead.input.officerKey];
  if (lead.assessment.staticSupportState === 'complete') {
    return `${name}이 중심을 잡는 관상입니다. ${target} 쪽 정적 조건이 이번 판독에서 가장 선명하게 모였습니다.`;
  }
  if (lead.assessment.staticSupportState === 'contradicted') {
    return `${name}의 깨짐이 중심인 관상입니다. ${target} 쪽 정적 필수 조건에서 충돌이 분명합니다.`;
  }
  return `이번 판독은 오관 판결 보류입니다. ${name}을 포함해 평가 가능한 정적 조건이 채워지지 않았습니다.`;
}

function tensionText(strong: OfficerRuntimeEntry, weak: OfficerRuntimeEntry): string {
  const strongName = strong.assessment.traditionalOfficerName;
  const weakName = weak.assessment.traditionalOfficerName;
  return `${strongName}은 서고 ${weakName}은 꺾입니다. 이번 판독의 핵심 대비는 ${TARGET_LABELS[strong.input.officerKey]}와 ${TARGET_LABELS[weak.input.officerKey]} 사이입니다.`;
}

function claimNarrativeText(claim: FaceClaim, entries: readonly OfficerRuntimeEntry[], tension: FaceClaim | null): string {
  if (tension !== null && claim.claimRef === tension.claimRef) {
    const [strongKey, weakKey] = tension.pattern?.split('_complete__') ?? [];
    const strong = entries.find((entry) => entry.input.officerKey === strongKey);
    const weakToken = weakKey?.replace('_contradicted', '');
    const weak = entries.find((entry) => entry.input.officerKey === weakToken);
    if (strong === undefined || weak === undefined) throw new FaceAuthorityValidationError(`Cannot resolve tension claim: ${claim.claimRef}`);
    return tensionText(strong, weak);
  }
  const entry = entries.find((candidate) => candidate.summaryClaim.claimRef === claim.claimRef);
  if (entry !== undefined) return summaryText(entry);
  return localText(claim);
}

function topFeatureClaims(
  lead: OfficerRuntimeEntry,
  weak: OfficerRuntimeEntry | undefined,
  entries: readonly OfficerRuntimeEntry[],
): readonly FaceClaim[] {
  const candidates: FaceClaim[] = [lead.summaryClaim];
  const leadLocal = lead.claims
    .filter((claim) => claim.claimType === 'FACE_LOCAL_INTERPRETATION')
    .sort((left, right) => {
      if (left.pattern === right.pattern) return left.claimRef.localeCompare(right.claimRef);
      if (left.pattern === 'met') return -1;
      if (right.pattern === 'met') return 1;
      return left.claimRef.localeCompare(right.claimRef);
    });
  candidates.push(...leadLocal);
  if (weak !== undefined && weak.input.officerKey !== lead.input.officerKey) {
    candidates.push(weak.summaryClaim);
    candidates.push(...weak.claims.filter((claim) => claim.claimType === 'FACE_LOCAL_INTERPRETATION' && claim.pattern === 'not_met'));
  }
  for (const entry of sortLeadEntries(entries)) candidates.push(entry.summaryClaim, ...entry.claims.filter((claim) => claim.claimType === 'FACE_LOCAL_INTERPRETATION'));
  const unique: FaceClaim[] = [];
  const seen = new Set<string>();
  for (const claim of candidates) {
    if (seen.has(claim.claimRef)) continue;
    seen.add(claim.claimRef);
    unique.push(claim);
    if (unique.length === 3) break;
  }
  return unique;
}

function assertDecisiveNarrative(narrative: FaceResearchConsumerNarrative): void {
  const texts = [
    narrative.framing,
    narrative.verdict,
    ...narrative.topFeatures.map((feature) => feature.text),
    ...(narrative.hiddenTension === null ? [] : [narrative.hiddenTension]),
  ];
  for (const text of texts) {
    for (const pattern of HEDGING_PATTERNS) {
      if (pattern.test(text)) throw new FaceAuthorityValidationError(`Research narrative contains hedging phrase: ${pattern.source}`);
    }
  }
}

function validateInput(input: FaceResearchDiagnosisInput): void {
  nonEmpty(input.readingRef, 'researchDiagnosis.readingRef');
  nonEmpty(input.engineVersion, 'researchDiagnosis.engineVersion');
  nonEmpty(input.sourceSnapshotRef, 'researchDiagnosis.sourceSnapshotRef');
  uniqueNonEmpty(input.evidenceRefs, 'researchDiagnosis.evidenceRefs');
  if (input.fiveOfficers.length === 0) throw new FaceAuthorityValidationError('researchDiagnosis.fiveOfficers must be non-empty.');
  const seen = new Set<FiveOfficerKey>();
  for (const officer of input.fiveOfficers) {
    if (seen.has(officer.officerKey)) throw new FaceAuthorityValidationError(`Duplicate five-officer input: ${officer.officerKey}`);
    seen.add(officer.officerKey);
  }
}

export function buildResearchFaceDiagnosis(input: FaceResearchDiagnosisInput): FaceResearchDiagnosisOutput {
  validateInput(input);
  const entries = input.fiveOfficers.map(buildEntry);
  const ordered = sortLeadEntries(entries);
  const lead = ordered[0]!;
  const weak = sortContradictedEntries(entries)[0];
  const tensionClaim = buildTensionClaim(
    lead.assessment.staticSupportState === 'complete' ? lead : undefined,
    weak?.input.officerKey === lead.input.officerKey ? undefined : weak,
  );
  const claims = [...entries.flatMap((entry) => entry.claims), ...(tensionClaim === null ? [] : [tensionClaim])];
  const claimRefs = new Set<string>();
  for (const claim of claims) {
    if (claimRefs.has(claim.claimRef)) throw new FaceAuthorityValidationError(`Duplicate research claimRef: ${claim.claimRef}`);
    claimRefs.add(claim.claimRef);
  }

  const featureClaims = topFeatureClaims(lead, weak, entries);
  const verdictClaimRefs = [lead.summaryClaim.claimRef, ...(tensionClaim === null ? [] : [tensionClaim.claimRef])];
  const localClaimRefs = claims.filter((claim) => claim.claimType === 'FACE_LOCAL_INTERPRETATION').map((claim) => claim.claimRef);
  const unavailableSections = FIVE_OFFICER_DEFINITIONS_V0.flatMap((definition) => {
    const entry = entries.find((candidate) => candidate.input.officerKey === definition.officerKey);
    if (entry === undefined) return [`five_officers.${definition.officerKey}`];
    return entry.assessment.staticSupportState === 'insufficient' ? [`five_officers.${definition.officerKey}.static_support`] : [];
  });
  const hasLimited = unavailableSections.length > 0;
  const hasContradiction = entries.some((entry) => entry.assessment.staticSupportState === 'contradicted');
  const reading: ProductFaceReadingSemanticV3 = {
    readingRef: input.readingRef,
    engineVersion: input.engineVersion,
    methodologyPackRef: METHODOLOGY_PACK_REF,
    sourceSnapshotRef: input.sourceSnapshotRef,
    observationState: hasLimited ? 'section_limited' : 'usable',
    diagnosisResolution: hasLimited || hasContradiction ? 'resolved_mixed' : 'resolved',
    verdict: {
      semanticKey: `face.research.verdict.${lead.input.officerKey}.${lead.assessment.staticSupportState}`,
      claimRefs: verdictClaimRefs,
    },
    modules: {
      fiveOfficers: {
        moduleKey: 'five_officers',
        claimRefs: claims.filter((claim) => claim.claimType === 'FACE_LOCAL_INTERPRETATION' || claim.claimType === 'FACE_CONFIGURATION_INTERPRETATION').map((claim) => claim.claimRef),
        comparisonPolicyGroup: 'local.salience',
      },
      dominantFeatures: {
        moduleKey: 'dominant_features',
        claimRefs: featureClaims.map((claim) => claim.claimRef),
      },
      ...(tensionClaim === null ? {} : {
        tensions: {
          moduleKey: 'tensions',
          claimRefs: [tensionClaim.claimRef],
        },
      }),
    },
    lenses: [
      { lensKey: 'overall', claimRefs: verdictClaimRefs },
      { lensKey: 'detail', claimRefs: featureClaims.map((claim) => claim.claimRef) },
      ...(tensionClaim === null ? [] : [{ lensKey: 'contrast', claimRefs: [tensionClaim.claimRef] }]),
      ...(localClaimRefs.length === 0 ? [] : [{ lensKey: 'local', claimRefs: localClaimRefs }]),
    ],
    unavailableSections,
    prohibitedInferences: PROHIBITED_INFERENCES,
  };

  const framing = '전통 관상 체계의 오관 정적 조건을 기준으로 읽은 연구 판독입니다.';
  const verdict = verdictText(lead);
  const topFeatures = featureClaims.map((claim, index) => ({
    rank: index + 1,
    claimRef: claim.claimRef,
    semanticKey: claim.semanticKey,
    text: claimNarrativeText(claim, entries, tensionClaim),
  }));
  const hiddenTension = tensionClaim === null || weak === undefined ? null : tensionText(lead, weak);
  const blocks: FaceResearchNarrativeBlock[] = [
    { blockKey: 'face.research.framing', kind: 'framing', claimRefs: [], text: framing },
    { blockKey: reading.verdict.semanticKey, kind: 'verdict', claimRefs: verdictClaimRefs, text: verdict },
    ...topFeatures.map((feature) => ({
      blockKey: `face.research.feature.${feature.semanticKey}`,
      kind: 'feature' as const,
      claimRefs: [feature.claimRef],
      text: feature.text,
    })),
    ...(tensionClaim === null || hiddenTension === null ? [] : [{
      blockKey: tensionClaim.semanticKey,
      kind: 'tension' as const,
      claimRefs: [tensionClaim.claimRef],
      text: hiddenTension,
    }]),
  ];
  const blockKeys = new Set<string>();
  for (const block of blocks) {
    if (blockKeys.has(block.blockKey)) throw new FaceAuthorityValidationError(`Duplicate research narrative block key: ${block.blockKey}`);
    blockKeys.add(block.blockKey);
    for (const ref of block.claimRefs) {
      if (!claimRefs.has(ref)) throw new FaceAuthorityValidationError(`Narrative block references unknown research claim: ${ref}`);
    }
  }

  const narrative: FaceResearchConsumerNarrative = {
    framing,
    verdict,
    topFeatures,
    hiddenTension,
    blocks,
  };
  assertDecisiveNarrative(narrative);
  const output: FaceResearchDiagnosisOutput = deepFreeze({
    status: 'research_only' as const,
    semanticSignature: canonicalSemanticSignature(entries),
    reading,
    claims,
    narrative,
  });
  issuedResearchDiagnoses.add(output);
  return output;
}

export function projectResearchFaceDiagnosisGrounding(
  output: FaceResearchDiagnosisOutput,
  groundingVersion: string,
): CharacterFaceGrounding {
  if (!issuedResearchDiagnoses.has(output)) {
    throw new FaceAuthorityValidationError('Research face diagnosis was not issued by this runtime instance.');
  }
  nonEmpty(groundingVersion, 'researchDiagnosis.groundingVersion');
  const semanticGrounding = projectCharacterFaceGrounding({
    groundingVersion,
    reading: output.reading,
    claims: output.claims,
  });
  return deepFreeze({
    ...semanticGrounding,
    approvedNarrativeBlocks: output.narrative.blocks.map((block) => ({
      key: block.blockKey,
      text: block.text,
    })),
  });
}
