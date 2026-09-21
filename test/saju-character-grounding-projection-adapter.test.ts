import { describe, expect, it, vi } from 'vitest';
import {
  SajuCharacterGroundingProjectionAdapterErrorV1,
  createSajuCharacterGroundingProjectionAdapterV1,
  type SajuCharacterGroundingBuilderInputV1,
} from '../apps/api/src/saju-character-grounding-projection-adapter.js';

const input = Object.freeze({
  readingId: 'official-reading-1',
  readingContractVersion: 'myeonghwa-product-reading-response-v2',
  productResponseState: 'delivered',
  responseSnapshotJsonb: Object.freeze({
    responseVersion: 'myeonghwa-product-reading-response-v2',
    state: 'delivered',
    reading: Object.freeze({ readingId: 'official-reading-1' }),
  }),
  officialArtifactResponseHash: 'sha256:opaque-db-artifact-hash',
  sajuEngineVersion: 'saju-engine-v1',
  sajuDomain: 'general' as const,
});

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    readingRef: input.readingId,
    productResponseVersion: input.readingContractVersion,
    engineVersion: input.sajuEngineVersion,
    readingDomain: input.sajuDomain,
    sourceResponseHash: 'a'.repeat(64),
    groundingHash: 'b'.repeat(64),
    ...overrides,
  };
}

describe('Saju Character Grounding Projection Adapter v1', () => {
  it('passes the exact Official snapshot to the Saju-owned builder without treating the DB artifact hash as semantic input', () => {
    const buildCharacterGroundingBundleV1 = vi.fn(
      (_builderInput: SajuCharacterGroundingBuilderInputV1) => candidate(),
    );
    const adapter = createSajuCharacterGroundingProjectionAdapterV1({
      buildCharacterGroundingBundleV1,
    });

    const result = adapter.projectGrounding(input);

    expect(result).toEqual(candidate());
    expect(buildCharacterGroundingBundleV1).toHaveBeenCalledWith({
      response: input.responseSnapshotJsonb,
      engineVersion: input.sajuEngineVersion,
      readingDomain: input.sajuDomain,
    });
    expect(buildCharacterGroundingBundleV1.mock.calls[0]?.[0]).not.toHaveProperty(
      'officialArtifactResponseHash',
    );
  });

  it('accepts a Saju semantic source hash that differs from the opaque committed artifact hash', async () => {
    const adapter = createSajuCharacterGroundingProjectionAdapterV1({
      buildCharacterGroundingBundleV1: () => candidate(),
    });

    const result = (await adapter.projectGrounding(input)) as {
      readonly sourceResponseHash: string;
    };
    expect(result.sourceResponseHash).toBe('a'.repeat(64));
    expect(result.sourceResponseHash).not.toBe(input.officialArtifactResponseHash);
  });

  it.each([
    ['readingRef', 'other-reading'],
    ['productResponseVersion', 'myeonghwa-product-reading-response-v999'],
    ['engineVersion', 'other-engine'],
    ['readingDomain', 'wealth'],
  ])('fails closed when Saju projection drifts %s', (field, value) => {
    const adapter = createSajuCharacterGroundingProjectionAdapterV1({
      buildCharacterGroundingBundleV1: () => candidate({ [field]: value }),
    });

    expect(() => adapter.projectGrounding(input)).toThrow(
      SajuCharacterGroundingProjectionAdapterErrorV1,
    );
  });
});
