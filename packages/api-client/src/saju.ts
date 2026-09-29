import {
  MyeongHaApiClientErrorV1,
  type MyeongHaApiClientV1,
} from './http.js';

export type SajuElementV1 = '목' | '화' | '토' | '금' | '수';
export type SajuYinYangV1 = '양' | '음';

export interface SajuStemOrBranchV1 {
  readonly value: string;
  readonly hanja: string;
  readonly element: SajuElementV1;
  readonly yinYang: SajuYinYangV1;
}

export interface SajuPillarV1 {
  readonly stem: SajuStemOrBranchV1;
  readonly branch: SajuStemOrBranchV1;
}

export type SajuPillarStateV1 =
  | Readonly<{ status: 'resolved'; value: SajuPillarV1 }>
  | Readonly<{
      status: 'ambiguous';
      candidates: readonly Readonly<{
        candidateId: string;
        value: SajuPillarV1;
        reasonRefs: readonly string[];
      }>[];
      reasonCodes: readonly string[];
    }>
  | Readonly<{ status: 'unavailable'; reasonCode: string }>;

export interface CurrentSajuCalculationV1 {
  readonly schemaVersion: string;
  readonly kind: 'saju_calculation_evidence';
  readonly semanticAuthority: 'calculation_only';
  readonly interpretationAuthorized: false;
  readonly birthRevisionRef: string;
  readonly snapshot: Readonly<{
    snapshotId: string;
    schemaVersion: string;
    calculationHash: string;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function malformed(message: string): never {
  throw new MyeongHaApiClientErrorV1(
    'malformed_response',
    'API_SAJU_RESPONSE_INVALID',
    message,
  );
}

function requireString(path: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return malformed(`Saju calculation ${path} is invalid.`);
  }
  return value;
}

function requireBoolean(path: string, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    return malformed(`Saju calculation ${path} is invalid.`);
  }
  return value;
}

function stringArray(path: string, value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return malformed(`Saju calculation ${path} is invalid.`);
  }
  return Object.freeze(
    value.map((item, index) => requireString(`${path}[${String(index)}]`, item)),
  );
}

function parseStemOrBranch(path: string, value: unknown): SajuStemOrBranchV1 {
  if (!isRecord(value)) return malformed(`Saju calculation ${path} is invalid.`);
  const element = value.element;
  if (element !== '목' && element !== '화' && element !== '토' && element !== '금' && element !== '수') {
    return malformed(`Saju calculation ${path}.element is invalid.`);
  }
  const yinYang = value.yinYang;
  if (yinYang !== '양' && yinYang !== '음') {
    return malformed(`Saju calculation ${path}.yinYang is invalid.`);
  }
  return Object.freeze({
    value: requireString(`${path}.value`, value.value),
    hanja: requireString(`${path}.hanja`, value.hanja),
    element,
    yinYang,
  });
}

function parsePillar(path: string, value: unknown): SajuPillarV1 {
  if (!isRecord(value)) return malformed(`Saju calculation ${path} is invalid.`);
  return Object.freeze({
    stem: parseStemOrBranch(`${path}.stem`, value.stem),
    branch: parseStemOrBranch(`${path}.branch`, value.branch),
  });
}

function parsePillarState(path: string, value: unknown): SajuPillarStateV1 {
  if (!isRecord(value)) return malformed(`Saju calculation ${path} is invalid.`);
  if (value.status === 'resolved') {
    return Object.freeze({
      status: 'resolved',
      value: parsePillar(`${path}.value`, value.value),
    });
  }
  if (value.status === 'unavailable') {
    return Object.freeze({
      status: 'unavailable',
      reasonCode: requireString(`${path}.reasonCode`, value.reasonCode),
    });
  }
  if (value.status === 'ambiguous') {
    if (!Array.isArray(value.candidates) || value.candidates.length < 2) {
      return malformed(`Saju calculation ${path}.candidates is invalid.`);
    }
    const candidates = Object.freeze(
      value.candidates.map((candidate, index) => {
        if (!isRecord(candidate)) {
          return malformed(`Saju calculation ${path}.candidates[${String(index)}] is invalid.`);
        }
        return Object.freeze({
          candidateId: requireString(
            `${path}.candidates[${String(index)}].candidateId`,
            candidate.candidateId,
          ),
          value: parsePillar(
            `${path}.candidates[${String(index)}].value`,
            candidate.value,
          ),
          reasonRefs: stringArray(
            `${path}.candidates[${String(index)}].reasonRefs`,
            candidate.reasonRefs,
          ),
        });
      }),
    );
    const reasonCodes = stringArray(`${path}.reasonCodes`, value.reasonCodes);
    if (reasonCodes.length === 0) {
      return malformed(`Saju calculation ${path}.reasonCodes is invalid.`);
    }
    return Object.freeze({ status: 'ambiguous', candidates, reasonCodes });
  }
  return malformed(`Saju calculation ${path}.status is invalid.`);
}

function parseCalculation(value: unknown): CurrentSajuCalculationV1 {
  if (!isRecord(value)) return malformed('Saju calculation artifact is invalid.');
  if (
    value.kind !== 'saju_calculation_evidence' ||
    value.semanticAuthority !== 'calculation_only' ||
    value.interpretationAuthorized !== false
  ) {
    return malformed('Saju calculation authority markers are invalid.');
  }
  if (!isRecord(value.snapshot)) {
    return malformed('Saju calculation snapshot is invalid.');
  }
  const snapshot = value.snapshot;
  if (!isRecord(snapshot.pillars) || !isRecord(snapshot.completeness)) {
    return malformed('Saju calculation snapshot facts are invalid.');
  }
  const completeness = snapshot.completeness;
  const createdAt = requireString('snapshot.createdAt', snapshot.createdAt);
  if (!Number.isFinite(Date.parse(createdAt))) {
    return malformed('Saju calculation snapshot.createdAt is invalid.');
  }

  return Object.freeze({
    schemaVersion: requireString('schemaVersion', value.schemaVersion),
    kind: 'saju_calculation_evidence',
    semanticAuthority: 'calculation_only',
    interpretationAuthorized: false,
    birthRevisionRef: requireString('birthRevisionRef', value.birthRevisionRef),
    snapshot: Object.freeze({
      snapshotId: requireString('snapshot.snapshotId', snapshot.snapshotId),
      schemaVersion: requireString('snapshot.schemaVersion', snapshot.schemaVersion),
      calculationHash: requireString('snapshot.calculationHash', snapshot.calculationHash),
      createdAt,
      pillars: Object.freeze({
        year: parsePillarState('snapshot.pillars.year', snapshot.pillars.year),
        month: parsePillarState('snapshot.pillars.month', snapshot.pillars.month),
        day: parsePillarState('snapshot.pillars.day', snapshot.pillars.day),
        hour: parsePillarState('snapshot.pillars.hour', snapshot.pillars.hour),
      }),
      completeness: Object.freeze({
        birthTimeKnown: requireBoolean(
          'snapshot.completeness.birthTimeKnown',
          completeness.birthTimeKnown,
        ),
        fullyResolved: requireBoolean(
          'snapshot.completeness.fullyResolved',
          completeness.fullyResolved,
        ),
        resolvedPaths: stringArray(
          'snapshot.completeness.resolvedPaths',
          completeness.resolvedPaths,
        ),
        ambiguousPaths: stringArray(
          'snapshot.completeness.ambiguousPaths',
          completeness.ambiguousPaths,
        ),
        unavailablePaths: stringArray(
          'snapshot.completeness.unavailablePaths',
          completeness.unavailablePaths,
        ),
      }),
    }),
  });
}

export async function calculateCurrentSajuV1(
  client: MyeongHaApiClientV1,
  bearer: string,
): Promise<CurrentSajuCalculationV1> {
  const data = await client.requestData({
    method: 'POST',
    path: '/api/me/saju/calculation',
    bearer,
  });
  if (!isRecord(data) || !Object.prototype.hasOwnProperty.call(data, 'calculation')) {
    return malformed('Current Saju calculation response is invalid.');
  }
  return parseCalculation(data.calculation);
}
