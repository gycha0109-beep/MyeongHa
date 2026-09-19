import { describe, expect, it } from 'vitest';
import {
  createStandardReadingReaderSelectionResolverV4,
  type StandardReadingCharacterUnlockProjectionPortV4,
  type StandardReadingReaderCatalogPortV4,
  type StandardReadingReaderCatalogResolutionV4,
} from '../apps/api/src/standard-reading-reader-selection-resolver-v4.js';

const SUBJECT_ID = 'd1074100-0000-0000-0000-000000000001';
const PRODUCT_ID = '11300000-0000-0000-0000-000000000001';
const READER_ID = 'baekheon';
const BUNDLE_ID = 'd1074100-0000-0000-0000-000000000002';

const CATALOG: StandardReadingReaderCatalogResolutionV4 = Object.freeze({
  productId: PRODUCT_ID,
  topicKey: 'love_relationship',
  specVersion: 'v1',
  readerSelectionMode: 'required',
  purchaseUnitMode: 'topic_reader_reading',
  readerCharacterId: READER_ID,
  readerContentBundleId: BUNDLE_ID,
  catalogAvailability: 'available',
  catalogEnabled: true,
});

class FakeCatalogPort implements StandardReadingReaderCatalogPortV4 {
  readonly calls: Array<{ productId: string; readerCharacterId: string }> = [];
  result: StandardReadingReaderCatalogResolutionV4 | null = CATALOG;
  resolveReaderCatalog(input: { readonly productId: string; readonly readerCharacterId: string }) {
    this.calls.push(input);
    return this.result;
  }
}

class FakeUnlockPort implements StandardReadingCharacterUnlockProjectionPortV4 {
  readonly calls: Array<{ subjectId: string; readerCharacterId: string }> = [];
  result: { readonly status: 'locked' | 'unlocked' } | null = null;
  resolveCharacterUnlock(input: { readonly subjectId: string; readonly readerCharacterId: string }) {
    this.calls.push(input);
    return this.result;
  }
}

function createResolver() {
  const catalogPort = new FakeCatalogPort();
  const unlockProjectionPort = new FakeUnlockPort();
  const resolver = createStandardReadingReaderSelectionResolverV4({
    catalogPort,
    unlockProjectionPort,
  });
  return { catalogPort, unlockProjectionPort, resolver };
}

describe('Standard Reading Reader user-specific eligibility resolver v4', () => {
  it('accepts a server-owned globally available Reader without inventing an unlock lookup', async () => {
    const ports = createResolver();
    await expect(
      ports.resolver.resolveEligibleReaderSelection({
        subjectId: SUBJECT_ID,
        productId: PRODUCT_ID,
        readerCharacterId: READER_ID,
      }),
    ).resolves.toEqual({
      productId: PRODUCT_ID,
      topicKey: 'love_relationship',
      specVersion: 'v1',
      readerCharacterId: READER_ID,
      readerContentBundleId: BUNDLE_ID,
    });
    expect(ports.unlockProjectionPort.calls).toHaveLength(0);
  });

  it('accepts an unlockable Reader only from an already-stored unlocked projection', async () => {
    const ports = createResolver();
    ports.catalogPort.result = { ...CATALOG, catalogAvailability: 'unlockable' };
    ports.unlockProjectionPort.result = { status: 'unlocked' };

    await expect(
      ports.resolver.resolveEligibleReaderSelection({
        subjectId: SUBJECT_ID,
        productId: PRODUCT_ID,
        readerCharacterId: READER_ID,
      }),
    ).resolves.toMatchObject({ readerCharacterId: READER_ID, readerContentBundleId: BUNDLE_ID });
    expect(ports.unlockProjectionPort.calls).toEqual([{
      subjectId: SUBJECT_ID,
      readerCharacterId: READER_ID,
    }]);
  });

  it('fails closed for unlockable Reader when stored unlock state is absent or locked', async () => {
    for (const state of [null, { status: 'locked' as const }]) {
      const ports = createResolver();
      ports.catalogPort.result = { ...CATALOG, catalogAvailability: 'unlockable' };
      ports.unlockProjectionPort.result = state;
      await expect(
        ports.resolver.resolveEligibleReaderSelection({
          subjectId: SUBJECT_ID,
          productId: PRODUCT_ID,
          readerCharacterId: READER_ID,
        }),
      ).resolves.toBeNull();
    }
  });

  it('fails closed for disabled, locked, coming-soon, or unknown catalog states without consulting unlock mutation semantics', async () => {
    for (const mutation of [
      { catalogEnabled: false, catalogAvailability: 'available' },
      { catalogEnabled: true, catalogAvailability: 'locked' },
      { catalogEnabled: true, catalogAvailability: 'coming_soon' },
      { catalogEnabled: true, catalogAvailability: 'unknown_future_state' },
    ]) {
      const ports = createResolver();
      ports.catalogPort.result = { ...CATALOG, ...mutation };
      await expect(
        ports.resolver.resolveEligibleReaderSelection({
          subjectId: SUBJECT_ID,
          productId: PRODUCT_ID,
          readerCharacterId: READER_ID,
        }),
      ).resolves.toBeNull();
      expect(ports.unlockProjectionPort.calls).toHaveLength(0);
    }
  });

  it('rejects trusted Product/Reader identity or Product contract drift', async () => {
    for (const mutation of [
      { productId: 'd1074100-0000-0000-0000-000000000099' },
      { readerCharacterId: 'rahyeon' },
      { topicKey: '' },
      { specVersion: '' },
      { readerContentBundleId: '' },
      { readerSelectionMode: 'none' },
      { purchaseUnitMode: 'account_access' },
    ]) {
      const ports = createResolver();
      ports.catalogPort.result = { ...CATALOG, ...mutation };
      await expect(
        ports.resolver.resolveEligibleReaderSelection({
          subjectId: SUBJECT_ID,
          productId: PRODUCT_ID,
          readerCharacterId: READER_ID,
        }),
      ).rejects.toThrow(/Standard Reading Reader/);
      expect(ports.unlockProjectionPort.calls).toHaveLength(0);
    }
  });

  it('does not contain a Character unlock evaluator or mutation path', () => {
    const source = createStandardReadingReaderSelectionResolverV4.toString();
    expect(source).not.toContain('worldEvent');
    expect(source).not.toContain('unlockCondition');
    expect(source).not.toContain('createUnlock');
    expect(source).not.toContain('updateUnlock');
  });
});
