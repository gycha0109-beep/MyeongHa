import { SAJU_DOMAINS, type SajuDomain } from '../../../packages/contracts/src/index.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import type { ProductReaderEligibilityAuthorityPortV1 } from './product-reader-eligibility-policy-v1.js';
import type { StandardReadingReaderSelectionPortV4 } from './standard-reading-purchase-intent-create-command-v4.js';
import {
  createPolicyGuardedStandardReaderSelectionPortV1,
  type StandardReaderProductScopeAuthorityPortV1,
  type StandardReaderProductScopeV1,
} from './standard-reading-reader-product-policy-gate-v1.js';
import { createPostgresStandardReadingReaderSelectionPortV4 } from './postgres-standard-reading-reader-selection-v4.js';

export const POSTGRES_STANDARD_READER_PRODUCT_SCOPE_BINDING_V1 =
  'public.qry_standard_reading_product_scope_v1' as const;

type ScopeRowV1 = Readonly<{
  productId: unknown;
  productSpecVersion: unknown;
  sajuDomain: unknown;
  effectiveAt: unknown;
}>;

const READ_SCOPE_SQL = `
select product_id::text as "productId",
       product_spec_version as "productSpecVersion",
       saju_domain as "sajuDomain",
       effective_at as "effectiveAt"
from public.qry_standard_reading_product_scope_v1($1::uuid,$2::text)
`.trim();
const domains = new Set<string>(SAJU_DOMAINS);

function checkText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 &&
    value.length <= 256 && value.trim() === value;
}

function requireScope(
  rows: readonly ScopeRowV1[],
  productId: string,
  version: string,
): StandardReaderProductScopeV1 | null {
  if (rows.length === 0) return null;
  const row = rows[0];
  if (rows.length !== 1 || !row ||
      row.productId !== productId ||
      row.productSpecVersion !== version ||
      !checkText(row.productId) ||
      !checkText(row.productSpecVersion) ||
      typeof row.sajuDomain !== 'string' || !domains.has(row.sajuDomain) ||
      typeof row.effectiveAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(row.effectiveAt) ||
      !Number.isFinite(Date.parse(row.effectiveAt)) ||
      new Date(row.effectiveAt).toISOString() !== row.effectiveAt) {
    throw new Error('Standard Reader Product PostgreSQL scope is inconsistent.');
  }
  return Object.freeze({
    productId: row.productId,
    productSpecVersion: row.productSpecVersion,
    sajuDomain: row.sajuDomain as SajuDomain,
    effectiveAt: row.effectiveAt,
  });
}

/**
 * Dormant server-only Product identity/domain scope read. It does not approve
 * Standard Reader access or change DB can_initiate, and it MUST execute on
 * the same authenticated PostgreSQL client as the Catalog/Unlock resolver.
 */
export function createPostgresStandardReaderProductScopeAuthorityPortV1(
  client: PostgresTransactionQueryV1,
): StandardReaderProductScopeAuthorityPortV1 {
  return Object.freeze({
    async readCurrentScope({ productId, productSpecVersion }) {
      if (!checkText(productId) || !checkText(productSpecVersion)) return null;
      const result = await client.query<ScopeRowV1>(READ_SCOPE_SQL, [
        productId, productSpecVersion,
      ]);
      return requireScope(result.rows, productId, productSpecVersion);
    },
  });
}

/**
 * Inactive composition: same DB transaction/client for Catalog, Unlock and
 * versioned Product source. Approved rule still comes ONLY from injected
 * Product/Commerce-owned authority; no default approved policy exists.
 */
export function createPostgresPolicyGuardedStandardReaderSelectionPortV1(
  client: PostgresTransactionQueryV1,
  approvedRulePort: ProductReaderEligibilityAuthorityPortV1,
): StandardReadingReaderSelectionPortV4 {
  return createPolicyGuardedStandardReaderSelectionPortV1({
    catalogAndUnlockPort: createPostgresStandardReadingReaderSelectionPortV4(client),
    productScopePort: createPostgresStandardReaderProductScopeAuthorityPortV1(client),
    approvedRulePort,
  });
}
