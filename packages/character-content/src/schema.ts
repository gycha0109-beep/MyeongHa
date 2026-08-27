import type {
  RelationshipEventCandidate,
  SajuDomain,
} from '../../contracts/src/index.js';

export type CharacterContentRole = 'primary' | 'secondary' | 'commentary';

export interface CharacterCapabilityContent {
  readonly domain: SajuDomain;
  readonly role: CharacterContentRole;
  readonly canInitiate: boolean;
  readonly capabilityVersion: string;
}

export interface CharacterSpeechProfile {
  readonly register: string;
  readonly sentenceRhythm: string;
  readonly directness: 'low' | 'medium' | 'high';
  readonly warmth: 'low' | 'medium' | 'high';
  readonly profanity: 'none' | 'light' | 'moderate';
  readonly forbiddenBehaviors: readonly (
    | 'alter_saju_semantics'
    | 'invent_current_life_fact'
    | 'mutate_relationship_directly'
    | 'invent_world_canon'
  )[];
}

/**
 * Stable canon: who the representative is in the world.
 * Saju domain ownership intentionally does not live here.
 */
export interface CharacterCanonProfile {
  readonly worldRole: string;
  readonly origin: string;
  readonly apparentAgeBand: string;
  readonly deityBond: {
    readonly deityId: string;
    readonly representationRole: string;
    readonly oath: string;
    readonly acceptedDoctrine: readonly string[];
    readonly resistedDoctrine: readonly string[];
  };
  readonly worldview: {
    readonly coreValues: readonly string[];
    readonly humanTheory: string;
    readonly agencyTheory: string;
    readonly truthTheory: string;
  };
  readonly psychology: {
    readonly desire: string;
    readonly fear: string;
    readonly flaw: string;
    readonly contradiction: string;
    readonly hiddenMotivation: string;
  };
}

/** Rich authoring persona. CharacterSpeechProfile remains the compact runtime/UI projection. */
export interface CharacterPersonaProfile {
  readonly communication: {
    readonly register: string;
    readonly sentenceRhythm: string;
    readonly verbosity: string;
    readonly humorStyle: string;
    readonly metaphorStyle: string;
    readonly profanityIntensity: string;
    readonly politenessStyle: string;
  };
  readonly cognition: {
    readonly thinkingTempo: string;
    readonly ambiguityTolerance: string;
    readonly conclusionStyle: string;
    readonly contradictionSensitivity: string;
  };
  readonly questioning: {
    readonly preferredStrategies: readonly string[];
    readonly avoidedStrategies: readonly string[];
    readonly followUpDepth: string;
  };
  readonly emotion: {
    readonly expressiveness: string;
    readonly empathyStyle: string;
    readonly angerStyle: string;
    readonly embarrassmentStyle: string;
  };
  readonly conflict: {
    readonly confrontationStyle: string;
    readonly apologyStyle: string;
    readonly withdrawalStyle: string;
  };
  readonly intimacy: {
    readonly pace: string;
    readonly selfDisclosure: string;
    readonly boundaryStyle: string;
    readonly attachmentExpression: string;
  };
}

export interface CharacterBehaviorRule {
  readonly ruleKey: string;
  readonly triggerKey: string;
  readonly priority: number;
  readonly preferredResponse: string;
  readonly avoid: readonly string[];
  readonly fallback?: string;
}

/**
 * Bounded behavior preferences. These rules select priorities and boundaries;
 * they are not exact dialogue templates and cannot mutate authority state.
 */
export interface CharacterBehaviorPolicyContent {
  readonly policyVersion: string;
  readonly questionPriorities: readonly string[];
  readonly supportPriorities: readonly string[];
  readonly rules: readonly CharacterBehaviorRule[];
}

/**
 * Character-specific handling around a governed Saju reading.
 * Domain access/initiative remains in CharacterCapabilityContent.
 */
export interface CharacterSajuProfileContent {
  readonly profileVersion: string;
  readonly attentionAxes: readonly string[];
  readonly followUpQuestionStrategies: readonly string[];
  readonly framingStyle: string;
  readonly uncertaintyResponseStyle: string;
  readonly insufficientEvidenceResponseStyle: string;
  readonly referralBehavior: {
    readonly maySuggestAnotherCharacter: boolean;
    readonly conditions: readonly string[];
  };
}

export type RelationshipStateBand = 'low' | 'medium' | 'high';

export interface CharacterRelationshipBehaviorRule {
  readonly ruleKey: string;
  readonly when: {
    readonly stageKeys?: readonly string[];
    readonly trustBands?: readonly RelationshipStateBand[];
    readonly closenessBands?: readonly RelationshipStateBand[];
    readonly frictionBands?: readonly RelationshipStateBand[];
    readonly recentEventKeys?: readonly RelationshipEventCandidate[];
  };
  readonly mode: {
    readonly distance: string;
    readonly questionDepth: string;
    readonly selfDisclosure: string;
    readonly humorIntensity: string;
    readonly directness: string;
    readonly memoryReferenceFrequency: string;
    readonly nicknameBehavior: string;
    readonly conflictSensitivity: string;
  };
}

/** Rendering projection only. Relationship mutations remain server-policy authority. */
export interface CharacterRelationshipBehaviorContent {
  readonly behaviorVersion: string;
  readonly defaultMode: CharacterRelationshipBehaviorRule['mode'];
  readonly rules: readonly CharacterRelationshipBehaviorRule[];
}

export interface CharacterContentDefinition {
  readonly characterId: string;
  readonly contentVersion: string;
  readonly displayName: string;
  readonly deityProxyLabel: string;
  readonly shortDescriptor: string;
  readonly personalityTraits: readonly string[];
  readonly flaws: readonly string[];
  readonly values: readonly string[];
  readonly speech: CharacterSpeechProfile;
  readonly capabilities: readonly CharacterCapabilityContent[];
  readonly assetRefs: readonly string[];
  readonly animationCueIds: readonly string[];

  /** C1 authored contracts. Required before developmentPlaceholder promotion. */
  readonly canon?: CharacterCanonProfile;
  readonly persona?: CharacterPersonaProfile;
  readonly behavior?: CharacterBehaviorPolicyContent;
  readonly sajuProfile?: CharacterSajuProfileContent;
  readonly relationshipBehavior?: CharacterRelationshipBehaviorContent;

  readonly developmentPlaceholder?: true;
}

export interface CharacterContentBundle {
  readonly bundleId: string;
  readonly contentVersion: string;
  readonly cueSchemaVersion: string;
  readonly minClientCapability: string;
  readonly characters: readonly CharacterContentDefinition[];
}
