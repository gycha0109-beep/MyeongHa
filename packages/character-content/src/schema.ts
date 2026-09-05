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

/**
 * Versioned visual-authoring slots required by the Character C1/C2 contract.
 * Values remain free-form authored canon; this schema does not decide the real roster.
 */
export interface CharacterVisualProfile {
  readonly visualVersion: string;
  readonly visualDirection: string;
  readonly silhouette: string;
  readonly palette: readonly string[];
  readonly motifs: readonly string[];
  readonly costumeDirection: string;
  readonly prohibitedTropes: readonly string[];
}

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

export interface CharacterBehaviorPolicyContent {
  readonly policyVersion: string;
  readonly questionPriorities: readonly string[];
  readonly supportPriorities: readonly string[];
  readonly rules: readonly CharacterBehaviorRule[];
}

/**
 * Human-authored, versioned non-semantic wrapper text for the strict Saju-bearing baseline.
 * No dynamic interpolation is supported: provider selection chooses keys only.
 */
export interface CharacterSajuSafeFramingEntryV1 {
  readonly key: string;
  readonly text: string;
  readonly purpose:
    | 'record_transition'
    | 'current_life_question'
    | 'uncertainty_transition'
    | 'relationship_transition';
}

export interface CharacterSajuSafeFramingCatalogV1 {
  readonly schemaVersion: 'v1';
  readonly catalogVersion: string;
  readonly before: readonly CharacterSajuSafeFramingEntryV1[];
  readonly after: readonly CharacterSajuSafeFramingEntryV1[];
}

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
  /** Optional until real roster authoring; required by the strict Saju-bearing renderer. */
  readonly safeFraming?: CharacterSajuSafeFramingCatalogV1;
}

export type RelationshipStateBand = 'low' | 'medium' | 'high';

export interface CharacterRelationshipMode {
  readonly distance: string;
  readonly questionDepth: string;
  readonly selfDisclosure: string;
  readonly humorIntensity: string;
  readonly directness: string;
  readonly memoryReferenceFrequency: string;
  readonly nicknameBehavior: string;
  readonly conflictSensitivity: string;
}

export interface CharacterRelationshipBehaviorRule {
  readonly ruleKey: string;
  readonly priority: number;
  readonly when: {
    readonly stageKeys?: readonly string[];
    readonly trustBands?: readonly RelationshipStateBand[];
    readonly closenessBands?: readonly RelationshipStateBand[];
    readonly frictionBands?: readonly RelationshipStateBand[];
    /** Any listed event is sufficient once the other supplied conditions match. */
    readonly recentEventKeys?: readonly RelationshipEventCandidate[];
  };
  readonly mode: CharacterRelationshipMode;
}

export interface CharacterRelationshipBehaviorContent {
  readonly behaviorVersion: string;
  readonly defaultMode: CharacterRelationshipMode;
  readonly rules: readonly CharacterRelationshipBehaviorRule[];
}

export interface CharacterContentDefinition {
  readonly characterId: string;
  readonly contentVersion: string;
  readonly displayName: string;
  /**
   * Free-form source-authored gender canon. Optional for pre-C2 engineering fixtures;
   * required by the Production publication boundary for real roster content.
   */
  readonly gender?: string;
  readonly deityProxyLabel: string;
  readonly shortDescriptor: string;
  readonly personalityTraits: readonly string[];
  readonly flaws: readonly string[];
  readonly values: readonly string[];
  readonly speech: CharacterSpeechProfile;
  readonly capabilities: readonly CharacterCapabilityContent[];
  readonly assetRefs: readonly string[];
  /** Character-content-pinned renderer allowlist. Required for authored runtime characters. */
  readonly emotionIds?: readonly string[];
  readonly animationCueIds: readonly string[];

  readonly canon?: CharacterCanonProfile;
  readonly visual?: CharacterVisualProfile;
  readonly persona?: CharacterPersonaProfile;
  readonly behavior?: CharacterBehaviorPolicyContent;
  readonly sajuProfile?: CharacterSajuProfileContent;
  readonly relationshipBehavior?: CharacterRelationshipBehaviorContent;

  readonly developmentPlaceholder?: true;
}

export interface CharacterContentBundle {
  readonly bundleId: string;
  readonly contentVersion: string;
  /** Opaque immutable asset-manifest provenance required by the client ContentManifest contract. */
  readonly assetManifestHash: string;
  readonly cueSchemaVersion: string;
  readonly minClientCapability: string;
  readonly characters: readonly CharacterContentDefinition[];
}
