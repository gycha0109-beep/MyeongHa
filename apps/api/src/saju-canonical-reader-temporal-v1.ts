import { hashSajuHeldSourceProofRequestV1 as hashJson } from './saju-held-source-proof-verifier-v1.js';

type Data = Readonly<Record<string, unknown>>;
type Scope = 'annual' | 'monthly';
type Segment = Readonly<{
  id: string;
  startsAt: string;
  endsAt: string;
  pillar: Readonly<{ stem: string; branch: string }>;
  stemTenGod: string;
}>;

export interface SajuCanonicalReaderPeriodV1 {
  readonly scope: Scope;
  readonly referenceDateTime: unknown;
}

export interface SajuCanonicalReaderTemporalV1 {
  readonly calendar: Readonly<{
    scope: Scope;
    segments: readonly Segment[];
  }>;
  readonly unitWindows: readonly Readonly<{ unitId: string; segmentIds: readonly string[] }>[];
}

const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SEOUL = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric' });
const KOREAN_CLOCK = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const STEMS = new Set('갑 을 병 정 무 기 경 신 임 계'.split(' '));
const BRANCHES = new Set('자 축 인 묘 진 사 오 미 신 유 술 해'.split(' '));
const TEN_GODS = new Set('비견 겁재 식신 상관 편재 정재 편관 정관 편인 정인'.split(' '));
const SEGMENTS = { annual: ['before_ipchun', 'after_ipchun'], monthly: ['before_jeol', 'after_jeol'] } as const;

function record(value: unknown): value is Data {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string' && UTC.test(value) && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}

function validSegment(value: unknown, id: string): value is Segment {
  return record(value) && value.id === id && timestamp(value.startsAt) && timestamp(value.endsAt) &&
    value.startsAt < value.endsAt && record(value.pillar) && typeof value.pillar.stem === 'string' &&
    STEMS.has(value.pillar.stem) && typeof value.pillar.branch === 'string' && BRANCHES.has(value.pillar.branch) &&
    typeof value.stemTenGod === 'string' && TEN_GODS.has(value.stemTenGod) && record(value.natalBranchRelations);
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
    calendar.referenceSegmentId !== (referenceDateTime < after.startsAt ? beforeId : afterId)) return false;

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
  const disclosures = temporal.calendar.segments.map((segment, index) => {
    const { pillar, stemTenGod, startsAt, endsAt } = segment;
    const disclosureRef = 'grounding_disclosure_' + hashJson({
      purpose: 'approved-saju-temporal-window-v1', segment,
    }).slice(0, 24);
    return {
      id: segment.id, disclosureRef, type: 'scope_limitation' as const,
      text: `이 판정은 한국시간 ${KOREAN_CLOCK.format(new Date(startsAt))}부터 ${KOREAN_CLOCK.format(new Date(endsAt))} 직전까지 적용됩니다. 이 구간의 기둥은 ${pillar.stem}${pillar.branch}, 천간 십신은 ${stemTenGod}입니다.`,
      sourceDisclosureIndex: firstIndex + index,
    };
  });
  const bySegment = new Map(disclosures.map(item => [item.id, item.disclosureRef]));
  return {
    disclosures: disclosures.map(({ id: _id, ...disclosure }) => disclosure),
    refsByUnit: new Map(temporal.unitWindows.map(({ unitId, segmentIds }) => [
      unitId, segmentIds.map(id => bySegment.get(id)!),
    ])),
  };
}
