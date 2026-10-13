import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import {
  type ProductReaderEligibilityAuthorityPortV1,
  type ProductReaderEligibilitySourceV1,
  type ProductReaderRuleLookupV1,
} from './product-reader-eligibility-policy-v1.js';
import { SAJU_DOMAINS } from '../../../packages/contracts/src/index.js';
import {
  OFFICIAL_READER_RUNTIME_IDS_V1,
  type OfficialReaderRuntimeIdV1,
} from './reader-production-rollout-policy-v1.js';
import type { StandardReadingReaderSelectionPortV4 } from './standard-reading-purchase-intent-create-command-v4.js';
import { createPostgresPolicyGuardedStandardReaderSelectionPortV1 } from './postgres-standard-reader-product-scope-v1.js';

export const POSTGRES_APPROVED_STANDARD_READER_RULE_V1 =
  'public.qry_standard_reader_approved_rule_v1' as const;

const RULE_SQL = [
  'select product_id::text as "productId",',
  '       product_spec_version as "productSpecVersion",',
  '       saju_domain as "sajuDomain",',
  '       rule_version as "ruleVersion",',
  '       approved_policy_revision as "approvedPolicyRevision",',
  '       policy_kind as "kind",',
  '       allowed_reader_ids as "allowedReaderIds"',
  'from public.qry_standard_reader_approved_rule_v1($1::uuid,$2::text,$3::text,$4::timestamptz)',
].join('\n');

const domains: ReadonlySet<string> = new Set(SAJU_DOMAINS);
const officialReaders: ReadonlySet<string> = new Set(OFFICIAL_READER_RUNTIME_IDS_V1);

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 &&
    value.length <= 256 && value.trim() === value;
}

function dbUtc(value: unknown): value is string {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

const unavailable = (reason: 'invalid_policy' | 'unclassified'):
  ProductReaderRuleLookupV1 => Object.freeze({ status: 'withheld', reason });

/**
 * D-01 Product-authority candidate: read-only, non-public.
 * Requires the same transaction-scoped DB client as Catalog/Unlock/Product.
 * Approval rows must be installed by separately governed Product/DB changes.
 * No fallback rule, live purchase, Grant, or specialist capability override.
 */
export function createPostgresApprovedStandardReaderRuleAuthorityPortV1(
  client: PostgresTransactionQueryV1,
): ProductReaderEligibilityAuthorityPortV1 {
  return Object.freeze({
    async readApprovedRule(source: Readonly<ProductReaderEligibilitySourceV1 & { effectiveAt: string }>) {
      if (!text(source.productId) || !text(source.productSpecVersion) ||
          typeof source.sajuDomain !== 'string' || !domains.has(source.sajuDomain) ||
          !dbUtc(source.effectiveAt)) return unavailable('invalid_policy');

      const result = await client.query<Record<string, unknown>>(RULE_SQL, [
        source.productId, source.productSpecVersion, source.sajuDomain,
        source.effectiveAt,
      ]);
      if (result.rows.length === 0) return unavailable('unclassified');
      if (result.rows.length !== 1) return unavailable('invalid_policy');
      const row = result.rows[0];
      if (!row ||
          row.productId !== source.productId ||
          row.productSpecVersion !== source.productSpecVersion ||
          row.sajuDomain !== source.sajuDomain ||
          !text(row.ruleVersion) || !text(row.approvedPolicyRevision)) {
        return unavailable('invalid_policy');
      }
      const common = {
        productId: source.productId,
        productSpecVersion: source.productSpecVersion,
        sajuDomain: source.sajuDomain,
        ruleVersion: row.ruleVersion,
        approvedPolicyRevision: row.approvedPolicyRevision,
      };
      if (row.kind === 'standard_all_readers' && row.allowedReaderIds === null) {
        return Object.freeze({
          status: 'approved',
          rule: Object.freeze({ kind: 'standard_all_readers', ...common }),
        });
      }
      if (row.kind === 'premium_restricted' && Array.isArray(row.allowedReaderIds)) {
        const readerIds: readonly unknown[] = row.allowedReaderIds;
        if (readerIds.length === 0 ||
            readerIds.length > OFFICIAL_READER_RUNTIME_IDS_V1.length ||
            !readerIds.every((id) => typeof id === 'string' && officialReaders.has(id)) ||
            new Set(readerIds).size !== readerIds.length) {
          return unavailable('invalid_policy');
        }
        return Object.freeze({
          status: 'approved',
          rule: Object.freeze({
            kind: 'premium_restricted',
            ...common,
            allowedReaderIds: Object.freeze([...readerIds]) as readonly OfficialReaderRuntimeIdV1[],
          }),
        });
      }
      return unavailable('invalid_policy');
    },
  });
}

/**
 * Dormant exact-DB composition: Catalog/Unlock, Product scope and Product
 * approval rule use ONE transaction-scoped PostgreSQL client. Unlike the
 * generic test seam, no synthetic/external approval port can be supplied here.
 * This remains selection-only: no binder, Grant, checkout, or public route.
 */
export function createPostgresDbApprovedStandardReaderSelectionPortV1(
  client: PostgresTransactionQueryV1,
): StandardReadingReaderSelectionPortV4 {
  return createPostgresPolicyGuardedStandardReaderSelectionPortV1(
    client,
    createPostgresApprovedStandardReaderRuleAuthorityPortV1(client),
  );
}
