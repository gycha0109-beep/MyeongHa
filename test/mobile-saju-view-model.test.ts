import { describe, expect, it } from 'vitest';

import { createMobileSajuViewModelV1 } from '../apps/mobile/src/features/saju/saju-view-model.js';

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
      birthTime: '14:30',
      timeKnown: true,
      isLeapMonth: false,
      sex: 'male' as const,
    },
  },
  revisions: [{ revisionId: 'revision-1', revisionNo: 1, isCurrent: true }],
};

function pillar(stemElement: '목' | '화' | '토' | '금' | '수', branchElement: '목' | '화' | '토' | '금' | '수') {
  return {
    status: 'resolved' as const,
    value: {
      stem: { value: '갑', hanja: '甲', element: stemElement, yinYang: '양' as const },
      branch: { value: '자', hanja: '子', element: branchElement, yinYang: '양' as const },
    },
  };
}

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
      year: pillar('목', '수'),
      month: pillar('화', '토'),
      day: pillar('금', '금'),
      hour: pillar('수', '목'),
    },
    completeness: {
      birthTimeKnown: true,
      fullyResolved: true,
      resolvedPaths: ['year', 'month', 'day', 'hour'],
      ambiguousPaths: [],
      unavailablePaths: [],
    },
  },
};

describe('mobile Saju view model', () => {
  it('derives day master, pillar emphasis, element counts, and completeness from calculation facts', () => {
    const view = createMobileSajuViewModelV1({ profile, calculation });

    expect(view.birthSummary).toBe('1995.08.17 · 14:30 · 양력');
    expect(view.pillars.find((item) => item.key === 'day')?.emphasis).toBe(true);
    expect(view.dayMaster).toMatchObject({
      status: 'resolved',
      hanja: '甲',
      hangul: '갑',
      element: '금',
      yinYang: '양',
    });
    expect(Object.fromEntries(view.elementBalance.map((item) => [item.element, item.count]))).toEqual({
      목: 2,
      화: 1,
      토: 1,
      금: 2,
      수: 2,
    });
    expect(view.completeness.headline).toBe('네 기둥 계산 완료');
  });

  it('does not count ambiguous or unavailable pillars as confirmed element facts', () => {
    const partial = {
      ...calculation,
      snapshot: {
        ...calculation.snapshot,
        pillars: {
          ...calculation.snapshot.pillars,
          hour: { status: 'unavailable' as const, reasonCode: 'unknown_birth_time' },
        },
        completeness: {
          ...calculation.snapshot.completeness,
          birthTimeKnown: false,
          fullyResolved: false,
          resolvedPaths: ['year', 'month', 'day'],
          unavailablePaths: ['hour'],
        },
      },
    };
    const view = createMobileSajuViewModelV1({ profile, calculation: partial });

    expect(view.completeness.resolvedPillarCount).toBe(3);
    expect(view.completeness.headline).toBe('3/4 기둥 확정');
    expect(view.elementBalance.reduce((sum, item) => sum + item.count, 0)).toBe(6);
  });

  it('rejects a calculation bound to another Birth revision', () => {
    expect(() =>
      createMobileSajuViewModelV1({
        profile,
        calculation: { ...calculation, birthRevisionRef: 'revision-other' },
      }),
    ).toThrow('does not match');
  });
});
