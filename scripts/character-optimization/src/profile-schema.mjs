import {
  CHARACTER_IDS, IMMUTABLE_KEYS, MUTABLE_SLOTS,
  fail, keys, object, string, hash, reference, id, objectSha256,
} from './contracts.mjs';

const CHARACTER_FIELDS = ['characterId', 'canonRef', 'runtimeRef', 'contentBundleSha256', 'authorityVersion', 'authorityState', 'student', 'evalSuite'];
const EVAL_FIELDS = ['developmentRef', 'validationRef', 'holdoutRef', 'rubricVersion', 'splitManifestSha256'];
const PROFILE_FIELDS = ['target', 'immutableContextKeys', 'mutableSlots', 'exampleBankRef', 'privacyPolicyRef', 'reviewRequired'];

export function validateOptimizationProfile(value) {
  keys(value, PROFILE_FIELDS, PROFILE_FIELDS.filter(k => k !== 'exampleBankRef'), 'profile');
  keys(value.target, CHARACTER_FIELDS, CHARACTER_FIELDS, 'target');
  const target = value.target;
  if (!CHARACTER_IDS.includes(target.characterId)) fail('target.characterId', 'unknown character');
  reference(target.canonRef, 'target.canonRef');
  reference(target.runtimeRef, 'target.runtimeRef');
  const prefix = `docs/character/${target.characterId.toUpperCase()}_CHARACTER_`;
  if (!target.canonRef.startsWith(`${prefix}BIBLE_`) || !target.runtimeRef.startsWith(`${prefix}RUNTIME_`)) fail('target.source', 'cross-character source reference');
  hash(target.contentBundleSha256, 'target.contentBundleSha256');
  id(target.authorityVersion, 'target.authorityVersion');
  if (!['DRAFT', 'APPROVED', 'OTHER_VERIFIED'].includes(target.authorityState)) fail('target.authorityState', 'unknown authority state');
  keys(target.student, ['provider', 'modelId', 'parametersSha256', 'routingPolicySha256'], ['provider', 'modelId', 'parametersSha256', 'routingPolicySha256'], 'target.student');
  if (target.student.provider !== 'openrouter') fail('target.student.provider', 'unapproved provider');
  string(target.student.modelId, 'target.student.modelId');
  if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._:-]+$/.test(target.student.modelId)) fail('target.student.modelId', 'invalid provider model');
  hash(target.student.parametersSha256, 'target.student.parametersSha256');
  hash(target.student.routingPolicySha256, 'target.student.routingPolicySha256');
  keys(target.evalSuite, EVAL_FIELDS, EVAL_FIELDS, 'target.evalSuite');
  for (const field of ['developmentRef', 'validationRef', 'holdoutRef']) reference(target.evalSuite[field], `target.evalSuite.${field}`);
  if (new Set([target.evalSuite.developmentRef, target.evalSuite.validationRef, target.evalSuite.holdoutRef]).size !== 3) fail('target.evalSuite', 'dataset references must differ');
  id(target.evalSuite.rubricVersion, 'target.evalSuite.rubricVersion');
  hash(target.evalSuite.splitManifestSha256, 'target.evalSuite.splitManifestSha256');
  if (!Array.isArray(value.immutableContextKeys) || value.immutableContextKeys.length !== IMMUTABLE_KEYS.length || new Set(value.immutableContextKeys).size !== IMMUTABLE_KEYS.length || !IMMUTABLE_KEYS.every(k => value.immutableContextKeys.includes(k))) fail('immutableContextKeys', 'all immutable keys required');
  if (!Array.isArray(value.mutableSlots) || value.mutableSlots.length < 1 || value.mutableSlots.length > 2 || new Set(value.mutableSlots).size !== value.mutableSlots.length || !value.mutableSlots.every(k => MUTABLE_SLOTS.includes(k))) fail('mutableSlots', 'unrecognized or duplicate slot');
  if (value.exampleBankRef !== undefined) reference(value.exampleBankRef, 'exampleBankRef');
  reference(value.privacyPolicyRef, 'privacyPolicyRef');
  if (value.reviewRequired !== true) fail('reviewRequired', 'owner review mandatory');
  return Object.freeze({characterId:target.characterId, fingerprint:objectSha256(value), authorityState:target.authorityState, studentModelId:target.student.modelId, slots:Object.freeze([...value.mutableSlots])});
}
