import {
  resolveProductReaderEligibilityV1,
  type ProductReaderEligibilityAuthorityPortV1,
  type ProductReaderEligibilitySourceV1,
} from './product-reader-eligibility-policy-v1.js';
import type {
  StandardReadingReaderSelectionPortV4,
  StandardReadingReaderSelectionResolutionV4,
} from './standard-reading-purchase-intent-create-command-v4.js';

/**
 * Server-side, Product-owned source. It MUST come from the exact approved
 * Product policy/catalog revision and authoritative DB time, never client hints.
 * It is not an Offer, saleability, payment or specialist capability decision.
 */
export interface StandardReaderProductScopeV1
extends ProductReaderEligibilitySourceV1 {
  readonly effectiveAt: string;
}

export interface StandardReaderProductScopeAuthorityPortV1 {
  readCurrentScope(input: Readonly<{
    productId: string;
    productSpecVersion: string;
  }>): Promise<StandardReaderProductScopeV1 | null>;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bounded(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 &&
    value.length <= 256 && value.trim() === value;
}

function exactSelected(
  value: unknown,
  productId: string,
  readerCharacterId: string,
): value is StandardReadingReaderSelectionResolutionV4 {
  return record(value) &&
    value.productId === productId &&
    value.readerCharacterId === readerCharacterId &&
    bounded(value.topicKey) && bounded(value.specVersion) &&
    bounded(value.readerContentBundleId);
}

/**
 * Future D-01 pre-purchase adapter. Wraps existing catalog + unlock checks
 * and adds exact approved versioned Product Reader eligibility. Only a fully
 * approved Product authority can return a candidate; no synthetic rule defaults.
 *
 * This port is presently NOT installed into Production purchase binding;
 * migration 1220 still separately enforces specialist can_initiate. Successful
 * selection is never authorization to bind, buy, grant, render or reveal.
 */
export function createPolicyGuardedStandardReaderSelectionPortV1(input: Readonly<{
  readonly catalogAndUnlockPort: StandardReadingReaderSelectionPortV4;
  readonly productScopePort: StandardReaderProductScopeAuthorityPortV1;
  readonly approvedRulePort: ProductReaderEligibilityAuthorityPortV1;
}>): StandardReadingReaderSelectionPortV4 {
  return Object.freeze({
    async resolveEligibleReaderSelection(request) {
      try {
        const selected =
          await input.catalogAndUnlockPort.resolveEligibleReaderSelection(request);
        if (selected === null ||
            !exactSelected(selected, request.productId, request.readerCharacterId)) {
          return null;
        }
        const current = await input.productScopePort.readCurrentScope({
          productId: selected.productId,
          productSpecVersion: selected.specVersion,
        });
        if (!record(current) ||
            current.productId !== selected.productId ||
            current.productSpecVersion !== selected.specVersion) {
          return null;
        }
        const source = {
          productId: current.productId,
          productSpecVersion: current.productSpecVersion,
          sajuDomain: current.sajuDomain,
        };
        const judgment = await resolveProductReaderEligibilityV1({
          source,
          serverReaderId: selected.readerCharacterId,
          effectiveAt: current.effectiveAt,
          authorityPort: input.approvedRulePort,
        });
        if (judgment.status !== 'eligible' ||
            judgment.productId !== selected.productId ||
            judgment.readerCharacterId !== selected.readerCharacterId) {
          return null;
        }
        return Object.freeze({
          productId: selected.productId,
          topicKey: selected.topicKey,
          specVersion: selected.specVersion,
          readerCharacterId: selected.readerCharacterId,
          readerContentBundleId: selected.readerContentBundleId,
        });
      } catch {
        // Underlying policy, catalog, unlock or database outage: fail closed.
        return null;
      }
    },
  });
}
