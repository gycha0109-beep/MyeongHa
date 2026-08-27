import { RELATIONSHIP_EVENT_CANDIDATES } from '../../contracts/src/index.js';
import type {
  CharacterBehaviorPolicyContent,
  CharacterCanonProfile,
  CharacterContentBundle,
  CharacterContentDefinition,
  CharacterPersonaProfile,
  CharacterRelationshipBehaviorContent,
  CharacterSajuProfileContent,
  RelationshipStateBand,
} from './schema.js';

export class CharacterContentValidationError extends Error {}

function nonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) {
    throw new CharacterContentValidationError(`${path} must not be empty`);
  }
}

function nonEmptyArray<T>(values: readonly T[], path: string): void {
  if (values.length === 0) {
    throw new CharacterContentValidationError(`${path} must not be empty`);
  }
}

function unique<T extends string | number>(values: readonly T[], path: string): void {
  const seen = new Set<T>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new CharacterContentValidationError(`${path} contains duplicate: ${value}`);
    }
    seen.add(value);
  }
}

function boundedPriority(value: number, path: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 1000) {
    throw new CharacterContentValidationError(`${path} must be an integer from 0 to 1000`);
  }
}

function stableKey(value: string, path: string): void {
  nonEmpty(value, path);
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/u.test(value)) {
    throw new CharacterContentValidationError(`${path} must be a stable lower-case key`);
  }
}

function validateStringList(
  values: readonly string[],
  path: string,
  options: { readonly required?: boolean; readonly stableKeys?: boolean } = {},
): void {
  if (options.required) nonEmptyArray(values, path);
  unique(values, path);
  for (const [index, value] of values.entries()) {
    if (options.stableKeys) stableKey(value, `${path}[${index}]`);
    else nonEmpty(value, `${path}[${index}]`);
  }
}

function validateCanon(characterId: string, canon: CharacterCanonProfile): void {
  const path = `${characterId}.canon`;
  nonEmpty(canon.worldRole, `${path}.worldRole`);
  nonEmpty(canon.origin, `${path}.origin`);
  nonEmpty(canon.apparentAgeBand, `${path}.apparentAgeBand`);
  stableKey(canon.deityBond.deityId, `${path}.deityBond.deityId`);
  nonEmpty(canon.deityBond.representationRole, `${path}.deityBond.representationRole`);
  nonEmpty(canon.deityBond.oath, `${path}.deityBond.oath`);
  validateStringList(canon.deityBond.acceptedDoctrine, `${path}.deityBond.acceptedDoctrine`);
  validateStringList(canon.deityBond.resistedDoctrine, `${path}.deityBond.resistedDoctrine`);
  validateStringList(canon.worldview.coreValues, `${path}.worldview.coreValues`, { required: true });
  nonEmpty(canon.worldview.humanTheory, `${path}.worldview.humanTheory`);
  nonEmpty(canon.worldview.agencyTheory, `${path}.worldview.agencyTheory`);
  nonEmpty(canon.worldview.truthTheory, `${path}.worldview.truthTheory`);
  nonEmpty(canon.psychology.desire, `${path}.psychology.desire`);
  nonEmpty(canon.psychology.fear, `${path}.psychology.fear`);
  nonEmpty(canon.psychology.flaw, `${path}.psychology.flaw`);
  nonEmpty(canon.psychology.contradiction, `${path}.psychology.contradiction`);
  nonEmpty(canon.psychology.hiddenMotivation, `${path}.psychology.hiddenMotivation`);
}

function validatePersona(characterId: string, persona: CharacterPersonaProfile): void {
  const path = `${characterId}.persona`;
  for (const [key, value] of Object.entries(persona.communication)) nonEmpty(value, `${path}.communication.${key}`);
  for (const [key, value] of Object.entries(persona.cognition)) nonEmpty(value, `${path}.cognition.${key}`);
  validateStringList(persona.questioning.preferredStrategies, `${path}.questioning.preferredStrategies`, { required: true, stableKeys: true });
  validateStringList(persona.questioning.avoidedStrategies, `${path}.questioning.avoidedStrategies`, { stableKeys: true });
  nonEmpty(persona.questioning.followUpDepth, `${path}.questioning.followUpDepth`);
  const preferred = new Set(persona.questioning.preferredStrategies);
  const overlap = persona.questioning.avoidedStrategies.find((key) => preferred.has(key));
  if (overlap) throw new CharacterContentValidationError(`${path}.questioning strategy cannot be both preferred and avoided: ${overlap}`);
  for (const [key, value] of Object.entries(persona.emotion)) nonEmpty(value, `${path}.emotion.${key}`);
  for (const [key, value] of Object.entries(persona.conflict)) nonEmpty(value, `${path}.conflict.${key}`);
  for (const [key, value] of Object.entries(persona.intimacy)) nonEmpty(value, `${path}.intimacy.${key}`);
}

function validateBehavior(characterId: string, behavior: CharacterBehaviorPolicyContent): void {
  const path = `${characterId}.behavior`;
  nonEmpty(behavior.policyVersion, `${path}.policyVersion`);
  validateStringList(behavior.questionPriorities, `${path}.questionPriorities`, { required: true, stableKeys: true });
  validateStringList(behavior.supportPriorities, `${path}.supportPriorities`, { required: true, stableKeys: true });
  nonEmptyArray(behavior.rules, `${path}.rules`);
  unique(behavior.rules.map((rule) => rule.ruleKey), `${path}.ruleKeys`);
  for (const [index, rule] of behavior.rules.entries()) {
    const rulePath = `${path}.rules[${index}]`;
    stableKey(rule.ruleKey, `${rulePath}.ruleKey`);
    stableKey(rule.triggerKey, `${rulePath}.triggerKey`);
    boundedPriority(rule.priority, `${rulePath}.priority`);
    nonEmpty(rule.preferredResponse, `${rulePath}.preferredResponse`);
    validateStringList(rule.avoid, `${rulePath}.avoid`);
    if (rule.fallback !== undefined) nonEmpty(rule.fallback, `${rulePath}.fallback`);
  }
}

const SAFE_FRAMING_PURPOSES = new Set([
  'record_transition',
  'current_life_question',
  'uncertainty_transition',
  'relationship_transition',
]);

function validateSafeFraming(
  characterId: string,
  profile: CharacterSajuProfileContent,
): void {
  const catalog = profile.safeFraming;
  if (catalog === undefined) return;
  const path = `${characterId}.sajuProfile.safeFraming`;
  if (catalog.schemaVersion !== 'v1') {
    throw new CharacterContentValidationError(`${path}.schemaVersion must be v1`);
  }
  nonEmpty(catalog.catalogVersion, `${path}.catalogVersion`);
  nonEmptyArray(catalog.before, `${path}.before`);
  nonEmptyArray(catalog.after, `${path}.after`);
  unique(
    [...catalog.before, ...catalog.after].map((entry) => entry.key),
    `${path}.keys`,
  );

  for (const [placement, entries] of [
    ['before', catalog.before],
    ['after', catalog.after],
  ] as const) {
    for (const [index, entry] of entries.entries()) {
      const entryPath = `${path}.${placement}[${index}]`;
      stableKey(entry.key, `${entryPath}.key`);
      nonEmpty(entry.text, `${entryPath}.text`);
      if (entry.text.length > 500) {
        throw new CharacterContentValidationError(`${entryPath}.text exceeds 500 characters`);
      }
      if (/[{}]/u.test(entry.text)) {
        throw new CharacterContentValidationError(
          `${entryPath}.text must not contain dynamic interpolation tokens`,
        );
      }
      if (!SAFE_FRAMING_PURPOSES.has(entry.purpose)) {
        throw new CharacterContentValidationError(`${entryPath}.purpose is unknown`);
      }
    }
  }
}

function validateSajuProfile(characterId: string, profile: CharacterSajuProfileContent): void {
  const path = `${characterId}.sajuProfile`;
  nonEmpty(profile.profileVersion, `${path}.profileVersion`);
  validateStringList(profile.attentionAxes, `${path}.attentionAxes`, { required: true, stableKeys: true });
  validateStringList(profile.followUpQuestionStrategies, `${path}.followUpQuestionStrategies`, { required: true, stableKeys: true });
  nonEmpty(profile.framingStyle, `${path}.framingStyle`);
  nonEmpty(profile.uncertaintyResponseStyle, `${path}.uncertaintyResponseStyle`);
  nonEmpty(profile.insufficientEvidenceResponseStyle, `${path}.insufficientEvidenceResponseStyle`);
  validateStringList(profile.referralBehavior.conditions, `${path}.referralBehavior.conditions`, { stableKeys: true });
  if (!profile.referralBehavior.maySuggestAnotherCharacter && profile.referralBehavior.conditions.length > 0) {
    throw new CharacterContentValidationError(`${path}.referralBehavior.conditions requires maySuggestAnotherCharacter=true`);
  }
  validateSafeFraming(characterId, profile);
}

const RELATIONSHIP_BANDS = new Set<RelationshipStateBand>(['low', 'medium', 'high']);
const RELATIONSHIP_EVENTS = new Set<string>(RELATIONSHIP_EVENT_CANDIDATES);

function validateRelationshipBehavior(characterId: string, relationshipBehavior: CharacterRelationshipBehaviorContent): void {
  const path = `${characterId}.relationshipBehavior`;
  nonEmpty(relationshipBehavior.behaviorVersion, `${path}.behaviorVersion`);
  for (const [key, value] of Object.entries(relationshipBehavior.defaultMode)) nonEmpty(value, `${path}.defaultMode.${key}`);
  nonEmptyArray(relationshipBehavior.rules, `${path}.rules`);
  unique(relationshipBehavior.rules.map((rule) => rule.ruleKey), `${path}.ruleKeys`);
  unique(relationshipBehavior.rules.map((rule) => rule.priority), `${path}.priorities`);

  for (const [index, rule] of relationshipBehavior.rules.entries()) {
    const rulePath = `${path}.rules[${index}]`;
    stableKey(rule.ruleKey, `${rulePath}.ruleKey`);
    boundedPriority(rule.priority, `${rulePath}.priority`);
    const conditions = [rule.when.stageKeys, rule.when.trustBands, rule.when.closenessBands, rule.when.frictionBands, rule.when.recentEventKeys];
    if (!conditions.some((values) => values !== undefined && values.length > 0)) {
      throw new CharacterContentValidationError(`${rulePath}.when must contain a condition`);
    }
    if (rule.when.stageKeys) validateStringList(rule.when.stageKeys, `${rulePath}.when.stageKeys`, { stableKeys: true });
    if (rule.when.recentEventKeys) {
      unique(rule.when.recentEventKeys, `${rulePath}.when.recentEventKeys`);
      for (const eventKey of rule.when.recentEventKeys) {
        if (!RELATIONSHIP_EVENTS.has(eventKey)) throw new CharacterContentValidationError(`${rulePath}.when.recentEventKeys contains unknown relationship event`);
      }
    }
    for (const [bandPath, bands] of [
      ['trustBands', rule.when.trustBands],
      ['closenessBands', rule.when.closenessBands],
      ['frictionBands', rule.when.frictionBands],
    ] as const) {
      if (!bands) continue;
      nonEmptyArray(bands, `${rulePath}.when.${bandPath}`);
      unique(bands, `${rulePath}.when.${bandPath}`);
      for (const band of bands) {
        if (!RELATIONSHIP_BANDS.has(band)) throw new CharacterContentValidationError(`${rulePath}.when.${bandPath} contains unknown band`);
      }
    }
    for (const [key, value] of Object.entries(rule.mode)) nonEmpty(value, `${rulePath}.mode.${key}`);
  }
}

function validateAuthoredCharacter(character: CharacterContentDefinition): void {
  const id = character.characterId;
  if (character.personalityTraits.length === 0) throw new CharacterContentValidationError(`${id}.personalityTraits must not be empty`);
  if (character.flaws.length === 0) throw new CharacterContentValidationError(`${id}.flaws must not be empty`);
  if (character.values.length === 0) throw new CharacterContentValidationError(`${id}.values must not be empty`);
  if (character.deityProxyLabel === 'placeholder') throw new CharacterContentValidationError(`${id}.deityProxyLabel must be authored`);
  if (character.emotionIds === undefined || character.emotionIds.length === 0) throw new CharacterContentValidationError(`${id}.emotionIds must not be empty`);
  if (!character.canon) throw new CharacterContentValidationError(`${id}.canon is required`);
  if (!character.persona) throw new CharacterContentValidationError(`${id}.persona is required`);
  if (!character.behavior) throw new CharacterContentValidationError(`${id}.behavior is required`);
  if (!character.sajuProfile) throw new CharacterContentValidationError(`${id}.sajuProfile is required`);
  if (!character.relationshipBehavior) throw new CharacterContentValidationError(`${id}.relationshipBehavior is required`);
  validateCanon(id, character.canon);
  validatePersona(id, character.persona);
  validateBehavior(id, character.behavior);
  validateSajuProfile(id, character.sajuProfile);
  validateRelationshipBehavior(id, character.relationshipBehavior);
}

export function validateCharacterContentBundle(bundle: CharacterContentBundle): CharacterContentBundle {
  nonEmpty(bundle.bundleId, 'bundleId');
  nonEmpty(bundle.contentVersion, 'contentVersion');
  nonEmpty(bundle.cueSchemaVersion, 'cueSchemaVersion');
  nonEmpty(bundle.minClientCapability, 'minClientCapability');
  if (bundle.characters.length === 0) throw new CharacterContentValidationError('characters must not be empty');
  unique(bundle.characters.map((character) => character.characterId), 'characterIds');

  for (const character of bundle.characters) {
    nonEmpty(character.characterId, 'character.characterId');
    nonEmpty(character.contentVersion, `${character.characterId}.contentVersion`);
    if (character.contentVersion !== bundle.contentVersion) throw new CharacterContentValidationError(`${character.characterId}.contentVersion must match bundle contentVersion`);
    nonEmpty(character.displayName, `${character.characterId}.displayName`);
    nonEmpty(character.deityProxyLabel, `${character.characterId}.deityProxyLabel`);
    nonEmpty(character.shortDescriptor, `${character.characterId}.shortDescriptor`);
    if (character.capabilities.length === 0) throw new CharacterContentValidationError(`${character.characterId}.capabilities must not be empty`);
    unique(character.capabilities.map((capability) => capability.domain), `${character.characterId}.capabilities.domain`);
    if (character.emotionIds !== undefined) validateStringList(character.emotionIds, `${character.characterId}.emotionIds`, { stableKeys: true });
    validateStringList(character.animationCueIds, `${character.characterId}.animationCueIds`, { stableKeys: true });
    unique(character.speech.forbiddenBehaviors, `${character.characterId}.speech.forbiddenBehaviors`);
    if (!character.speech.forbiddenBehaviors.includes('alter_saju_semantics')) throw new CharacterContentValidationError(`${character.characterId}.speech must forbid alter_saju_semantics`);
    for (const capability of character.capabilities) nonEmpty(capability.capabilityVersion, `${character.characterId}.capabilityVersion`);
    if (!character.developmentPlaceholder) validateAuthoredCharacter(character);
  }

  return bundle;
}
