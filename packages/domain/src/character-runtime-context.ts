import { createHash } from 'node:crypto';
import type {
  RelationshipEventCandidate,
  SajuDomain,
} from '../../contracts/src/index.js';
import type {
  CharacterCapabilityContent,
  CharacterContentDefinition,
  CharacterRelationshipBehaviorContent,
  CharacterRelationshipMode,
  RelationshipStateBand,
} from '../../character-content/src/index.js';
import type { CharacterRelationDefinition } from '../../world-content/src/index.js';
import type { RelationshipState } from './relationship-engine.js';

export interface RelationshipBandThresholds {
  readonly lowMax: number;
  readonly mediumMax: number;
}

export interface RelationshipRenderingProjectionPolicyV1 {
  readonly version: string;
  readonly closeness: RelationshipBandThresholds;
  readonly trust: RelationshipBandThresholds;
  readonly friction: RelationshipBandThresholds;
}

export interface CharacterRelationshipProjectionV1 {
  readonly schemaVersion: 'v1';
  readonly relationshipRevision: number;
  readonly relationshipPolicyVersion: string;
  readonly projectionPolicyVersion: string;
  readonly stageKey: string;
  readonly closenessBand: RelationshipStateBand;
  readonly trustBand: RelationshipStateBand;
  readonly frictionBand: RelationshipStateBand;
  readonly recentEventKeys: readonly RelationshipEventCandidate[];
  readonly behaviorVersion: string;
  readonly matchedBehaviorRuleKey: string | null;
  readonly mode: CharacterRelationshipMode;
}

function validateThresholds(
  thresholds: RelationshipBandThresholds,
  path: string,
): void {
  if (
    !Number.isFinite(thresholds.lowMax) ||
    !Number.isFinite(thresholds.mediumMax) ||
    thresholds.lowMax >= thresholds.mediumMax
  ) {
    throw new TypeError(`${path} thresholds must be finite and lowMax < mediumMax.`);
  }
}

function toBand(
  value: number,
  thresholds: RelationshipBandThresholds,
): RelationshipStateBand {
  if (!Number.isFinite(value)) throw new TypeError('Relationship score must be finite.');
  if (value <= thresholds.lowMax) return 'low';
  if (value <= thresholds.mediumMax) return 'medium';
  return 'high';
}

function includesIfDefined<T>(values: readonly T[] | undefined, value: T): boolean {
  return values === undefined || values.includes(value);
}

function matchesRelationshipRule(
  rule: CharacterRelationshipBehaviorContent['rules'][number],
  projection: Pick<
    CharacterRelationshipProjectionV1,
    'stageKey' | 'trustBand' | 'closenessBand' | 'frictionBand' | 'recentEventKeys'
  >,
): boolean {
  if (!includesIfDefined(rule.when.stageKeys, projection.stageKey)) return false;
  if (!includesIfDefined(rule.when.trustBands, projection.trustBand)) return false;
  if (!includesIfDefined(rule.when.closenessBands, projection.closenessBand)) return false;
  if (!includesIfDefined(rule.when.frictionBands, projection.frictionBand)) return false;
  if (
    rule.when.recentEventKeys !== undefined &&
    !rule.when.recentEventKeys.some((eventKey) => projection.recentEventKeys.includes(eventKey))
  ) {
    return false;
  }
  return true;
}

export function projectCharacterRelationshipBehavior(input: {
  readonly state: RelationshipState;
  readonly recentEventKeys: readonly RelationshipEventCandidate[];
  readonly projectionPolicy: RelationshipRenderingProjectionPolicyV1;
  readonly behavior: CharacterRelationshipBehaviorContent;
}): CharacterRelationshipProjectionV1 {
  const projectionPolicyVersion = input.projectionPolicy.version.trim();
  if (projectionPolicyVersion.length === 0) {
    throw new TypeError('Relationship rendering projection policy version is required.');
  }
  validateThresholds(input.projectionPolicy.closeness, 'closeness');
  validateThresholds(input.projectionPolicy.trust, 'trust');
  validateThresholds(input.projectionPolicy.friction, 'friction');

  const bands = {
    closenessBand: toBand(input.state.closeness, input.projectionPolicy.closeness),
    trustBand: toBand(input.state.trust, input.projectionPolicy.trust),
    frictionBand: toBand(input.state.friction, input.projectionPolicy.friction),
  } as const;

  const baseProjection = {
    stageKey: input.state.stage,
    ...bands,
    recentEventKeys: Object.freeze([...input.recentEventKeys]),
  };

  const matching = input.behavior.rules
    .filter((rule) => matchesRelationshipRule(rule, baseProjection))
    .sort((left, right) => right.priority - left.priority);

  if (matching.length > 1 && matching[0]!.priority === matching[1]!.priority) {
    throw new TypeError('Ambiguous relationship behavior precedence.');
  }

  const selected = matching[0];
  return Object.freeze({
    schemaVersion: 'v1',
    relationshipRevision: input.state.revision,
    relationshipPolicyVersion: input.state.policyVersion,
    projectionPolicyVersion,
    stageKey: input.state.stage,
    ...bands,
    recentEventKeys: baseProjection.recentEventKeys,
    behaviorVersion: input.behavior.behaviorVersion,
    matchedBehaviorRuleKey: selected?.ruleKey ?? null,
    mode: Object.freeze({ ...(selected?.mode ?? input.behavior.defaultMode) }),
  });
}

export interface GrantedLifeFactContextV1 {
  readonly factId: string;
  readonly factType: string;
  readonly schemaVersion: string;
  readonly value: unknown;
  readonly grantId: string;
  readonly granteeCharacterId: string;
}

export interface GrantedMemoryContextV1 {
  readonly memoryItemId: string;
  readonly memoryType: string;
  readonly schemaVersion: string;
  readonly content: unknown;
  readonly grantId: string;
  readonly granteeCharacterId: string;
}

export interface ProtectedSajuTextRefV1 {
  readonly segmentId: string;
  readonly sourceReadingRef: string;
  readonly sourceRef: string;
  readonly contentHash: string;
  readonly text: string;
}

export type ProtectedSajuSegmentV1 = ProtectedSajuTextRefV1;
export type ProtectedSajuDisclosureV1 = ProtectedSajuTextRefV1;

export function hashProtectedSajuTextV1(text: string): string {
  return `sha256:v1:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

function validateProtectedSajuTextRef(
  value: ProtectedSajuTextRefV1,
  readingRef: string,
  path: string,
): void {
  if (value.segmentId.trim().length === 0) throw new TypeError(`${path}.segmentId is required.`);
  if (value.sourceReadingRef !== readingRef) {
    throw new TypeError(`${path}.sourceReadingRef must match the Saju readingRef.`);
  }
  if (value.sourceRef.trim().length === 0) throw new TypeError(`${path}.sourceRef is required.`);
  if (value.text.trim().length === 0) throw new TypeError(`${path}.text is required.`);
  if (value.contentHash !== hashProtectedSajuTextV1(value.text)) {
    throw new TypeError(`${path}.contentHash does not match protected text.`);
  }
}

export interface CharacterSajuRuntimeContextV1 {
  readonly readingRef: string;
  readonly domain: SajuDomain;
  readonly coverageState: 'complete' | 'partial' | 'insufficient';
  readonly protectedSegments: readonly ProtectedSajuSegmentV1[];
  readonly disclosures: readonly ProtectedSajuDisclosureV1[];
  readonly ambiguity: readonly string[];
  readonly capability: CharacterCapabilityContent;
}

export interface CharacterRendererPolicyV1 {
  readonly allowedEmotionIds: readonly string[];
  readonly allowedAnimationCueIds: readonly string[];
}

export interface CharacterRuntimeContextV1 {
  readonly schemaVersion: 'v1';
  readonly characterId: string;
  readonly contentBundleId: string;
  readonly contentVersion: string;
  readonly canon: NonNullable<CharacterContentDefinition['canon']>;
  readonly persona: NonNullable<CharacterContentDefinition['persona']>;
  readonly behavior: NonNullable<CharacterContentDefinition['behavior']>;
  readonly sajuProfile: NonNullable<CharacterContentDefinition['sajuProfile']>;
  readonly relationship: CharacterRelationshipProjectionV1;
  readonly rendererPolicy: CharacterRendererPolicyV1;
  readonly worldRelations: readonly CharacterRelationDefinition[];
  readonly lifeFacts: readonly GrantedLifeFactContextV1[];
  readonly memories: readonly GrantedMemoryContextV1[];
  readonly recentMessages: readonly string[];
  readonly saju: CharacterSajuRuntimeContextV1 | null;
}

function requireAuthoredCharacter(
  character: CharacterContentDefinition,
): asserts character is CharacterContentDefinition & {
  readonly emotionIds: readonly string[];
  readonly canon: NonNullable<CharacterContentDefinition['canon']>;
  readonly persona: NonNullable<CharacterContentDefinition['persona']>;
  readonly behavior: NonNullable<CharacterContentDefinition['behavior']>;
  readonly sajuProfile: NonNullable<CharacterContentDefinition['sajuProfile']>;
  readonly relationshipBehavior: NonNullable<CharacterContentDefinition['relationshipBehavior']>;
} {
  if (character.developmentPlaceholder) {
    throw new TypeError('Development placeholder cannot enter the authored Character Runtime.');
  }
  if (
    !character.canon ||
    !character.persona ||
    !character.behavior ||
    !character.sajuProfile ||
    !character.relationshipBehavior
  ) {
    throw new TypeError('Authored Character Runtime requires all C1 character profiles.');
  }
  if (character.emotionIds === undefined || character.emotionIds.length === 0) {
    throw new TypeError('Authored Character Runtime requires a content-pinned emotion allowlist.');
  }
}

function assertGrantScope(
  characterId: string,
  records: readonly { readonly grantId: string; readonly granteeCharacterId: string }[],
  kind: string,
): void {
  for (const record of records) {
    if (record.grantId.trim().length === 0) throw new TypeError(`${kind} grantId is required.`);
    if (record.granteeCharacterId !== characterId) {
      throw new TypeError(`${kind} grant is not scoped to the active character.`);
    }
  }
}

export function assembleCharacterRuntimeContext(input: {
  readonly character: CharacterContentDefinition;
  readonly contentBundleId: string;
  readonly relationshipState: RelationshipState;
  readonly recentRelationshipEventKeys: readonly RelationshipEventCandidate[];
  readonly relationshipProjectionPolicy: RelationshipRenderingProjectionPolicyV1;
  readonly worldRelations: readonly CharacterRelationDefinition[];
  readonly grantedLifeFacts: readonly GrantedLifeFactContextV1[];
  readonly grantedMemories: readonly GrantedMemoryContextV1[];
  readonly recentMessages: readonly string[];
  readonly saju?: Omit<CharacterSajuRuntimeContextV1, 'capability'>;
}): CharacterRuntimeContextV1 {
  requireAuthoredCharacter(input.character);
  const characterId = input.character.characterId;
  const contentBundleId = input.contentBundleId.trim();
  if (contentBundleId.length === 0) throw new TypeError('contentBundleId is required.');

  assertGrantScope(characterId, input.grantedLifeFacts, 'Life Fact');
  assertGrantScope(characterId, input.grantedMemories, 'Memory');

  const relationship = projectCharacterRelationshipBehavior({
    state: input.relationshipState,
    recentEventKeys: input.recentRelationshipEventKeys,
    projectionPolicy: input.relationshipProjectionPolicy,
    behavior: input.character.relationshipBehavior,
  });

  let saju: CharacterSajuRuntimeContextV1 | null = null;
  if (input.saju !== undefined) {
    const readingRef = input.saju.readingRef.trim();
    if (readingRef.length === 0) throw new TypeError('Saju readingRef is required.');
    const capability = input.character.capabilities.find(
      (candidate) => candidate.domain === input.saju!.domain,
    );
    if (capability === undefined) {
      throw new TypeError('Character has no capability for the requested Saju domain.');
    }
    if (
      input.saju.coverageState === 'insufficient' &&
      (input.saju.protectedSegments.length > 0 || input.saju.disclosures.length > 0)
    ) {
      throw new TypeError('Insufficient Saju coverage cannot expose protected semantic content.');
    }
    input.saju.protectedSegments.forEach((segment, index) =>
      validateProtectedSajuTextRef(segment, readingRef, `protectedSegments[${index}]`),
    );
    input.saju.disclosures.forEach((disclosure, index) =>
      validateProtectedSajuTextRef(disclosure, readingRef, `disclosures[${index}]`),
    );

    saju = Object.freeze({
      ...input.saju,
      readingRef,
      protectedSegments: Object.freeze(
        input.saju.protectedSegments.map((segment) => Object.freeze({ ...segment })),
      ),
      disclosures: Object.freeze(
        input.saju.disclosures.map((disclosure) => Object.freeze({ ...disclosure })),
      ),
      ambiguity: Object.freeze([...input.saju.ambiguity]),
      capability: Object.freeze({ ...capability }),
    });
  }

  return Object.freeze({
    schemaVersion: 'v1',
    characterId,
    contentBundleId,
    contentVersion: input.character.contentVersion,
    canon: input.character.canon,
    persona: input.character.persona,
    behavior: input.character.behavior,
    sajuProfile: input.character.sajuProfile,
    relationship,
    rendererPolicy: Object.freeze({
      allowedEmotionIds: Object.freeze([...input.character.emotionIds]),
      allowedAnimationCueIds: Object.freeze([...input.character.animationCueIds]),
    }),
    worldRelations: Object.freeze(input.worldRelations.map((relation) => Object.freeze({ ...relation }))),
    lifeFacts: Object.freeze(input.grantedLifeFacts.map((fact) => Object.freeze({ ...fact }))),
    memories: Object.freeze(input.grantedMemories.map((memory) => Object.freeze({ ...memory }))),
    recentMessages: Object.freeze([...input.recentMessages]),
    saju,
  });
}
