export const SAJU_DOMAINS_V1 = Object.freeze([
  'general',
  'family',
  'relationship',
  'compatibility',
  'career',
  'business',
  'wealth',
  'life_stage',
  'question_specific',
]);

const SAJU_DOMAIN_SET_V1 = new Set(SAJU_DOMAINS_V1);

export function normalizeSajuDomainV1(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return SAJU_DOMAIN_SET_V1.has(normalized) ? normalized : null;
}
