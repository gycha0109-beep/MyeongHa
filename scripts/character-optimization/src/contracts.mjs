import { createHash } from 'node:crypto';

export const CHARACTER_IDS = Object.freeze([
  'seyeon', 'yeoul', 'seorin', 'rahyeon', 'mira',
  'taegyeom', 'yunho', 'doyun', 'baekheon',
]);
export const IMMUTABLE_KEYS = Object.freeze([
  'canon', 'runtime_behavior', 'relationship', 'memory',
  'saju', 'authority', 'content_version',
]);
export const MUTABLE_SLOTS = Object.freeze(['shared_expression', 'character_expression']);
export const QUALITY_AXES = Object.freeze([
  'korean_naturalness', 'response_relevance', 'agency',
  'persona_fidelity', 'relationship_continuity', 'memory_quality',
  'anti_repetition', 'long_horizon_stability', 'efficiency',
]);
export const HARD_FAILURES = Object.freeze([
  'fabricated_memory', 'cross_subject_privacy', 'canon_or_authority_violation',
  'unauthorized_relationship_change', 'unauthorized_external_call',
  'provider_fallback', 'unknown_integrity',
]);
const SHA256 = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;
const SAFE_REF = /^(?:docs\/character\/[A-Za-z0-9_.-]+\.md|docs\/character-optimization\/[A-Za-z0-9_.-]+\.md|(?:private|synthetic):\/\/[a-zA-Z0-9/_-]+)$/;

export function fail(field, reason) {
  throw new Error(`CHARACTER_OPTIMIZATION_INVALID: ${field}: ${reason}`);
}
export function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(field, 'plain object required');
  return value;
}
export function keys(value, permitted, required, field) {
  object(value, field);
  for (const name of Object.keys(value)) if (!permitted.includes(name)) fail(field, `unexpected field ${name}`);
  for (const name of required) if (!Object.hasOwn(value, name)) fail(field, `missing field ${name}`);
}
export function string(value, field, max = 256) {
  if (typeof value !== 'string' || !value.length || value.length > max || /[\x00-\x1f\x7f]/.test(value)) fail(field, 'invalid string');
}
export function hash(value, field) {
  if (!SHA256.test(value)) fail(field, 'sha256 required');
}
export function reference(value, field) {
  string(value, field);
  if (!SAFE_REF.test(value) || value.includes('..')) fail(field, 'unsafe reference');
}
export function id(value, field) {
  if (typeof value !== 'string' || !ID.test(value)) fail(field, 'invalid identifier');
}
export function positiveInteger(value, field, allowZero = false) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) fail(field, 'positive safe integer required');
}
export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    object(value, 'canonical json');
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  if (!['string', 'number', 'boolean'].includes(typeof value) && value !== null) fail('canonical json', 'invalid scalar');
  if (typeof value === 'number' && !Number.isFinite(value)) fail('canonical json', 'non-finite number');
  return JSON.stringify(value);
}
export function objectSha256(value) { return sha256(canonicalJson(value)); }
