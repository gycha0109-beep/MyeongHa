import {
  SAJU_DOMAINS,
  type SajuDomain,
} from '../../../packages/contracts/src/index.js';
import {
  OFFICIAL_READER_RUNTIME_IDS_V1,
  type OfficialReaderRuntimeIdV1,
} from './reader-production-rollout-policy-v1.js';

/**
 * A1 — Product eligibility ONLY. Never a Reader Grant, Reading-access proof,
 * content-release approval, payment authority, or public-runtime activation.
 * The rule must come from a Product/Commerce-owned server authority port.
 */
export interface ProductReaderEligibilitySourceV1 {
  readonly productId: string;
  readonly productSpecVersion: string;
  readonly sajuDomain: SajuDomain;
}

interface ProductReaderRuleBaseV1 extends ProductReaderEligibilitySourceV1 {
  readonly ruleVersion: string;
  readonly approvedPolicyRevision: string;
}

export type ProductReaderRuleV1 =
  | Readonly<ProductReaderRuleBaseV1 & {
      readonly kind: 'standard_all_readers';
    }>
  | Readonly<ProductReaderRuleBaseV1 & {
      readonly kind: 'premium_restricted';
      readonly allowedReaderIds: readonly OfficialReaderRuntimeIdV1[];
    }>;

export type ProductReaderRuleLookupV1 =
  | Readonly<{ readonly status: 'approved'; readonly rule: ProductReaderRuleV1 }>
  | Readonly<{
      readonly status: 'withheld';
      readonly reason: 'unclassified' | 'disabled' | 'stale' | 'invalid_policy';
    }>;

export interface ProductReaderEligibilityAuthorityPortV1 {
  readApprovedRule(input: Readonly<ProductReaderEligibilitySourceV1 & {
    readonly effectiveAt: string;
  }>): Promise<ProductReaderRuleLookupV1>;
}

export type ProductReaderEligibilityWithheldReasonV1 =
  | 'unknown_reader'
  | 'invalid_source'
  | 'unclassified'
  | 'disabled'
  | 'stale'
  | 'invalid_policy'
  | 'policy_source_mismatch'
  | 'reader_excluded'
  | 'policy_unavailable';

export type ProductReaderEligibilityDecisionV1 =
  | Readonly<{
      readonly status: 'eligible';
      readonly readerCharacterId: OfficialReaderRuntimeIdV1;
      readonly productId: string;
      readonly ruleVersion: string;
      readonly approvedPolicyRevision: string;
    }>
  | Readonly<{
      readonly status: 'withheld';
      readonly reason: ProductReaderEligibilityWithheldReasonV1;
    }>;

const officialReaderIds = new Set<string>(OFFICIAL_READER_RUNTIME_IDS_V1);
const knownDomains = new Set<string>(SAJU_DOMAINS);
const withheldReasons = new Set<string>([
  'unclassified', 'disabled', 'stale', 'invalid_policy',
]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bounded(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length >= 1 && value.length <= 256 && value.trim() === value;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length &&
    actual.every((key) => keys.includes(key));
}

function validSource(value: unknown): value is ProductReaderEligibilitySourceV1 {
  return record(value) &&
    exactKeys(value, ['productId', 'productSpecVersion', 'sajuDomain']) &&
    bounded(value.productId) && bounded(value.productSpecVersion) &&
    typeof value.sajuDomain === 'string' && knownDomains.has(value.sajuDomain);
}

function validRule(value: unknown): value is ProductReaderRuleV1 {
  if (!record(value)) return false;
  const base = [
    'kind', 'productId', 'productSpecVersion',
    'sajuDomain', 'ruleVersion', 'approvedPolicyRevision',
  ];
  if (!bounded(value.productId) || !bounded(value.productSpecVersion) ||
      !bounded(value.ruleVersion) || !bounded(value.approvedPolicyRevision) ||
      typeof value.sajuDomain !== 'string' || !knownDomains.has(value.sajuDomain)) {
    return false;
  }
  if (value.kind === 'standard_all_readers') return exactKeys(value, base);
  if (value.kind !== 'premium_restricted' ||
      !exactKeys(value, [...base, 'allowedReaderIds']) ||
      !Array.isArray(value.allowedReaderIds) ||
      value.allowedReaderIds.length < 1 ||
      value.allowedReaderIds.length > OFFICIAL_READER_RUNTIME_IDS_V1.length) {
    return false;
  }
  const ids: readonly unknown[] = value.allowedReaderIds;
  return ids.every((id) => typeof id === 'string' && officialReaderIds.has(id)) &&
    new Set(ids).size === ids.length;
}

function withheld(reason: ProductReaderEligibilityWithheldReasonV1):
  ProductReaderEligibilityDecisionV1 {
  return Object.freeze({ status: 'withheld', reason });
}

/**
 * Pure policy judgment. Even an 'eligible' result is NOT an authorization ticket:
 * Subject×Reading×Reader Grant, exact artifact, pinned content and rollout still
 * require independent checks at the server-only admission seam (future A2).
 */
export function assessProductReaderEligibilityV1(input: Readonly<{
  readonly source: unknown;
  readonly serverReaderId: unknown;
  readonly lookup: unknown;
}>): ProductReaderEligibilityDecisionV1 {
  if (typeof input.serverReaderId !== 'string' ||
      !officialReaderIds.has(input.serverReaderId)) {
    return withheld('unknown_reader');
  }
  if (!validSource(input.source)) return withheld('invalid_source');
  if (!record(input.lookup)) return withheld('invalid_policy');

  if (input.lookup.status === 'withheld') {
    return exactKeys(input.lookup, ['status', 'reason']) &&
      typeof input.lookup.reason === 'string' &&
      withheldReasons.has(input.lookup.reason)
      ? withheld(input.lookup.reason as ProductReaderEligibilityWithheldReasonV1)
      : withheld('invalid_policy');
  }
  if (input.lookup.status !== 'approved' ||
      !exactKeys(input.lookup, ['status', 'rule']) ||
      !validRule(input.lookup.rule)) {
    return withheld('invalid_policy');
  }

  const rule = input.lookup.rule;
  if (rule.productId !== input.source.productId ||
      rule.productSpecVersion !== input.source.productSpecVersion ||
      rule.sajuDomain !== input.source.sajuDomain) {
    return withheld('policy_source_mismatch');
  }
  if (rule.kind === 'premium_restricted' &&
      !rule.allowedReaderIds.includes(
        input.serverReaderId as OfficialReaderRuntimeIdV1,
      )) {
    return withheld('reader_excluded');
  }
  return Object.freeze({
    status: 'eligible',
    readerCharacterId: input.serverReaderId as OfficialReaderRuntimeIdV1,
    productId: rule.productId,
    ruleVersion: rule.ruleVersion,
    approvedPolicyRevision: rule.approvedPolicyRevision,
  });
}

/**
 * Fail closed if an approved Product policy source is unavailable or malformed.
 * No hardcoded approved SKU, implicit standard classification or Production
 * resolver is created here. This dormant A1 seam must not mint Reader access.
 */
export async function resolveProductReaderEligibilityV1(input: Readonly<{
  readonly source: unknown;
  readonly serverReaderId: unknown;
  readonly effectiveAt: unknown;
  readonly authorityPort: ProductReaderEligibilityAuthorityPortV1;
}>): Promise<ProductReaderEligibilityDecisionV1> {
  if (typeof input.serverReaderId !== 'string' ||
      !officialReaderIds.has(input.serverReaderId)) {
    return withheld('unknown_reader');
  }
  if (!validSource(input.source) || !bounded(input.effectiveAt) ||
      !Number.isFinite(Date.parse(input.effectiveAt))) {
    return withheld('invalid_source');
  }

  try {
    const lookup = await input.authorityPort.readApprovedRule(Object.freeze({
      ...input.source,
      effectiveAt: input.effectiveAt,
    }));
    return assessProductReaderEligibilityV1({
      source: input.source, serverReaderId: input.serverReaderId, lookup,
    });
  } catch {
    return withheld('policy_unavailable');
  }
}
