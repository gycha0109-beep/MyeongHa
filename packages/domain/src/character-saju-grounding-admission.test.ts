import { describe, expect, it } from 'vitest';

import type { CharacterRuntimeContextV1 } from './character-runtime-context.js';
import {
  SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
  SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
  admitCharacterRuntimeSajuGroundingV1,
  admitCharacterSajuGroundingRefV1,
} from './character-saju-grounding-admission.js';

const SOURCE_RESPONSE_HASH = 'a'.repeat(64);
const GROUNDING_HASH = 'b'.repeat(64);

function makeRuntimeContext(input?: {
  readonly readingRef?: string;
  readonly domain?: 'general' | 'career';
  readonly withoutSaju?: boolean;
}): CharacterRuntimeContextV1 {
  if (input?.withoutSaju === true) {
    return { saju: null } as unknown as CharacterRuntimeContextV1;
  }
  return {
    saju: {
      readingRef: input?.readingRef ?? 'reading-001',
      domain: input?.domain ?? 'general',
      coverageState: 'complete',
      protectedSegments: [],
      disclosures: [],
      ambiguity: [],
      capability: {},
    },
  } as unknown as CharacterRuntimeContextV1;
}

function makeGroundingRef(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
    groundingProjectionVersion: SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
    axisRegistryVersion: SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
    readingRef: 'reading-001',
    productResponseVersion: 'product-reading-response-v1',
    engineVersion: 'saju-engine-test-v1',
    readingDomain: 'general',
    sourceResponseHash: SOURCE_RESPONSE_HASH,
    groundingHash: GROUNDING_HASH,
    ...overrides,
  };
}

describe('Character Saju grounding admission v1', () => {
  it('preserves the legacy protected-block path when no grounding ref is supplied', () => {
    const context = makeRuntimeContext();
    const admitted = admitCharacterRuntimeSajuGroundingV1({ context });

    expect(admitted.saju).not.toBeNull();
    expect(admitted.saju?.readingRef).toBe('reading-001');
    expect(admitted.saju?.groundingRef).toBeNull();
  });

  it('admits the exact Saju-owned grounding identity without semantic units', () => {
    const context = makeRuntimeContext();
    const admitted = admitCharacterRuntimeSajuGroundingV1({
      context,
      groundingRef: makeGroundingRef(),
    });

    expect(admitted.saju?.groundingRef).toEqual(makeGroundingRef());
    expect(Object.isFrozen(admitted.saju?.groundingRef)).toBe(true);
  });

  it('rejects a grounding ref for another reading', () => {
    expect(() =>
      admitCharacterRuntimeSajuGroundingV1({
        context: makeRuntimeContext(),
        groundingRef: makeGroundingRef({ readingRef: 'reading-other' }),
      }),
    ).toThrow('readingRef does not match');
  });

  it('rejects a grounding ref for another Saju domain', () => {
    expect(() =>
      admitCharacterRuntimeSajuGroundingV1({
        context: makeRuntimeContext(),
        groundingRef: makeGroundingRef({ readingDomain: 'career' }),
      }),
    ).toThrow('readingDomain does not match');
  });

  it('rejects unsupported source contract versions', () => {
    expect(() =>
      admitCharacterSajuGroundingRefV1({
        candidate: makeGroundingRef({ schemaVersion: 'myeonghwa-character-grounding-v2' }),
        expectedReadingRef: 'reading-001',
        expectedDomain: 'general',
      }),
    ).toThrow('schemaVersion is not supported');

    expect(() =>
      admitCharacterSajuGroundingRefV1({
        candidate: makeGroundingRef({
          groundingProjectionVersion: 'myeonghwa-character-grounding-projection-v2',
        }),
        expectedReadingRef: 'reading-001',
        expectedDomain: 'general',
      }),
    ).toThrow('projection version is not supported');

    expect(() =>
      admitCharacterSajuGroundingRefV1({
        candidate: makeGroundingRef({ axisRegistryVersion: 'myeonghwa-grounding-axis-v2' }),
        expectedReadingRef: 'reading-001',
        expectedDomain: 'general',
      }),
    ).toThrow('axis registry version is not supported');
  });

  it('rejects malformed content hashes', () => {
    expect(() =>
      admitCharacterSajuGroundingRefV1({
        candidate: makeGroundingRef({ groundingHash: 'not-a-sha256' }),
        expectedReadingRef: 'reading-001',
        expectedDomain: 'general',
      }),
    ).toThrow('groundingHash must be a lower-case SHA-256 hex digest');
  });

  it('rejects raw semantic units instead of silently importing Saju meaning', () => {
    expect(() =>
      admitCharacterSajuGroundingRefV1({
        candidate: makeGroundingRef({ units: [{ unitId: 'forbidden' }] }),
        expectedReadingRef: 'reading-001',
        expectedDomain: 'general',
      }),
    ).toThrow('unexpected field: units');
  });

  it('rejects attaching grounding to a non-Saju runtime context', () => {
    expect(() =>
      admitCharacterRuntimeSajuGroundingV1({
        context: makeRuntimeContext({ withoutSaju: true }),
        groundingRef: makeGroundingRef(),
      }),
    ).toThrow('cannot be attached to a non-Saju runtime context');
  });
});
