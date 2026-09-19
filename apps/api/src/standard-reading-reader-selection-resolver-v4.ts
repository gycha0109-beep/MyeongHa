import type {
  StandardReadingReaderSelectionPortV4,
  StandardReadingReaderSelectionResolutionV4,
} from './standard-reading-purchase-intent-create-command-v4.js';

type Awaitable<T> = T | Promise<T>;

export interface StandardReadingReaderCatalogResolutionV4 {
  readonly productId: string;
  readonly topicKey: string;
  readonly specVersion: string;
  readonly readerSelectionMode: string;
  readonly purchaseUnitMode: string;
  readonly readerCharacterId: string;
  readonly readerContentBundleId: string;
  readonly catalogAvailability: string;
  readonly catalogEnabled: boolean;
}

export interface StandardReadingReaderCatalogPortV4 {
  /**
   * Resolve the current server-owned Product spec + Reader catalog binding.
   * The implementation owns release/bundle/timing authority; client bundle hints
   * must never be promoted into this result.
   */
  resolveReaderCatalog(input: {
    readonly productId: string;
    readonly readerCharacterId: string;
  }): Awaitable<StandardReadingReaderCatalogResolutionV4 | null>;
}

export interface StandardReadingCharacterUnlockProjectionV4 {
  readonly status: 'locked' | 'unlocked';
}

export interface StandardReadingCharacterUnlockProjectionPortV4 {
  /**
   * Read only the already-stored current Character Unlock projection.
   * This port does not evaluate, create, or mutate unlock conditions/events.
   */
  resolveCharacterUnlock(input: {
    readonly subjectId: string;
    readonly readerCharacterId: string;
  }): Awaitable<StandardReadingCharacterUnlockProjectionV4 | null>;
}

function requireTrustedString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Standard Reading Reader eligibility ${name} is invalid.`);
  }
  return value;
}

function validateCatalogIdentity(
  row: StandardReadingReaderCatalogResolutionV4,
  productId: string,
  readerCharacterId: string,
): void {
  if (row.productId !== productId) {
    throw new Error('Standard Reading Reader catalog resolver returned a different Product id.');
  }
  if (row.readerCharacterId !== readerCharacterId) {
    throw new Error('Standard Reading Reader catalog resolver returned a different Character id.');
  }
  requireTrustedString('topic key', row.topicKey);
  requireTrustedString('Product spec version', row.specVersion);
  requireTrustedString('Reader content bundle id', row.readerContentBundleId);
  if (row.readerSelectionMode !== 'required' || row.purchaseUnitMode !== 'topic_reader_reading') {
    throw new Error('Standard Reading Reader catalog resolver returned an incompatible Product contract.');
  }
}

function toSelection(
  row: StandardReadingReaderCatalogResolutionV4,
): StandardReadingReaderSelectionResolutionV4 {
  return Object.freeze({
    productId: row.productId,
    topicKey: row.topicKey,
    specVersion: row.specVersion,
    readerCharacterId: row.readerCharacterId,
    readerContentBundleId: row.readerContentBundleId,
  });
}

export function createStandardReadingReaderSelectionResolverV4(input: {
  readonly catalogPort: StandardReadingReaderCatalogPortV4;
  readonly unlockProjectionPort: StandardReadingCharacterUnlockProjectionPortV4;
}): StandardReadingReaderSelectionPortV4 {
  return Object.freeze({
    async resolveEligibleReaderSelection(request: Parameters<StandardReadingReaderSelectionPortV4['resolveEligibleReaderSelection']>[0]) {
      const row = await input.catalogPort.resolveReaderCatalog({
        productId: request.productId,
        readerCharacterId: request.readerCharacterId,
      });
      if (row === null) return null;

      validateCatalogIdentity(row, request.productId, request.readerCharacterId);
      if (!row.catalogEnabled) return null;

      if (row.catalogAvailability === 'available') {
        return toSelection(row);
      }

      if (row.catalogAvailability !== 'unlockable') {
        return null;
      }

      const unlock = await input.unlockProjectionPort.resolveCharacterUnlock({
        subjectId: request.subjectId,
        readerCharacterId: request.readerCharacterId,
      });
      if (unlock?.status !== 'unlocked') return null;

      return toSelection(row);
    },
  });
}
