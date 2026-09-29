import { describe, expect, it } from 'vitest';

import { MyeongHaApiClientErrorV1 } from '../packages/api-client/src/index.js';
import { loadMobileCurrentSajuV1 } from '../apps/mobile/src/features/saju/mobile-saju-loader.js';

const profile = {
  birthProfileId: 'birth-1',
  profileKind: 'self' as const,
  label: null,
  archivedAt: null,
  currentRevision: {
    revisionId: 'revision-1',
    revisionNo: 1,
    input: {
      calendarType: 'solar' as const,
      birthDate: '1995-08-17',
      birthTime: null,
      timeKnown: false,
      isLeapMonth: false,
      sex: null,
    },
  },
  revisions: [{ revisionId: 'revision-1', revisionNo: 1, isCurrent: true }],
};

const unavailablePillar = { status: 'unavailable' as const, reasonCode: 'unknown_birth_time' };
const calculation = {
  schemaVersion: 'schema-1',
  kind: 'saju_calculation_evidence' as const,
  semanticAuthority: 'calculation_only' as const,
  interpretationAuthorized: false as const,
  birthRevisionRef: 'revision-1',
  snapshot: {
    snapshotId: 'snapshot-1',
    schemaVersion: 'snapshot-v1',
    calculationHash: 'hash-1',
    createdAt: '2026-09-29T00:00:00.000Z',
    pillars: {
      year: unavailablePillar,
      month: unavailablePillar,
      day: unavailablePillar,
      hour: unavailablePillar,
    },
    completeness: {
      birthTimeKnown: false,
      fullyResolved: false,
      resolvedPaths: [],
      ambiguousPaths: [],
      unavailablePaths: ['hour'],
    },
  },
};

describe('mobile current Saju loader', () => {
  it('does not calculate when the current Birth Profile is absent', async () => {
    let calculateCalls = 0;
    const state = await loadMobileCurrentSajuV1({
      birthService: { async readCurrent() { return null; } },
      sajuService: {
        async calculateCurrent() {
          calculateCalls += 1;
          return calculation;
        },
      },
    });

    expect(state).toEqual({ kind: 'birth_required' });
    expect(calculateCalls).toBe(0);
  });

  it('binds a calculation to the exact current Birth revision', async () => {
    const state = await loadMobileCurrentSajuV1({
      birthService: { async readCurrent() { return profile; } },
      sajuService: { async calculateCurrent() { return calculation; } },
    });

    expect(state.kind).toBe('ready');
  });

  it('turns Birth-present calculation 404 into authority_mismatch without creating Birth', async () => {
    let birthReadCalls = 0;
    const state = await loadMobileCurrentSajuV1({
      birthService: {
        async readCurrent() {
          birthReadCalls += 1;
          return profile;
        },
      },
      sajuService: {
        async calculateCurrent() {
          throw new MyeongHaApiClientErrorV1(
            'http',
            'NOT_FOUND',
            'missing',
            404,
            false,
          );
        },
      },
    });

    expect(state).toEqual({ kind: 'authority_mismatch', retryable: false });
    expect(birthReadCalls).toBe(1);
  });

  it('fails closed when calculation birthRevisionRef drifts', async () => {
    const state = await loadMobileCurrentSajuV1({
      birthService: { async readCurrent() { return profile; } },
      sajuService: {
        async calculateCurrent() {
          return { ...calculation, birthRevisionRef: 'revision-2' };
        },
      },
    });

    expect(state).toEqual({ kind: 'authority_mismatch', retryable: false });
  });

  it('maps temporary Saju unavailability to a retryable state', async () => {
    const state = await loadMobileCurrentSajuV1({
      birthService: { async readCurrent() { return profile; } },
      sajuService: {
        async calculateCurrent() {
          throw new MyeongHaApiClientErrorV1(
            'http',
            'SAJU_TEMPORARILY_UNAVAILABLE',
            'temporarily unavailable',
            503,
            true,
          );
        },
      },
    });

    expect(state).toEqual({ kind: 'saju_unavailable', retryable: true });
  });
});
