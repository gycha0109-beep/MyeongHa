import { hashSajuHeldSourceProofRequestV1 as hashJson } from './saju-held-source-proof-verifier-v1.js';

type Data = Readonly<Record<string, unknown>>;
type Scope = 'annual' | 'monthly';
type Pillar = Readonly<{ stem: string; branch: string }>;
type AnnualContext = Readonly<{ sajuYear: number; pillar: Pillar; stemTenGod: string }>;
type Segment = Readonly<{
  id: string;
  startsAt: string;
  endsAt: string;
  pillar: Pillar;
  stemTenGod: string;
  annualContext?: AnnualContext;
}>;
type DayunSegment = Readonly<Pick<Segment, 'startsAt' | 'endsAt' | 'pillar'> & { index: number }>;
type DayunOverlap = Readonly<
  { status: 'resolved'; contextId: string; segments: readonly DayunSegment[] } |
  { status: 'unavailable'; reasonCode: string }
>;

export interface SajuCanonicalReaderPeriodV1 {
  readonly scope: Scope;
  readonly referenceDateTime: unknown;
}

export interface SajuCanonicalReaderTemporalV1 {
  readonly calendar: Readonly<{
    scope: Scope;
    segments: readonly Segment[];
    dayunDisclosureVersion?: 'calculated_overlap_v1';
    dayunOverlap?: DayunOverlap;
  }>;
  readonly unitWindows: readonly Readonly<{ unitId: string; segmentIds: readonly string[] }>[];
}

const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SEOUL = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric' });
const KOREAN_CLOCK = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const STEMS = '갑 을 병 정 무 기 경 신 임 계'.split(' ');
const BRANCHES = '자 축 인 묘 진 사 오 미 신 유 술 해'.split(' ');
const TEN_GODS = new Set('비견 겁재 식신 상관 편재 정재 편관 정관 편인 정인'.split(' '));
const SEGMENTS = { annual: ['before_ipchun', 'after_ipchun'], monthly: ['before_jeol', 'after_jeol'] } as const;

function record(value: unknown): value is Data {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string' && UTC.test(value) && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}

function validPillar(value: unknown): value is Segment['pillar'] {
  return record(value) && typeof value.stem === 'string' && STEMS.includes(value.stem) &&
    typeof value.branch === 'string' && BRANCHES.includes(value.branch);
}

function validSegment(value: unknown, id: string): value is Segment {
  return record(value) && value.id === id && timestamp(value.startsAt) && timestamp(value.endsAt) &&
    value.startsAt < value.endsAt && validPillar(value.pillar) &&
    typeof value.stemTenGod === 'string' && TEN_GODS.has(value.stemTenGod) && record(value.natalBranchRelations);
}

function validAnnualContext(value: unknown, sajuYear: number): value is AnnualContext {
  return record(value) && value.sajuYear === sajuYear && validPillar(value.pillar) &&
    value.pillar.stem === STEMS[(sajuYear - 4) % 10] && value.pillar.branch === BRANCHES[(sajuYear - 4) % 12] &&
    typeof value.stemTenGod === 'string' && TEN_GODS.has(value.stemTenGod);
}

function validDayun(value: Data, startsAt: string, endsAt: string): value is DayunOverlap {
  if (value.status === 'unavailable') return typeof value.reasonCode === 'string' &&
    /^[a-z_]{1,64}$/u.test(value.reasonCode) && value.segments === undefined;
  if (value.status !== 'resolved' || typeof value.contextId !== 'string' ||
    !/^dayun_temporal_[a-f0-9]{24}$/u.test(value.contextId) || !Array.isArray(value.segments) ||
    value.segments.length < 1 || value.segments.length > 2) return false;

  let previous: DayunSegment | undefined;
  for (const segment of value.segments) {
    if (!record(segment) || typeof segment.index !== 'number' || !Number.isSafeInteger(segment.index) ||
      segment.index < 0 || !timestamp(segment.startsAt) || !timestamp(segment.endsAt) ||
      segment.startsAt < startsAt || segment.endsAt > endsAt || segment.startsAt >= segment.endsAt ||
      !validPillar(segment.pillar) || (previous !== undefined &&
        (segment.startsAt !== previous.endsAt || segment.index !== previous.index + 1))) return false;
    previous = { index: segment.index, startsAt: segment.startsAt, endsAt: segment.endsAt, pillar: segment.pillar };
  }
  return true;
}

function civilStart(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1) - 9 * 3_600_000).toISOString();
}

function canonicalWindowIds(
  unit: Data, scope: Scope, canonicalFacts: ReadonlyMap<string, readonly string[]>,
): readonly string[] {
  const paths = (unit.sourceCanonicalUnitRefs as string[]).flatMap(ref => canonicalFacts.get(ref) ?? []);
  return SEGMENTS[scope].filter(id => paths.some(path =>
    path.startsWith('temporal.segmentsById.' + id + '.') ||
    (id === 'after_ipchun' && /^temporal\.annual(?:Pillar|StemTenGod|BranchRelations)(?:\.|$)/u.test(path)),
  ));
}

export function admitSajuCanonicalReaderTemporalV1(
  value: unknown,
  expected: SajuCanonicalReaderPeriodV1,
  nativeResponseHash: string,
  snapshotId: unknown,
  groundingUnits: readonly Data[],
  canonicalFacts: ReadonlyMap<string, readonly string[]>,
): value is SajuCanonicalReaderTemporalV1 {
  if (!record(value) || !record(value.calendar) || !Array.isArray(value.unitWindows)) return false;
  const { calendar, unitWindows } = value;
  const { scope, referenceDateTime } = expected;
  if (!timestamp(referenceDateTime) || calendar.referenceDateTime !== referenceDateTime ||
    calendar.scope !== scope || calendar.timeZone !== 'Asia/Seoul' ||
    calendar.version !== 'myeonghwa-temporal-reader-evidence-v1' ||
    calendar.intervalConvention !== 'half_open_start_inclusive_end_exclusive' ||
    calendar.snapshotId !== snapshotId || typeof snapshotId !== 'string' || snapshotId.length === 0 ||
    calendar.responseBodyHash !== nativeResponseHash || typeof calendar.calculationHash !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(calendar.calculationHash) || !record(calendar.dayunOverlap) ||
    Object.hasOwn(calendar, 'researchSignals') || Object.hasOwn(calendar, 'interpretationStatus') ||
    !record(calendar.boundary) || !Array.isArray(calendar.segments) || calendar.segments.length !== 2) return false;

  const parts = new Map(SEOUL.formatToParts(new Date(referenceDateTime)).map(part => [part.type, part.value]));
  const year = Number(parts.get('year'));
  const month = Number(parts.get('month'));
  const [beforeId, afterId] = SEGMENTS[scope];
  const [before, after] = calendar.segments;
  if (year < 1800 || year > 2300 || calendar.targetYear !== year ||
    (scope === 'monthly' ? calendar.targetMonth !== month : calendar.targetMonth !== undefined) ||
    !validSegment(before, beforeId) || !validSegment(after, afterId) ||
    before.startsAt !== civilStart(year, scope === 'monthly' ? month : 1) ||
    after.endsAt !== (scope === 'monthly' ? civilStart(year, month + 1) : civilStart(year + 1, 1)) ||
    before.endsAt !== calendar.boundary.at || after.startsAt !== before.endsAt ||
    referenceDateTime < before.startsAt || referenceDateTime >= after.endsAt ||
    calendar.referenceSegmentId !== (referenceDateTime < after.startsAt ? beforeId : afterId) ||
    (calendar.dayunDisclosureVersion !== undefined && (calendar.dayunDisclosureVersion !== 'calculated_overlap_v1' ||
      !validDayun(calendar.dayunOverlap, before.startsAt, after.endsAt)))) return false;
  const beforeAnnual = before.annualContext;
  const afterAnnual = after.annualContext;
  if (beforeAnnual !== undefined || afterAnnual !== undefined) {
    if (scope !== 'monthly' || !validAnnualContext(beforeAnnual, month <= 2 ? year - 1 : year) ||
      !validAnnualContext(afterAnnual, month === 1 ? year - 1 : year) ||
      (beforeAnnual.sajuYear === afterAnnual.sajuYear && beforeAnnual.stemTenGod !== afterAnnual.stemTenGod)) return false;
  }

  const byUnit = new Map(groundingUnits.map(unit => [unit.unitId, unit]));
  const seen = new Set<string>();
  const coverage = new Set<string>();
  for (const binding of unitWindows) {
    if (!record(binding) || typeof binding.unitId !== 'string' || seen.has(binding.unitId) ||
      !Array.isArray(binding.segmentIds) || binding.segmentIds.length === 0 ||
      new Set(binding.segmentIds).size !== binding.segmentIds.length ||
      binding.segmentIds.some(id => id !== beforeId && id !== afterId)) return false;
    const unit = byUnit.get(binding.unitId);
    if (unit === undefined) return false;
    const segmentIds = binding.segmentIds;
    const factWindows = canonicalWindowIds(unit, scope, canonicalFacts);
    if (factWindows.length !== segmentIds.length ||
      factWindows.some((id, index) => id !== segmentIds[index])) return false;
    seen.add(binding.unitId);
    if (unit.narrativeRole === 'primary' && unit.realizationPolicyRef !== 'protected_only_v1') {
      segmentIds.forEach(id => coverage.add(id));
    }
  }
  return coverage.has(beforeId) && coverage.has(afterId) &&
    groundingUnits.every(unit => seen.has(unit.unitId as string) === (canonicalWindowIds(unit, scope, canonicalFacts).length > 0));
}

/** Protected calculation disclosures reused by scene rendering and reviewed chat. */
export function projectSajuTemporalDisclosuresV1(temporal: SajuCanonicalReaderTemporalV1, firstIndex: number) {
  const { segments, dayunDisclosureVersion, dayunOverlap } = temporal.calendar;
  const disclosures = segments.map((segment, index) => {
    const { pillar, stemTenGod, startsAt, endsAt, annualContext } = segment;
    const disclosureRef = 'grounding_disclosure_' + hashJson({
      purpose: 'approved-saju-temporal-window-v1', segment,
    }).slice(0, 24);
    return {
      id: segment.id, disclosureRef, type: 'scope_limitation' as const,
      text: `이 판정은 한국시간 ${KOREAN_CLOCK.format(new Date(startsAt))}부터 ${KOREAN_CLOCK.format(new Date(endsAt))} 직전까지 적용됩니다. 이 구간의 기둥은 ${pillar.stem}${pillar.branch}, 천간 십신은 ${stemTenGod}입니다.`
        + (annualContext === undefined ? '' : ` 같은 구간의 세운은 ${annualContext.pillar.stem}${annualContext.pillar.branch}년이며, 천간 십신은 ${annualContext.stemTenGod}입니다.`),
      sourceDisclosureIndex: firstIndex + index,
    };
  });
  // The signed version pins projection behavior so an existing archived Reading
  // keeps its original grounding hash and follow-up references.
  const dayunDisclosures = dayunDisclosureVersion !== 'calculated_overlap_v1' || dayunOverlap === undefined ? [] :
    (dayunOverlap.status === 'resolved' ? dayunOverlap.segments : [dayunOverlap]).map((entry, index) => ({
      disclosureRef: 'grounding_disclosure_' + hashJson({
        purpose: 'approved-saju-temporal-dayun-v1', scope: temporal.calendar.scope, entry,
      }).slice(0, 24),
      type: 'scope_limitation' as const,
      text: 'pillar' in entry
        ? `이 기간에 겹치는 대운은 ${entry.pillar.stem}${entry.pillar.branch}입니다. 한국시간 ${KOREAN_CLOCK.format(new Date(entry.startsAt))}부터 ${KOREAN_CLOCK.format(new Date(entry.endsAt))} 직전까지의 범위입니다.`
        : '이 명식은 요청하신 기간에 적용되는 대운을 계산할 근거가 부족합니다.',
      sourceDisclosureIndex: firstIndex + disclosures.length + index,
    }));
  const bySegment = new Map(disclosures.map(item => [item.id, item.disclosureRef]));
  return {
    disclosures: [...disclosures.map(({ id: _id, ...disclosure }) => disclosure), ...dayunDisclosures],
    refsByUnit: new Map(temporal.unitWindows.map(({ unitId, segmentIds }) => [
      unitId, [
        ...segmentIds.map(id => bySegment.get(id)!),
        ...dayunDisclosures.filter((_item, index) => {
          if (dayunOverlap?.status !== 'resolved') return true;
          const overlap = dayunOverlap.segments[index]!;
          return segments.some(segment => segmentIds.includes(segment.id) &&
            overlap.startsAt < segment.endsAt && segment.startsAt < overlap.endsAt);
        }).map(item => item.disclosureRef),
      ],
    ])),
  };
}
