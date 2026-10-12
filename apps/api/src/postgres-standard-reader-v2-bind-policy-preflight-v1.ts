import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import {
  assessProductReaderEligibilityV1,
  type ProductReaderRuleLookupV1,
} from './product-reader-eligibility-policy-v1.js';
import type { StandardReadingReaderSelectionResolutionV4 } from './standard-reading-purchase-intent-create-command-v4.js';
import {
  createPostgresStandardReadingReaderSelectionPortV4,
} from './postgres-standard-reading-reader-selection-v4.js';
import {
  createPostgresStandardReaderProductScopeAuthorityPortV1,
} from './postgres-standard-reader-product-scope-v1.js';
import {
  createPostgresApprovedStandardReaderRuleAuthorityPortV1,
} from './postgres-standard-reader-approved-rule-v1.js';
import {
  OFFICIAL_READER_RUNTIME_IDS_V1,
} from './reader-production-rollout-policy-v1.js';

export type StandardReaderV2PolicyPreflightDecisionV1 =
  | Readonly<{
      status: 'standard_candidate';
      productId: string;
      productSpecVersion: string;
      sajuDomain: string;
      readerCharacterId: string;
      readerContentBundleId: string;
      approvedPolicyRevision: string;
      ruleVersion: string;
    }>
  | Readonly<{
      status: 'withheld';
      reason: 'invalid_input' | 'catalog_unavailable' | 'scope_unavailable' |
        'policy_unavailable' | 'premium_hold';
    }>;

export type StandardReaderV2PolicyPreflightRequestV1 = Readonly<{
  resolvedSubjectId: string;
  productId: string;
  readerCharacterId: string;
}>;

type ProductScopeV1 = Readonly<{
  productId: string;
  productSpecVersion: string;
  sajuDomain: string;
  effectiveAt: string;
}>;

const readers: ReadonlySet<string> = new Set(OFFICIAL_READER_RUNTIME_IDS_V1);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const withheld = (reason: Extract<
  StandardReaderV2PolicyPreflightDecisionV1,
  { readonly status: 'withheld' }
>['reason']): StandardReaderV2PolicyPreflightDecisionV1 =>
  Object.freeze({ status: 'withheld', reason });

/**
 * Deliberately NON-AUTHORIZING v2 bind policy classification.
 *
 * A standard Product rule allows an officially registered Reader to explain
 * ordinary Standard Saju regardless of its separate specialist can_initiate
 * flag. No specialist Capability object is read, written or synthesized.
 *
 * Premium is ALWAYS withheld pending separately approved Product/DB/Reader
 * binder semantics, including when targetReaderId exactly matches this Reader.
 *
 * This does not verify Purchase Intent, verified receipt, exact live Grant,
 * new Reading locks, current Birth/Source, or T2/reveal authority.
 */
export function assessStandardReaderV2BinderPolicyCandidateV1(input: Readonly<{
  request: StandardReaderV2PolicyPreflightRequestV1;
  selected: StandardReadingReaderSelectionResolutionV4 | null;
  scope: ProductScopeV1 | null;
  lookup: ProductReaderRuleLookupV1;
}>): StandardReaderV2PolicyPreflightDecisionV1 {
  const { request, selected, scope, lookup } = input;
  if (!UUID.test(request.resolvedSubjectId) || !UUID.test(request.productId) ||
      !readers.has(request.readerCharacterId)) return withheld('invalid_input');

  if (!selected ||
      selected.productId !== request.productId ||
      selected.readerCharacterId !== request.readerCharacterId ||
      !UUID.test(selected.readerContentBundleId) ||
      typeof selected.specVersion !== 'string' ||
      selected.specVersion.length === 0) return withheld('catalog_unavailable');

  if (!scope ||
      scope.productId !== selected.productId ||
      scope.productSpecVersion !== selected.specVersion) return withheld('scope_unavailable');

  const source = {
    productId: scope.productId,
    productSpecVersion: scope.productSpecVersion,
    sajuDomain: scope.sajuDomain,
  };
  const judgment = assessProductReaderEligibilityV1({
    source, serverReaderId: selected.readerCharacterId, lookup,
  });
  if (judgment.status !== 'eligible') return withheld('policy_unavailable');
  // A Premium Product is attached to one owning Reader, never a list of
  // blocked Readers. Even that match is not permission to bind/reveal Premium.
  if (lookup.status !== 'approved' || lookup.rule.kind !== 'standard_all_readers') {
    return withheld('premium_hold');
  }
  if (judgment.productId !== selected.productId ||
      judgment.readerCharacterId !== selected.readerCharacterId ||
      judgment.approvedPolicyRevision !== lookup.rule.approvedPolicyRevision) {
    return withheld('policy_unavailable');
  }
  return Object.freeze({
    status: 'standard_candidate',
    productId: selected.productId,
    productSpecVersion: selected.specVersion,
    sajuDomain: scope.sajuDomain,
    readerCharacterId: selected.readerCharacterId,
    readerContentBundleId: selected.readerContentBundleId,
    approvedPolicyRevision: lookup.rule.approvedPolicyRevision,
    ruleVersion: lookup.rule.ruleVersion,
  });
}

/**
 * All source reads use the SAME transaction-scoped PostgreSQL client. The
 * result is non-authorizing and MUST be re-evaluated inside a DB-owner
 * scope-locked binder before mutation. Never map it to a paid admission.
 */
export function createPostgresStandardReaderV2PolicyPreflightV1(
  client: PostgresTransactionQueryV1,
) {
  const catalog = createPostgresStandardReadingReaderSelectionPortV4(client);
  const scope = createPostgresStandardReaderProductScopeAuthorityPortV1(client);
  const rule = createPostgresApprovedStandardReaderRuleAuthorityPortV1(client);
  return Object.freeze({
    async assess(request: StandardReaderV2PolicyPreflightRequestV1):
      Promise<StandardReaderV2PolicyPreflightDecisionV1> {
      if (!UUID.test(request.resolvedSubjectId) ||
          !UUID.test(request.productId) ||
          !readers.has(request.readerCharacterId)) return withheld('invalid_input');

      try {
        const selected = await catalog.resolveEligibleReaderSelection({
          subjectId: request.resolvedSubjectId,
          productId: request.productId,
          readerCharacterId: request.readerCharacterId,
        });
        if (selected === null) return withheld('catalog_unavailable');

        const current = await scope.readCurrentScope({
          productId: selected.productId, productSpecVersion: selected.specVersion,
        });
        if (current === null) return withheld('scope_unavailable');

        const lookup = await rule.readApprovedRule({
          productId: current.productId,
          productSpecVersion: current.productSpecVersion,
          sajuDomain: current.sajuDomain,
          effectiveAt: current.effectiveAt,
        });
        return assessStandardReaderV2BinderPolicyCandidateV1({
          request, selected, scope: current, lookup,
        });
      } catch {
        return withheld('policy_unavailable');
      }
    },
  });
}
