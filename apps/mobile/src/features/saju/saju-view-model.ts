import type {
  CurrentBirthProfileV1,
  CurrentSajuCalculationV1,
  SajuElementV1,
  SajuPillarStateV1,
  SajuPillarV1,
} from '@myeongha/api-client';

export interface MobileSajuPillarViewV1 {
  readonly key: 'year' | 'month' | 'day' | 'hour';
  readonly label: '년주' | '월주' | '일주' | '시주';
  readonly emphasis: boolean;
  readonly status: SajuPillarStateV1['status'];
  readonly stemHanja: string;
  readonly branchHanja: string;
  readonly stemHangul: string;
  readonly branchHangul: string;
}

export interface MobileSajuElementBalanceV1 {
  readonly element: SajuElementV1;
  readonly count: number;
}

export interface MobileSajuViewModelV1 {
  readonly birthSummary: string;
  readonly pillars: readonly MobileSajuPillarViewV1[];
  readonly dayMaster: Readonly<{
    status: 'resolved' | 'unresolved';
    hanja: string;
    hangul: string;
    element: SajuElementV1 | null;
    yinYang: '양' | '음' | null;
  }>;
  readonly elementBalance: readonly MobileSajuElementBalanceV1[];
  readonly completeness: Readonly<{
    resolvedPillarCount: number;
    fullyResolved: boolean;
    birthTimeKnown: boolean;
    headline: string;
    detail: string;
  }>;
}

const elementOrder = ['목', '화', '토', '금', '수'] as const satisfies readonly SajuElementV1[];

function formatBirthSummary(profile: CurrentBirthProfileV1): string {
  const input = profile.currentRevision.input;
  const date = input.birthDate.replaceAll('-', '.');
  const time = input.timeKnown && input.birthTime !== null
    ? input.birthTime.slice(0, 5)
    : '시간 모름';
  const calendar = input.calendarType === 'lunar'
    ? input.isLeapMonth
      ? '음력 · 윤달'
      : '음력'
    : '양력';
  return `${date} · ${time} · ${calendar}`;
}

function resolvedPillar(value: SajuPillarStateV1): SajuPillarV1 | null {
  return value.status === 'resolved' ? value.value : null;
}

function pillarView(
  key: MobileSajuPillarViewV1['key'],
  label: MobileSajuPillarViewV1['label'],
  state: SajuPillarStateV1,
): MobileSajuPillarViewV1 {
  const value = resolvedPillar(state);
  return Object.freeze({
    key,
    label,
    emphasis: key === 'day',
    status: state.status,
    stemHanja: value?.stem.hanja ?? '—',
    branchHanja: value?.branch.hanja ?? '—',
    stemHangul: value?.stem.value ?? '',
    branchHangul: value?.branch.value ?? '',
  });
}

export function createMobileSajuViewModelV1(input: {
  readonly profile: CurrentBirthProfileV1;
  readonly calculation: CurrentSajuCalculationV1;
}): MobileSajuViewModelV1 {
  if (input.calculation.birthRevisionRef !== input.profile.currentRevision.revisionId) {
    throw new Error('Saju calculation does not match the current Birth revision.');
  }

  const states = input.calculation.snapshot.pillars;
  const resolved = [
    resolvedPillar(states.year),
    resolvedPillar(states.month),
    resolvedPillar(states.day),
    resolvedPillar(states.hour),
  ].filter((value): value is SajuPillarV1 => value !== null);

  const counts = new Map<SajuElementV1, number>(
    elementOrder.map((element) => [element, 0]),
  );
  for (const pillar of resolved) {
    counts.set(pillar.stem.element, (counts.get(pillar.stem.element) ?? 0) + 1);
    counts.set(pillar.branch.element, (counts.get(pillar.branch.element) ?? 0) + 1);
  }

  const day = resolvedPillar(states.day);
  const completeness = input.calculation.snapshot.completeness;
  const resolvedPillarCount = resolved.length;

  return Object.freeze({
    birthSummary: formatBirthSummary(input.profile),
    pillars: Object.freeze([
      pillarView('year', '년주', states.year),
      pillarView('month', '월주', states.month),
      pillarView('day', '일주', states.day),
      pillarView('hour', '시주', states.hour),
    ]),
    dayMaster: day === null
      ? Object.freeze({
          status: 'unresolved' as const,
          hanja: '—',
          hangul: '확정되지 않음',
          element: null,
          yinYang: null,
        })
      : Object.freeze({
          status: 'resolved' as const,
          hanja: day.stem.hanja,
          hangul: day.stem.value,
          element: day.stem.element,
          yinYang: day.stem.yinYang,
        }),
    elementBalance: Object.freeze(
      elementOrder.map((element) =>
        Object.freeze({ element, count: counts.get(element) ?? 0 }),
      ),
    ),
    completeness: Object.freeze({
      resolvedPillarCount,
      fullyResolved: completeness.fullyResolved,
      birthTimeKnown: completeness.birthTimeKnown,
      headline: completeness.fullyResolved
        ? '네 기둥 계산 완료'
        : `${resolvedPillarCount}/4 기둥 확정`,
      detail: completeness.fullyResolved
        ? '현재 Birth revision을 기준으로 네 기둥이 모두 확정되었습니다.'
        : !completeness.birthTimeKnown
          ? '출생시간을 몰라 시주를 포함한 일부 계산이 제한될 수 있습니다.'
          : '일부 기둥이 아직 모호하거나 계산할 수 없는 상태입니다.',
    }),
  });
}
