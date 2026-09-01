export const SAJU_PRODUCTION_CALCULATION_INGRESS_SCHEMA_V1 =
  'myeongha-saju-production-calculation-ingress-v1' as const;
export const SAJU_PRODUCTION_CALCULATION_HTTP_SCHEMA_V1 =
  'myeonghwa-production-calculation-http-v1' as const;
export const SAJU_PRODUCTION_CALCULATION_RUNTIME_V1 =
  'myeonghwa-production-calculation-runtime-v1' as const;

const AUTHORIZED_CALCULATION_POLICY_ID = 'myeonghwa-production-civil-midnight-v1' as const;
const AUTHORIZED_CALCULATION_AUTHORIZATION_ID =
  'myeonghwa-production-calculation-default-authorization-v1' as const;
const AUTHORIZED_CALCULATION_AUTHORITY_RECORD_REF =
  'docs/decisions/ADR-0006-production-calculation-default-v1.md' as const;
const AUTHORIZED_CALCULATION_POLICY_VERSION =
  'myeonghwa-production-calculation-policy-v1' as const;
const AUTHORIZED_SNAPSHOT_POLICY_ID = 'myeonghwa/production/civil-midnight-v1' as const;

export type SajuProductionCalculationIngressErrorCodeV1 =
  | 'INVALID_RESPONSE'
  | 'UNSUPPORTED_SCHEMA'
  | 'UNAUTHORIZED_CALCULATION'
  | 'BIRTH_REVISION_MISMATCH';

export class SajuProductionCalculationIngressErrorV1 extends Error {
  constructor(
    readonly code: SajuProductionCalculationIngressErrorCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'SajuProductionCalculationIngressErrorV1';
  }
}

export interface SajuBirthRevisionBindingV1 {
  readonly birthRevisionRef: string;
  readonly calendarType: 'solar' | 'lunar';
  readonly birthDate: string;
  readonly birthTime: string | null;
  readonly timeKnown: boolean;
  readonly isLeapMonth: boolean;
  readonly sex: 'male' | 'female' | 'unspecified' | null;
}

export type SajuCalculationPillarFactStateV1 =
  | Readonly<{
      status: 'resolved';
      value: SajuCalculationPillarFactV1;
    }>
  | Readonly<{
      status: 'ambiguous';
      candidates: readonly Readonly<{
        candidateId: string;
        value: SajuCalculationPillarFactV1;
        reasonRefs: readonly string[];
      }>[];
      reasonCodes: readonly string[];
    }>
  | Readonly<{
      status: 'unavailable';
      reasonCode: string;
    }>;

export interface SajuCalculationStemOrBranchFactV1 {
  readonly value: string;
  readonly hanja: string;
  readonly element: '목' | '화' | '토' | '금' | '수';
  readonly yinYang: '양' | '음';
}

export interface SajuCalculationPillarFactV1 {
  readonly stem: SajuCalculationStemOrBranchFactV1;
  readonly branch: SajuCalculationStemOrBranchFactV1;
}

export interface SajuProductionCalculationIngressArtifactV1 {
  readonly schemaVersion: typeof SAJU_PRODUCTION_CALCULATION_INGRESS_SCHEMA_V1;
  readonly kind: 'saju_calculation_evidence';
  readonly semanticAuthority: 'calculation_only';
  readonly interpretationAuthorized: false;
  readonly birthRevisionRef: string;
  readonly source: Readonly<{
    responseSchemaVersion: typeof SAJU_PRODUCTION_CALCULATION_HTTP_SCHEMA_V1;
    runtimeVersion: typeof SAJU_PRODUCTION_CALCULATION_RUNTIME_V1;
    calculationPolicyId: typeof AUTHORIZED_CALCULATION_POLICY_ID;
    authorizationId: typeof AUTHORIZED_CALCULATION_AUTHORIZATION_ID;
    authorityRecordRef: typeof AUTHORIZED_CALCULATION_AUTHORITY_RECORD_REF;
    policyVersion: typeof AUTHORIZED_CALCULATION_POLICY_VERSION;
    contentHash: string;
  }>;
  readonly snapshot: Readonly<{
    snapshotId: string;
    schemaVersion: string;
    calculationHash: string;
    createdAt: string;
    policy: Readonly<{
      policyId: typeof AUTHORIZED_SNAPSHOT_POLICY_ID;
      policyVersion: typeof AUTHORIZED_CALCULATION_POLICY_VERSION;
      dayBoundary: 'midnight';
    }>;
    pillars: Readonly<{
      year: SajuCalculationPillarFactStateV1;
      month: SajuCalculationPillarFactStateV1;
      day: SajuCalculationPillarFactStateV1;
      hour: SajuCalculationPillarFactStateV1;
    }>;
    completeness: Readonly<{
      birthTimeKnown: boolean;
      fullyResolved: boolean;
      resolvedPaths: readonly string[];
      ambiguousPaths: readonly string[];
      unavailablePaths: readonly string[];
    }>;
    provenance: Readonly<{
      engine: Readonly<{ name: string; version: string }>;
      adapter: Readonly<{ name: string; version: string }>;
      policy: Readonly<{
        id: typeof AUTHORIZED_SNAPSHOT_POLICY_ID;
        version: typeof AUTHORIZED_CALCULATION_POLICY_VERSION;
      }>;
      schema: Readonly<{ id: string; version: string }>;
    }>;
  }>;
}

function fail(
  code: SajuProductionCalculationIngressErrorCodeV1,
  message: string,
): never {
  throw new SajuProductionCalculationIngressErrorV1(code, message);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail('INVALID_RESPONSE', `${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unexpected !== undefined) {
    fail('INVALID_RESPONSE', `${path} contains unexpected field: ${unexpected}.`);
  }
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fail('INVALID_RESPONSE', `${path} must be a non-empty string.`);
  }
  return value;
}

function requiredBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    return fail('INVALID_RESPONSE', `${path} must be boolean.`);
  }
  return value;
}

function stringArray(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) {
    return fail('INVALID_RESPONSE', `${path} must be an array.`);
  }
  return Object.freeze(
    value.map((item, index) => requiredString(item, `${path}[${String(index)}]`)),
  );
}

function exactString(value: unknown, expected: string, path: string): void {
  if (value !== expected) {
    fail('UNAUTHORIZED_CALCULATION', `${path} is outside the authorized production boundary.`);
  }
}

function parseStoredDate(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (match === null) {
    return fail('BIRTH_REVISION_MISMATCH', 'birthRevision.birthDate must be YYYY-MM-DD.');
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function parseStoredTime(value: string): { hour: number; minute: number } {
  const match = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/u.exec(value);
  if (match === null) {
    return fail(
      'BIRTH_REVISION_MISMATCH',
      'birthRevision.birthTime must preserve minute-precision clock time.',
    );
  }
  const seconds = match[3] === undefined ? 0 : Number(match[3]);
  if (seconds !== 0) {
    return fail(
      'BIRTH_REVISION_MISMATCH',
      'birthRevision.birthTime contains seconds that the production request contract cannot preserve.',
    );
  }
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function assertBirthRevisionBinding(
  inputValue: unknown,
  binding: SajuBirthRevisionBindingV1,
): string {
  const birthRevisionRef = binding.birthRevisionRef.trim();
  if (birthRevisionRef.length === 0) {
    return fail('BIRTH_REVISION_MISMATCH', 'birthRevisionRef must be non-empty.');
  }
  if (binding.calendarType !== 'solar' && binding.calendarType !== 'lunar') {
    return fail('BIRTH_REVISION_MISMATCH', 'birthRevision.calendarType is unsupported.');
  }
  if (binding.sex !== null && !['male', 'female', 'unspecified'].includes(binding.sex)) {
    return fail('BIRTH_REVISION_MISMATCH', 'birthRevision.sex is unsupported.');
  }
  if (!binding.timeKnown && binding.birthTime !== null) {
    return fail(
      'BIRTH_REVISION_MISMATCH',
      'An unknown-time birth revision cannot carry birthTime.',
    );
  }
  if (binding.timeKnown && binding.birthTime === null) {
    return fail(
      'BIRTH_REVISION_MISMATCH',
      'A known-time birth revision must carry birthTime.',
    );
  }

  const source = record(inputValue, 'response.snapshot.input');
  assertOnlyKeys(
    source,
    ['calendarType', 'date', 'time', 'isLeapMonth', 'sexForTraditionalCalculation', 'birthplace'],
    'response.snapshot.input',
  );
  if (source.calendarType !== binding.calendarType) {
    fail('BIRTH_REVISION_MISMATCH', 'Calculated calendarType does not match the bound birth revision.');
  }

  const sourceDate = record(source.date, 'response.snapshot.input.date');
  const expectedDate = parseStoredDate(binding.birthDate);
  if (
    sourceDate.year !== expectedDate.year ||
    sourceDate.month !== expectedDate.month ||
    sourceDate.day !== expectedDate.day
  ) {
    fail('BIRTH_REVISION_MISMATCH', 'Calculated birth date does not match the bound birth revision.');
  }

  const sourceTime = record(source.time, 'response.snapshot.input.time');
  if (binding.timeKnown) {
    if (sourceTime.known !== true || binding.birthTime === null) {
      fail('BIRTH_REVISION_MISMATCH', 'Calculated birth time does not match the bound birth revision.');
    }
    const expectedTime = parseStoredTime(binding.birthTime);
    if (sourceTime.hour !== expectedTime.hour || sourceTime.minute !== expectedTime.minute) {
      fail('BIRTH_REVISION_MISMATCH', 'Calculated birth time does not match the bound birth revision.');
    }
  } else if (sourceTime.known !== false) {
    fail('BIRTH_REVISION_MISMATCH', 'Calculated birth-time certainty does not match the bound birth revision.');
  }

  const sourceLeapMonth = source.isLeapMonth === undefined ? false : source.isLeapMonth;
  if (typeof sourceLeapMonth !== 'boolean' || sourceLeapMonth !== binding.isLeapMonth) {
    fail('BIRTH_REVISION_MISMATCH', 'Calculated leap-month flag does not match the bound birth revision.');
  }
  const sourceSex = source.sexForTraditionalCalculation === undefined
    ? null
    : source.sexForTraditionalCalculation;
  if (sourceSex !== binding.sex) {
    fail('BIRTH_REVISION_MISMATCH', 'Calculated sex input does not match the bound birth revision.');
  }

  return birthRevisionRef;
}

function stemOrBranchFact(value: unknown, path: string): SajuCalculationStemOrBranchFactV1 {
  const source = record(value, path);
  assertOnlyKeys(source, ['value', 'hanja', 'element', 'yinYang'], path);
  const element = source.element;
  if (element !== '목' && element !== '화' && element !== '토' && element !== '금' && element !== '수') {
    return fail('INVALID_RESPONSE', `${path}.element is invalid.`);
  }
  const yinYang = source.yinYang;
  if (yinYang !== '양' && yinYang !== '음') {
    return fail('INVALID_RESPONSE', `${path}.yinYang is invalid.`);
  }
  return Object.freeze({
    value: requiredString(source.value, `${path}.value`),
    hanja: requiredString(source.hanja, `${path}.hanja`),
    element,
    yinYang,
  });
}

function pillarFact(value: unknown, path: string): SajuCalculationPillarFactV1 {
  const source = record(value, path);
  assertOnlyKeys(source, ['stem', 'branch'], path);
  return Object.freeze({
    stem: stemOrBranchFact(source.stem, `${path}.stem`),
    branch: stemOrBranchFact(source.branch, `${path}.branch`),
  });
}

function pillarFactState(value: unknown, path: string): SajuCalculationPillarFactStateV1 {
  const source = record(value, path);
  if (source.status === 'resolved') {
    assertOnlyKeys(source, ['status', 'value'], path);
    return Object.freeze({ status: 'resolved', value: pillarFact(source.value, `${path}.value`) });
  }
  if (source.status === 'unavailable') {
    assertOnlyKeys(source, ['status', 'reasonCode'], path);
    return Object.freeze({
      status: 'unavailable',
      reasonCode: requiredString(source.reasonCode, `${path}.reasonCode`),
    });
  }
  if (source.status === 'ambiguous') {
    assertOnlyKeys(source, ['status', 'candidates', 'reasonCodes'], path);
    if (!Array.isArray(source.candidates) || source.candidates.length < 2) {
      return fail('INVALID_RESPONSE', `${path}.candidates must contain at least two candidates.`);
    }
    const candidates = Object.freeze(
      source.candidates.map((candidate, index) => {
        const itemPath = `${path}.candidates[${String(index)}]`;
        const item = record(candidate, itemPath);
        assertOnlyKeys(item, ['candidateId', 'value', 'reasonRefs'], itemPath);
        return Object.freeze({
          candidateId: requiredString(item.candidateId, `${itemPath}.candidateId`),
          value: pillarFact(item.value, `${itemPath}.value`),
          reasonRefs: stringArray(item.reasonRefs, `${itemPath}.reasonRefs`),
        });
      }),
    );
    const reasonCodes = stringArray(source.reasonCodes, `${path}.reasonCodes`);
    if (reasonCodes.length === 0) {
      return fail('INVALID_RESPONSE', `${path}.reasonCodes must not be empty.`);
    }
    return Object.freeze({ status: 'ambiguous', candidates, reasonCodes });
  }
  return fail('INVALID_RESPONSE', `${path}.status is invalid.`);
}

function completeness(value: unknown) {
  const source = record(value, 'response.snapshot.completeness');
  assertOnlyKeys(
    source,
    ['birthTimeKnown', 'fullyResolved', 'resolvedPaths', 'ambiguousPaths', 'unavailablePaths'],
    'response.snapshot.completeness',
  );
  return Object.freeze({
    birthTimeKnown: requiredBoolean(source.birthTimeKnown, 'response.snapshot.completeness.birthTimeKnown'),
    fullyResolved: requiredBoolean(source.fullyResolved, 'response.snapshot.completeness.fullyResolved'),
    resolvedPaths: stringArray(source.resolvedPaths, 'response.snapshot.completeness.resolvedPaths'),
    ambiguousPaths: stringArray(source.ambiguousPaths, 'response.snapshot.completeness.ambiguousPaths'),
    unavailablePaths: stringArray(source.unavailablePaths, 'response.snapshot.completeness.unavailablePaths'),
  });
}

function provenance(value: unknown) {
  const source = record(value, 'response.snapshot.provenance');
  assertOnlyKeys(source, ['engine', 'adapter', 'policy', 'schema', 'datasets'], 'response.snapshot.provenance');
  const engine = record(source.engine, 'response.snapshot.provenance.engine');
  const adapter = record(source.adapter, 'response.snapshot.provenance.adapter');
  const policy = record(source.policy, 'response.snapshot.provenance.policy');
  const schema = record(source.schema, 'response.snapshot.provenance.schema');
  exactString(policy.id, AUTHORIZED_SNAPSHOT_POLICY_ID, 'response.snapshot.provenance.policy.id');
  exactString(
    policy.version,
    AUTHORIZED_CALCULATION_POLICY_VERSION,
    'response.snapshot.provenance.policy.version',
  );
  return Object.freeze({
    engine: Object.freeze({
      name: requiredString(engine.name, 'response.snapshot.provenance.engine.name'),
      version: requiredString(engine.version, 'response.snapshot.provenance.engine.version'),
    }),
    adapter: Object.freeze({
      name: requiredString(adapter.name, 'response.snapshot.provenance.adapter.name'),
      version: requiredString(adapter.version, 'response.snapshot.provenance.adapter.version'),
    }),
    policy: Object.freeze({
      id: AUTHORIZED_SNAPSHOT_POLICY_ID,
      version: AUTHORIZED_CALCULATION_POLICY_VERSION,
    }),
    schema: Object.freeze({
      id: requiredString(schema.id, 'response.snapshot.provenance.schema.id'),
      version: requiredString(schema.version, 'response.snapshot.provenance.schema.version'),
    }),
  });
}

/**
 * Consumes only the authorized Saju calculation-only V1 response.
 *
 * This is deliberately not a Reading adapter: interpretation, narrative text,
 * Character context, and reading_refs remain outside this boundary. The source
 * birth input is used only to bind the result to a MyeongHa birth revision and
 * is not retained in the returned artifact.
 */
export function ingestAuthorizedSajuProductionCalculationV1(input: {
  readonly response: unknown;
  readonly birthRevision: SajuBirthRevisionBindingV1;
}): SajuProductionCalculationIngressArtifactV1 {
  const response = record(input.response, 'response');
  assertOnlyKeys(
    response,
    ['responseSchemaVersion', 'runtimeVersion', 'authority', 'snapshot'],
    'response',
  );
  if (response.responseSchemaVersion !== SAJU_PRODUCTION_CALCULATION_HTTP_SCHEMA_V1) {
    return fail('UNSUPPORTED_SCHEMA', 'Unsupported Saju production calculation HTTP schema.');
  }
  if (response.runtimeVersion !== SAJU_PRODUCTION_CALCULATION_RUNTIME_V1) {
    return fail('UNSUPPORTED_SCHEMA', 'Unsupported Saju production calculation runtime version.');
  }

  const authority = record(response.authority, 'response.authority');
  assertOnlyKeys(
    authority,
    ['calculationPolicyId', 'authorizationId', 'authorityRecordRef', 'policyVersion', 'contentHash'],
    'response.authority',
  );
  exactString(authority.calculationPolicyId, AUTHORIZED_CALCULATION_POLICY_ID, 'response.authority.calculationPolicyId');
  exactString(authority.authorizationId, AUTHORIZED_CALCULATION_AUTHORIZATION_ID, 'response.authority.authorizationId');
  exactString(authority.authorityRecordRef, AUTHORIZED_CALCULATION_AUTHORITY_RECORD_REF, 'response.authority.authorityRecordRef');
  exactString(authority.policyVersion, AUTHORIZED_CALCULATION_POLICY_VERSION, 'response.authority.policyVersion');
  const contentHash = requiredString(authority.contentHash, 'response.authority.contentHash');

  const snapshot = record(response.snapshot, 'response.snapshot');
  assertOnlyKeys(
    snapshot,
    [
      'snapshotId',
      'schemaVersion',
      'calculationHash',
      'createdAt',
      'input',
      'policy',
      'normalized',
      'pillars',
      'derivedFacts',
      'solarTermContext',
      'luckCycle',
      'completeness',
      'provenance',
    ],
    'response.snapshot',
  );
  const birthRevisionRef = assertBirthRevisionBinding(snapshot.input, input.birthRevision);
  const policy = record(snapshot.policy, 'response.snapshot.policy');
  assertOnlyKeys(
    policy,
    ['policyId', 'policyVersion', 'dayBoundary', 'trueSolarTime', 'timeZonePolicy', 'unknownBirthTimePolicy'],
    'response.snapshot.policy',
  );
  exactString(policy.policyId, AUTHORIZED_SNAPSHOT_POLICY_ID, 'response.snapshot.policy.policyId');
  exactString(policy.policyVersion, AUTHORIZED_CALCULATION_POLICY_VERSION, 'response.snapshot.policy.policyVersion');
  exactString(policy.dayBoundary, 'midnight', 'response.snapshot.policy.dayBoundary');

  const pillars = record(snapshot.pillars, 'response.snapshot.pillars');
  assertOnlyKeys(pillars, ['year', 'month', 'day', 'hour'], 'response.snapshot.pillars');
  const createdAt = requiredString(snapshot.createdAt, 'response.snapshot.createdAt');
  if (!Number.isFinite(Date.parse(createdAt))) {
    return fail('INVALID_RESPONSE', 'response.snapshot.createdAt must be an ISO-compatible timestamp.');
  }

  return Object.freeze({
    schemaVersion: SAJU_PRODUCTION_CALCULATION_INGRESS_SCHEMA_V1,
    kind: 'saju_calculation_evidence',
    semanticAuthority: 'calculation_only',
    interpretationAuthorized: false,
    birthRevisionRef,
    source: Object.freeze({
      responseSchemaVersion: SAJU_PRODUCTION_CALCULATION_HTTP_SCHEMA_V1,
      runtimeVersion: SAJU_PRODUCTION_CALCULATION_RUNTIME_V1,
      calculationPolicyId: AUTHORIZED_CALCULATION_POLICY_ID,
      authorizationId: AUTHORIZED_CALCULATION_AUTHORIZATION_ID,
      authorityRecordRef: AUTHORIZED_CALCULATION_AUTHORITY_RECORD_REF,
      policyVersion: AUTHORIZED_CALCULATION_POLICY_VERSION,
      contentHash,
    }),
    snapshot: Object.freeze({
      snapshotId: requiredString(snapshot.snapshotId, 'response.snapshot.snapshotId'),
      schemaVersion: requiredString(snapshot.schemaVersion, 'response.snapshot.schemaVersion'),
      calculationHash: requiredString(snapshot.calculationHash, 'response.snapshot.calculationHash'),
      createdAt,
      policy: Object.freeze({
        policyId: AUTHORIZED_SNAPSHOT_POLICY_ID,
        policyVersion: AUTHORIZED_CALCULATION_POLICY_VERSION,
        dayBoundary: 'midnight',
      }),
      pillars: Object.freeze({
        year: pillarFactState(pillars.year, 'response.snapshot.pillars.year'),
        month: pillarFactState(pillars.month, 'response.snapshot.pillars.month'),
        day: pillarFactState(pillars.day, 'response.snapshot.pillars.day'),
        hour: pillarFactState(pillars.hour, 'response.snapshot.pillars.hour'),
      }),
      completeness: completeness(snapshot.completeness),
      provenance: provenance(snapshot.provenance),
    }),
  });
}
