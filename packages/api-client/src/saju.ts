import {
  MyeongHaApiClientErrorV1,
  type MyeongHaApiClientV1,
} from './http.js';

export const SAJU_CALCULATION_INGRESS_SCHEMA_V1 =
  'myeongha-saju-production-calculation-ingress-v1' as const;

export type SajuElementV1 = '목' | '화' | '토' | '금' | '수';
export type SajuYinYangV1 = '양' | '음';

export interface SajuStemBranchFactV1 {
  readonly value: string;
  readonly hanja: string;
  readonly element: SajuElementV1;
  readonly yinYang: SajuYinYangV1;
}

export interface SajuPillarFactV1 {
  readonly stem: SajuStemBranchFactV1;
  readonly branch: SajuStemBranchFactV1;
}

export type SajuPillarStateV1 =
  | Readonly<{ status: 'resolved'; value: SajuPillarFactV1 }>
  | Readonly<{ status: 'ambiguous'; candidateCount: number; reasonCodes: readonly string[] }>
  | Readonly<{ status: 'unavailable'; reasonCode: string }>;

export interface SajuCalculationEvidenceV1 {
  readonly schemaVersion: typeof SAJU_CALCULATION_INGRESS_SCHEMA_V1;
  readonly kind: 'saju_calculation_evidence';
  readonly semanticAuthority: 'calculation_only';
  readonly interpretationAuthorized: false;
  readonly birthRevisionRef: string;
  readonly snapshot: Readonly<{
    snapshotId: string;
    createdAt: string;
    pillars: Readonly<{
      year: SajuPillarStateV1;
      month: SajuPillarStateV1;
      day: SajuPillarStateV1;
      hour: SajuPillarStateV1;
    }>;
    completeness: Readonly<{
      birthTimeKnown: boolean;
      fullyResolved: boolean;
      resolvedPaths: readonly string[];
      ambiguousPaths: readonly string[];
      unavailablePaths: readonly string[];
    }>;
  }>;
}

function malformed(message: string): never {
  throw new MyeongHaApiClientErrorV1(
    'malformed_response',
    'API_SAJU_CALCULATION_INVALID',
    message,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) return malformed(`Saju calculation ${path} is invalid.`);
  return value;
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return malformed(`Saju calculation ${path} is invalid.`);
  }
  return value;
}

function requiredBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    return malformed(`Saju calculation ${path} is invalid.`);
  }
  return value;
}

function stringArray(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) return malformed(`Saju calculation ${path} is invalid.`);
  return Object.freeze(
    value.map((item, index) => requiredString(item, `${path}[${String(index)}]`)),
  );
}

function stemBranch(value: unknown, path: string): SajuStemBranchFactV1 {
  const source = record(value, path);
  const element = source.element;
  if (element !== '목' && element !== '화' && element !== '토' && element !== '금' && element !== '수') {
    return malformed(`Saju calculation ${path}.element is invalid.`);
  }
  const yinYang = source.yinYang;
  if (yinYang !== '양' && yinYang !== '음') {
    return malformed(`Saju calculation ${path}.yinYang is invalid.`);
  }
  return Object.freeze({
    value: requiredString(source.value, `${path}.value`),
    hanja: requiredString(source.hanja, `${path}.hanja`),
    element,
    yinYang,
  });
}

function pillarFact(value: unknown, path: string): SajuPillarFactV1 {
  const source = record(value, path);
  return Object.freeze({
    stem: stemBranch(source.stem, `${path}.stem`),
    branch: stemBranch(source.branch, `${path}.branch`),
  });
}

function pillarState(value: unknown, path: string): SajuPillarStateV1 {
  const source = record(value, path);
  if (source.status === 'resolved') {
    return Object.freeze({
      status: 'resolved',
      value: pillarFact(source.value, `${path}.value`),
    });
  }
  if (source.status === 'ambiguous') {
    if (!Array.isArray(source.candidates) || source.candidates.length < 2) {
      return malformed(`Saju calculation ${path}.candidates is invalid.`);
    }
    return Object.freeze({
      status: 'ambiguous',
      candidateCount: source.candidates.length,
      reasonCodes: stringArray(source.reasonCodes, `${path}.reasonCodes`),
    });
  }
  if (source.status === 'unavailable') {
    return Object.freeze({
      status: 'unavailable',
      reasonCode: requiredString(source.reasonCode, `${path}.reasonCode`),
    });
  }
  return malformed(`Saju calculation ${path}.status is invalid.`);
}

function parseCalculation(value: unknown): SajuCalculationEvidenceV1 {
  const source = record(value, 'artifact');
  if (
    source.schemaVersion !== SAJU_CALCULATION_INGRESS_SCHEMA_V1 ||
    source.kind !== 'saju_calculation_evidence' ||
    source.semanticAuthority !== 'calculation_only' ||
    source.interpretationAuthorized !== false
  ) {
    return malformed('Saju calculation authority boundary is unsupported.');
  }

  const snapshot = record(source.snapshot, 'snapshot');
  const pillars = record(snapshot.pillars, 'snapshot.pillars');
  const completeness = record(snapshot.completeness, 'snapshot.completeness');
  const createdAt = requiredString(snapshot.createdAt, 'snapshot.createdAt');
  if (!Number.isFinite(Date.parse(createdAt))) {
    return malformed('Saju calculation snapshot.createdAt is invalid.');
  }

  return Object.freeze({
    schemaVersion: SAJU_CALCULATION_INGRESS_SCHEMA_V1,
    kind: 'saju_calculation_evidence',
    semanticAuthority: 'calculation_only',
    interpretationAuthorized: false,
    birthRevisionRef: requiredString(source.birthRevisionRef, 'birthRevisionRef'),
    snapshot: Object.freeze({
      snapshotId: requiredString(snapshot.snapshotId, 'snapshot.snapshotId'),
      createdAt,
      pillars: Object.freeze({
        year: pillarState(pillars.year, 'snapshot.pillars.year'),
        month: pillarState(pillars.month, 'snapshot.pillars.month'),
        day: pillarState(pillars.day, 'snapshot.pillars.day'),
        hour: pillarState(pillars.hour, 'snapshot.pillars.hour'),
      }),
      completeness: Object.freeze({
        birthTimeKnown: requiredBoolean(
          completeness.birthTimeKnown,
          'snapshot.completeness.birthTimeKnown',
        ),
        fullyResolved: requiredBoolean(
          completeness.fullyResolved,
          'snapshot.completeness.fullyResolved',
        ),
        resolvedPaths: stringArray(
          completeness.resolvedPaths,
          'snapshot.completeness.resolvedPaths',
        ),
        ambiguousPaths: stringArray(
          completeness.ambiguousPaths,
          'snapshot.completeness.ambiguousPaths',
        ),
        unavailablePaths: stringArray(
          completeness.unavailablePaths,
          'snapshot.completeness.unavailablePaths',
        ),
      }),
    }),
  });
}

export async function calculateCurrentSajuV1(
  client: MyeongHaApiClientV1,
  bearer: string,
): Promise<SajuCalculationEvidenceV1> {
  const data = await client.requestData({
    method: 'POST',
    path: '/api/me/saju/calculation',
    bearer,
  });
  const envelope = record(data, 'response');
  return parseCalculation(envelope.calculation);
}
