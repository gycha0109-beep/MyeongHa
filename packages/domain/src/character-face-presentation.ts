import { createHash } from 'node:crypto';
import {
  validateCharacterFacePresentationProfileForCharacterV1,
  validateCharacterFacePresentationProfileV1,
  type CharacterFacePresentationContentIdentityV1,
  type CharacterFacePresentationModeV1,
  type CharacterFacePresentationProfileV1,
} from '../../character-content/src/face-presentation.js';
import {
  projectResearchFaceDiagnosisGrounding,
  type FaceResearchCharacterGrounding,
  type FaceResearchDiagnosisOutput,
} from '../../face-reading/src/index.js';

export {
  validateCharacterFacePresentationProfileForCharacterV1,
  validateCharacterFacePresentationProfileV1,
};
export type {
  CharacterFacePresentationContentIdentityV1,
  CharacterFacePresentationModeV1,
  CharacterFacePresentationProfileV1,
};

export type CharacterFacePresentationFocusV1 =
  | 'dominant_feature'
  | 'contrast_axis'
  | 'local_detail';

export type CharacterFaceFollowUpStrategyV1 =
  | 'inspect_dominant_feature'
  | 'explore_contrast_axis'
  | 'inspect_local_detail';

export interface CharacterFacePresentationBlockV1 {
  readonly key: string;
  readonly text: string;
}

export interface CharacterFacePresentationV1 {
  readonly schemaVersion: 'v1';
  readonly characterId: string;
  readonly characterContentVersion: string;
  readonly profileVersion: string;
  readonly requestedMode: CharacterFacePresentationModeV1;
  readonly effectiveMode: CharacterFacePresentationModeV1;
  readonly focus: CharacterFacePresentationFocusV1;
  readonly followUpStrategy: CharacterFaceFollowUpStrategyV1;
  readonly fallbackReason: 'no_tension_block' | null;
  readonly emphasisBlockKey: string;
  readonly protectedDiagnosisDigest: string;
  readonly protectedGrounding: FaceResearchCharacterGrounding;
  readonly orderedBlocks: readonly CharacterFacePresentationBlockV1[];
}

export class CharacterFacePresentationError extends Error {}

interface ClassifiedBlocks {
  readonly framing: CharacterFacePresentationBlockV1;
  readonly verdict: CharacterFacePresentationBlockV1;
  readonly features: readonly CharacterFacePresentationBlockV1[];
  readonly tension: CharacterFacePresentationBlockV1 | null;
}

function nonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) {
    throw new CharacterFacePresentationError(`${path} must be non-empty.`);
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function classifyApprovedBlocks(grounding: FaceResearchCharacterGrounding): ClassifiedBlocks {
  const blocks = grounding.approvedNarrativeBlocks;
  if (blocks === undefined || blocks.length === 0) {
    throw new CharacterFacePresentationError('Research Face grounding requires approved narrative blocks.');
  }

  const seen = new Set<string>();
  let framing: CharacterFacePresentationBlockV1 | null = null;
  let verdict: CharacterFacePresentationBlockV1 | null = null;
  let tension: CharacterFacePresentationBlockV1 | null = null;
  const features: CharacterFacePresentationBlockV1[] = [];

  for (const block of blocks) {
    nonEmpty(block.key, 'approvedNarrativeBlock.key');
    nonEmpty(block.text, `approvedNarrativeBlock.${block.key}.text`);
    if (seen.has(block.key)) {
      throw new CharacterFacePresentationError(`Duplicate approved narrative block: ${block.key}`);
    }
    seen.add(block.key);
    const projected = Object.freeze({ key: block.key, text: block.text });

    if (block.key === 'face.research.framing') {
      if (framing !== null) throw new CharacterFacePresentationError('Multiple Face framing blocks are not allowed.');
      framing = projected;
      continue;
    }
    if (block.key.startsWith('face.research.verdict.')) {
      if (verdict !== null) throw new CharacterFacePresentationError('Multiple Face verdict blocks are not allowed.');
      verdict = projected;
      continue;
    }
    if (block.key.startsWith('face.research.feature.')) {
      features.push(projected);
      continue;
    }
    if (block.key.startsWith('face.five_officers.tension.')) {
      if (tension !== null) throw new CharacterFacePresentationError('Multiple Face tension blocks are not allowed.');
      tension = projected;
      continue;
    }
    throw new CharacterFacePresentationError(`Unrecognized approved Face narrative block: ${block.key}`);
  }

  if (framing === null) throw new CharacterFacePresentationError('Face framing block is required.');
  if (verdict === null) throw new CharacterFacePresentationError('Face verdict block is required.');
  if (features.length === 0) throw new CharacterFacePresentationError('At least one Face feature block is required.');

  return Object.freeze({
    framing,
    verdict,
    features: Object.freeze(features),
    tension,
  });
}

function protectedGroundingDigest(grounding: FaceResearchCharacterGrounding): string {
  const semanticClaims = [...grounding.semanticClaims]
    .sort((left, right) => left.claimRef.localeCompare(right.claimRef))
    .map((claim) => ({
      claimRef: claim.claimRef,
      key: claim.key,
      axis: claim.axis ?? null,
      pattern: claim.pattern ?? null,
    }));
  const approvedNarrativeBlocks = [...(grounding.approvedNarrativeBlocks ?? [])]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((block) => ({ key: block.key, text: block.text }));

  const canonical = JSON.stringify({
    authorityState: grounding.authorityState,
    assertionAuthority: grounding.assertionAuthority,
    evidenceRefs: [...grounding.evidenceRefs].sort(),
    semanticSignature: grounding.semanticSignature,
    groundingVersion: grounding.groundingVersion,
    faceReadingRef: grounding.faceReadingRef,
    faceEngineVersion: grounding.faceEngineVersion,
    methodologyPackRef: grounding.methodologyPackRef,
    semanticClaims,
    approvedNarrativeBlocks,
    unavailableSections: [...grounding.unavailableSections].sort(),
    prohibitedInferences: [...grounding.prohibitedInferences].sort(),
  });

  return `sha256:v1:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}

function assertExactBlockCoverage(
  grounding: FaceResearchCharacterGrounding,
  orderedBlocks: readonly CharacterFacePresentationBlockV1[],
): void {
  const source = grounding.approvedNarrativeBlocks ?? [];
  if (orderedBlocks.length !== source.length) {
    throw new CharacterFacePresentationError('Character Face presentation must include every approved narrative block exactly once.');
  }
  const expected = new Map(source.map((block) => [block.key, block.text] as const));
  const seen = new Set<string>();
  for (const block of orderedBlocks) {
    if (seen.has(block.key)) {
      throw new CharacterFacePresentationError(`Character Face presentation duplicates block: ${block.key}`);
    }
    seen.add(block.key);
    if (expected.get(block.key) !== block.text) {
      throw new CharacterFacePresentationError(`Character Face presentation altered approved block text: ${block.key}`);
    }
  }
  if (seen.size !== expected.size) {
    throw new CharacterFacePresentationError('Character Face presentation omitted an approved narrative block.');
  }
}

function presentationPlan(
  mode: CharacterFacePresentationModeV1,
  blocks: ClassifiedBlocks,
): {
  readonly effectiveMode: CharacterFacePresentationModeV1;
  readonly focus: CharacterFacePresentationFocusV1;
  readonly followUpStrategy: CharacterFaceFollowUpStrategyV1;
  readonly fallbackReason: 'no_tension_block' | null;
  readonly emphasisBlockKey: string;
  readonly orderedBlocks: readonly CharacterFacePresentationBlockV1[];
} {
  if (mode === 'contrast_first' && blocks.tension !== null) {
    return {
      effectiveMode: 'contrast_first',
      focus: 'contrast_axis',
      followUpStrategy: 'explore_contrast_axis',
      fallbackReason: null,
      emphasisBlockKey: blocks.tension.key,
      orderedBlocks: [blocks.framing, blocks.tension, blocks.verdict, ...blocks.features],
    };
  }

  if (mode === 'detail_first') {
    return {
      effectiveMode: 'detail_first',
      focus: 'local_detail',
      followUpStrategy: 'inspect_local_detail',
      fallbackReason: null,
      emphasisBlockKey: blocks.features[0]!.key,
      orderedBlocks: [
        blocks.framing,
        ...blocks.features,
        blocks.verdict,
        ...(blocks.tension === null ? [] : [blocks.tension]),
      ],
    };
  }

  return {
    effectiveMode: 'strongest_first',
    focus: 'dominant_feature',
    followUpStrategy: 'inspect_dominant_feature',
    fallbackReason: mode === 'contrast_first' ? 'no_tension_block' : null,
    emphasisBlockKey: blocks.verdict.key,
    orderedBlocks: [
      blocks.framing,
      blocks.verdict,
      ...blocks.features,
      ...(blocks.tension === null ? [] : [blocks.tension]),
    ],
  };
}

export function presentResearchFaceDiagnosisForCharacter(input: {
  readonly diagnosis: FaceResearchDiagnosisOutput;
  readonly groundingVersion: string;
  readonly character: CharacterFacePresentationContentIdentityV1;
  readonly profile: CharacterFacePresentationProfileV1;
}): CharacterFacePresentationV1 {
  validateCharacterFacePresentationProfileForCharacterV1(input.profile, input.character);

  // This call also rejects a structurally forged research diagnosis object.
  const grounding = projectResearchFaceDiagnosisGrounding(input.diagnosis, input.groundingVersion);
  const blocks = classifyApprovedBlocks(grounding);
  const plan = presentationPlan(input.profile.mode, blocks);
  assertExactBlockCoverage(grounding, plan.orderedBlocks);

  return deepFreeze({
    schemaVersion: 'v1' as const,
    characterId: input.character.characterId,
    characterContentVersion: input.character.contentVersion,
    profileVersion: input.profile.profileVersion,
    requestedMode: input.profile.mode,
    effectiveMode: plan.effectiveMode,
    focus: plan.focus,
    followUpStrategy: plan.followUpStrategy,
    fallbackReason: plan.fallbackReason,
    emphasisBlockKey: plan.emphasisBlockKey,
    protectedDiagnosisDigest: protectedGroundingDigest(grounding),
    protectedGrounding: grounding,
    orderedBlocks: [...plan.orderedBlocks],
  });
}
