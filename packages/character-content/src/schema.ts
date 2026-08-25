import type { SajuDomain } from '../../contracts/src/index.js';

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
  readonly forbiddenBehaviors: readonly string[];
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
}

export interface CharacterContentBundle {
  readonly bundleId: string;
  readonly contentVersion: string;
  readonly cueSchemaVersion: string;
  readonly minClientCapability: string;
  readonly characters: readonly CharacterContentDefinition[];
}
