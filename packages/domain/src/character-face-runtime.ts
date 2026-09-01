import {
  validateCharacterFaceSafeFollowUpCatalogForCharacterV1,
  type CharacterFaceSafeFollowUpCatalogV1,
} from '../../character-content/src/face-followup.js';
import type { RelationshipStateBand } from '../../character-content/src/schema.js';
import type {
  CharacterFacePresentationProfileV1,
  CharacterFacePresentationContentIdentityV1,
} from '../../character-content/src/face-presentation.js';
import type { CharacterRelationshipProjectionV1 } from './character-runtime-context.js';
import {
  presentResearchFaceGroundingForCharacter,
  type CharacterFacePresentationV1,
  type ResearchCharacterFaceGroundingV1,
} from './character-face-presentation.js';

export interface CharacterFaceRuntimeProjectionV1 extends CharacterFacePresentationContentIdentityV1 {
  readonly relationship: Pick<
    CharacterRelationshipProjectionV1,
    'relationshipRevision' | 'relationshipPolicyVersion' | 'trustBand' | 'behaviorVersion'
  >;
}

export interface CharacterFaceSafeFollowUpSelectionV1 {
  readonly key: string;
  readonly catalogVersion: string;
  readonly strategy: CharacterFacePresentationV1['followUpStrategy'];
  readonly trustBand: RelationshipStateBand;
  readonly text: string;
}

export interface CharacterFaceRuntimeTurnV1 {
  readonly schemaVersion: 'v1';
  readonly characterId: string;
  readonly characterContentVersion: string;
  readonly relationshipRevision: number;
  readonly relationshipPolicyVersion: string;
  readonly relationshipBehaviorVersion: string;
  readonly presentation: CharacterFacePresentationV1;
  readonly followUp: CharacterFaceSafeFollowUpSelectionV1;
}

export class CharacterFaceRuntimeError extends Error {}

const TRUST_BANDS = new Set<RelationshipStateBand>(['low', 'medium', 'high']);

function nonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) throw new CharacterFaceRuntimeError(`${path} must be non-empty.`);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function validateRuntimeProjection(context: CharacterFaceRuntimeProjectionV1): void {
  nonEmpty(context.characterId, 'characterRuntime.characterId');
  nonEmpty(context.contentVersion, 'characterRuntime.contentVersion');
  if (!Number.isInteger(context.relationship.relationshipRevision) || context.relationship.relationshipRevision < 0) {
    throw new CharacterFaceRuntimeError('characterRuntime.relationship.relationshipRevision must be a non-negative integer.');
  }
  nonEmpty(context.relationship.relationshipPolicyVersion, 'characterRuntime.relationship.relationshipPolicyVersion');
  nonEmpty(context.relationship.behaviorVersion, 'characterRuntime.relationship.behaviorVersion');
  if (!TRUST_BANDS.has(context.relationship.trustBand)) {
    throw new CharacterFaceRuntimeError(`Unsupported Character Runtime trust band: ${String(context.relationship.trustBand)}`);
  }
}

export function renderResearchFaceCharacterRuntimeTurn(input: {
  readonly grounding: ResearchCharacterFaceGroundingV1;
  readonly context: CharacterFaceRuntimeProjectionV1;
  readonly presentationProfile: CharacterFacePresentationProfileV1;
  readonly followUpCatalog: CharacterFaceSafeFollowUpCatalogV1;
}): CharacterFaceRuntimeTurnV1 {
  validateRuntimeProjection(input.context);
  validateCharacterFaceSafeFollowUpCatalogForCharacterV1(input.followUpCatalog, input.context);

  const presentation = presentResearchFaceGroundingForCharacter({
    grounding: input.grounding,
    character: input.context,
    profile: input.presentationProfile,
  });

  const strategy = presentation.followUpStrategy;
  const trustBand = input.context.relationship.trustBand;
  const text = input.followUpCatalog.byStrategy[strategy][trustBand];
  nonEmpty(text, `faceFollowUp.${strategy}.${trustBand}`);

  return deepFreeze({
    schemaVersion: 'v1' as const,
    characterId: input.context.characterId,
    characterContentVersion: input.context.contentVersion,
    relationshipRevision: input.context.relationship.relationshipRevision,
    relationshipPolicyVersion: input.context.relationship.relationshipPolicyVersion,
    relationshipBehaviorVersion: input.context.relationship.behaviorVersion,
    presentation,
    followUp: {
      key: `face.followup.${strategy}.${trustBand}`,
      catalogVersion: input.followUpCatalog.catalogVersion,
      strategy,
      trustBand,
      text,
    },
  });
}
