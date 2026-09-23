export type SajuDomainV1 =
  | 'general'
  | 'family'
  | 'relationship'
  | 'compatibility'
  | 'career'
  | 'business'
  | 'wealth'
  | 'life_stage'
  | 'question_specific';

export const SAJU_DOMAINS_V1: readonly SajuDomainV1[];

export function normalizeSajuDomainV1(value: unknown): SajuDomainV1 | null;
