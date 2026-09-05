import { acquireProductionMemberSmokeSession } from './production-member-smoke-session.mjs';

const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';
const MEMBER_ME_URL = `${PRODUCTION_ORIGIN}/api/me`;
const BIRTH_PROFILE_URL = `${PRODUCTION_ORIGIN}/api/me/birth-profile`;
const SAJU_CALCULATION_URL = `${PRODUCTION_ORIGIN}/api/me/saju/calculation`;
const REQUEST_TIMEOUT_MS = 20_000;

function requireSecret(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required for the production current-subject Saju smoke.`);
  }
  return value.trim();
}

function requireUuid(name, value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${name} must be a UUID.`);
  }
  return value;
}

function requireNonEmptyString(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value;
}

function requirePositiveInteger(name, value) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function requireTimestamp(name, value) {
  requireNonEmptyString(name, value);
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`${name} must be a timestamp.`);
  }
  return value;
}

function requireNoStore(response, label) {
  const directives = (response.headers.get('cache-control') ?? '')
    .split(',')
    .map((directive) => directive.trim().toLowerCase())
    .filter(Boolean);
  if (!directives.includes('no-store')) {
    throw new Error(`${label} must return Cache-Control containing no-store.`);
  }
}

function requireJsonContentType(response, label) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(`${label} must return application/json.`);
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(name, value) {
  if (!isRecord(value)) throw new Error(`${name} must be an object.`);
  return value;
}

function requireStringArray(name, value) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${name} must be an array of strings.`);
  }
  return value;
}

async function readJsonWithoutLogging(response, label) {
  let value;
  try {
    value = await response.json();
  } catch {
    throw new Error(`${label} did not return valid JSON.`);
  }
  return requireRecord(label, value);
}

async function fetchCanonical(url, init) {
  return fetch(url, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

function requireApiContract(value, label) {
  const meta = requireRecord(`${label} meta`, value.meta);
  if (meta.apiContractVersion !== 'v0.9') {
    throw new Error(`${label} did not return API contract v0.9.`);
  }
  return meta;
}

function requireExact(name, actual, expected) {
  if (actual !== expected) throw new Error(`${name} is outside the authorized production contract.`);
}

function requirePillarState(name, value) {
  const state = requireRecord(name, value);
  if (state.status !== 'resolved' && state.status !== 'ambiguous' && state.status !== 'unavailable') {
    throw new Error(`${name}.status is invalid.`);
  }
}

function buildStableEvidence({ calculation, source, snapshot, policy, pillars, completeness, provenance }) {
  return {
    schemaVersion: calculation.schemaVersion,
    kind: calculation.kind,
    semanticAuthority: calculation.semanticAuthority,
    interpretationAuthorized: calculation.interpretationAuthorized,
    birthRevisionRef: calculation.birthRevisionRef,
    source: {
      responseSchemaVersion: source.responseSchemaVersion,
      runtimeVersion: source.runtimeVersion,
      calculationPolicyId: source.calculationPolicyId,
      authorizationId: source.authorizationId,
      authorityRecordRef: source.authorityRecordRef,
      policyVersion: source.policyVersion,
      contentHash: source.contentHash,
    },
    snapshot: {
      schemaVersion: snapshot.schemaVersion,
      calculationHash: snapshot.calculationHash,
      policy: {
        policyId: policy.policyId,
        policyVersion: policy.policyVersion,
        dayBoundary: policy.dayBoundary,
      },
      pillars,
      completeness,
      provenance,
    },
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function stableSerialize(value) {
  return JSON.stringify(canonicalize(value));
}

const expectedSubjectId = requireUuid(
  'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID',
  requireSecret('MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID'),
);
const { accessToken } = await acquireProductionMemberSmokeSession();
const authorization = { Authorization: `Bearer ${accessToken}` };

const memberResponse = await fetchCanonical(MEMBER_ME_URL, {
  method: 'GET',
  headers: authorization,
});
requireNoStore(memberResponse, 'Production Saju smoke Member /api/me');
requireJsonContentType(memberResponse, 'Production Saju smoke Member /api/me');
if (memberResponse.status !== 200) {
  throw new Error(`Production Saju smoke Member /api/me expected HTTP 200, received ${memberResponse.status}.`);
}
const memberBody = await readJsonWithoutLogging(memberResponse, 'Production Saju smoke Member /api/me');
requireApiContract(memberBody, 'Production Saju smoke Member /api/me');
const memberData = requireRecord('Production Saju smoke Member data', memberBody.data);
if (memberBody.ok !== true) throw new Error('Production Saju smoke Member /api/me did not return ok=true.');
if (memberData.subjectKind !== 'member') throw new Error('Production Saju smoke credential resolved a non-Member subject.');
if (memberData.subjectId !== expectedSubjectId) {
  throw new Error('Production Saju smoke credential resolved a different canonical subject than expected.');
}
if (memberData.subjectStatus !== 'active') throw new Error('Production Saju smoke Member subject must be active.');

const birthProfileResponse = await fetchCanonical(BIRTH_PROFILE_URL, {
  method: 'GET',
  headers: authorization,
});
requireNoStore(birthProfileResponse, 'Production Saju smoke current Birth Profile');
requireJsonContentType(birthProfileResponse, 'Production Saju smoke current Birth Profile');
if (birthProfileResponse.status !== 200) {
  throw new Error(`Production Saju smoke current Birth Profile expected HTTP 200, received ${birthProfileResponse.status}.`);
}
const birthProfileBody = await readJsonWithoutLogging(
  birthProfileResponse,
  'Production Saju smoke current Birth Profile',
);
requireApiContract(birthProfileBody, 'Production Saju smoke current Birth Profile');
if (birthProfileBody.ok !== true) {
  throw new Error('Production Saju smoke current Birth Profile did not return ok=true.');
}
const birthProfileData = requireRecord(
  'Production Saju smoke current Birth Profile data',
  birthProfileBody.data,
);
const birthProfile = requireRecord(
  'Production Saju smoke current Birth Profile',
  birthProfileData.birthProfile,
);
requireUuid('Production Saju smoke Birth Profile id', birthProfile.birthProfileId);
if (birthProfile.profileKind !== 'self') {
  throw new Error('Production Saju smoke current Birth Profile must be the self profile.');
}
if (birthProfile.archivedAt !== null) {
  throw new Error('Production Saju smoke current Birth Profile must not be archived.');
}
const currentRevision = requireRecord(
  'Production Saju smoke current Birth Profile revision',
  birthProfile.currentRevision,
);
requireUuid('Production Saju smoke current Birth revision id', currentRevision.revisionId);
requirePositiveInteger('Production Saju smoke current Birth revision number', currentRevision.revisionNo);
requireRecord('Production Saju smoke current Birth input', currentRevision.input);
if (!Array.isArray(birthProfile.revisions) || birthProfile.revisions.length === 0) {
  throw new Error('Production Saju smoke current Birth Profile must expose revision summaries.');
}
const matchingCurrentRevisions = birthProfile.revisions.filter(
  (revision) =>
    isRecord(revision) &&
    revision.isCurrent === true &&
    revision.revisionId === currentRevision.revisionId &&
    revision.revisionNo === currentRevision.revisionNo,
);
if (matchingCurrentRevisions.length !== 1) {
  throw new Error('Production Saju smoke current Birth Profile revision summary does not match the current revision.');
}

function validateCalculationBody(calculationBody, label) {
  const meta = requireApiContract(calculationBody, label);
  if (calculationBody.ok !== true) throw new Error(`${label} did not return ok=true.`);
  requireUuid(`${label} requestId`, meta.requestId);
  requireTimestamp(`${label} serverTime`, meta.serverTime);

  const data = requireRecord(`${label} data`, calculationBody.data);
  const calculation = requireRecord(`${label} calculation artifact`, data.calculation);
  requireExact(
    'calculation.schemaVersion',
    calculation.schemaVersion,
    'myeongha-saju-production-calculation-ingress-v1',
  );
  requireExact('calculation.kind', calculation.kind, 'saju_calculation_evidence');
  requireExact('calculation.semanticAuthority', calculation.semanticAuthority, 'calculation_only');
  requireExact('calculation.interpretationAuthorized', calculation.interpretationAuthorized, false);
  requireExact('calculation.birthRevisionRef', calculation.birthRevisionRef, currentRevision.revisionId);

  const source = requireRecord('calculation.source', calculation.source);
  requireExact(
    'calculation.source.responseSchemaVersion',
    source.responseSchemaVersion,
    'myeonghwa-production-calculation-http-v1',
  );
  requireExact(
    'calculation.source.runtimeVersion',
    source.runtimeVersion,
    'myeonghwa-production-calculation-runtime-v1',
  );
  requireExact(
    'calculation.source.calculationPolicyId',
    source.calculationPolicyId,
    'myeonghwa-production-civil-midnight-v1',
  );
  requireExact(
    'calculation.source.authorizationId',
    source.authorizationId,
    'myeonghwa-production-calculation-default-authorization-v1',
  );
  requireExact(
    'calculation.source.authorityRecordRef',
    source.authorityRecordRef,
    'docs/decisions/ADR-0006-production-calculation-default-v1.md',
  );
  requireExact(
    'calculation.source.policyVersion',
    source.policyVersion,
    'myeonghwa-production-calculation-policy-v1',
  );
  requireNonEmptyString('calculation.source.contentHash', source.contentHash);

  const snapshot = requireRecord('calculation.snapshot', calculation.snapshot);
  requireNonEmptyString('calculation.snapshot.snapshotId', snapshot.snapshotId);
  requireNonEmptyString('calculation.snapshot.schemaVersion', snapshot.schemaVersion);
  requireNonEmptyString('calculation.snapshot.calculationHash', snapshot.calculationHash);
  requireTimestamp('calculation.snapshot.createdAt', snapshot.createdAt);

  const policy = requireRecord('calculation.snapshot.policy', snapshot.policy);
  requireExact('calculation.snapshot.policy.policyId', policy.policyId, 'myeonghwa/production/civil-midnight-v1');
  requireExact(
    'calculation.snapshot.policy.policyVersion',
    policy.policyVersion,
    'myeonghwa-production-calculation-policy-v1',
  );
  requireExact('calculation.snapshot.policy.dayBoundary', policy.dayBoundary, 'midnight');

  const pillars = requireRecord('calculation.snapshot.pillars', snapshot.pillars);
  for (const pillar of ['year', 'month', 'day', 'hour']) {
    requirePillarState(`calculation.snapshot.pillars.${pillar}`, pillars[pillar]);
  }

  const completeness = requireRecord('calculation.snapshot.completeness', snapshot.completeness);
  if (typeof completeness.birthTimeKnown !== 'boolean' || typeof completeness.fullyResolved !== 'boolean') {
    throw new Error('calculation.snapshot.completeness flags must be boolean.');
  }
  requireStringArray('calculation.snapshot.completeness.resolvedPaths', completeness.resolvedPaths);
  requireStringArray('calculation.snapshot.completeness.ambiguousPaths', completeness.ambiguousPaths);
  requireStringArray('calculation.snapshot.completeness.unavailablePaths', completeness.unavailablePaths);

  const provenance = requireRecord('calculation.snapshot.provenance', snapshot.provenance);
  for (const name of ['engine', 'adapter', 'policy', 'schema']) {
    requireRecord(`calculation.snapshot.provenance.${name}`, provenance[name]);
  }
  requireNonEmptyString('calculation.snapshot.provenance.engine.name', provenance.engine.name);
  requireNonEmptyString('calculation.snapshot.provenance.engine.version', provenance.engine.version);
  requireNonEmptyString('calculation.snapshot.provenance.adapter.name', provenance.adapter.name);
  requireNonEmptyString('calculation.snapshot.provenance.adapter.version', provenance.adapter.version);
  requireExact(
    'calculation.snapshot.provenance.policy.id',
    provenance.policy.id,
    'myeonghwa/production/civil-midnight-v1',
  );
  requireExact(
    'calculation.snapshot.provenance.policy.version',
    provenance.policy.version,
    'myeonghwa-production-calculation-policy-v1',
  );
  requireNonEmptyString('calculation.snapshot.provenance.schema.id', provenance.schema.id);
  requireNonEmptyString('calculation.snapshot.provenance.schema.version', provenance.schema.version);

  return Object.freeze({
    body: calculationBody,
    stableEvidence: buildStableEvidence({
      calculation,
      source,
      snapshot,
      policy,
      pillars,
      completeness,
      provenance,
    }),
  });
}

async function requestCalculation(label) {
  const response = await fetchCanonical(SAJU_CALCULATION_URL, {
    method: 'POST',
    headers: authorization,
  });
  requireNoStore(response, label);
  requireJsonContentType(response, label);
  if (response.status !== 200) {
    throw new Error(`${label} expected HTTP 200, received ${response.status}.`);
  }
  const body = await readJsonWithoutLogging(response, label);
  return validateCalculationBody(body, label);
}

const firstCalculation = await requestCalculation('Production current-subject Saju calculation first');
const repeatCalculation = await requestCalculation('Production current-subject Saju calculation repeat');

if (stableSerialize(firstCalculation.stableEvidence) !== stableSerialize(repeatCalculation.stableEvidence)) {
  throw new Error('Production current-subject Saju deterministic repeat evidence changed within the same fresh Member session.');
}

if (
  JSON.stringify(memberBody).includes(accessToken) ||
  JSON.stringify(birthProfileBody).includes(accessToken) ||
  JSON.stringify(firstCalculation.body).includes(accessToken) ||
  JSON.stringify(repeatCalculation.body).includes(accessToken)
) {
  throw new Error('Production current-subject Saju response reflected the fresh Member access token.');
}

console.log(
  'MyeongHa production current-subject Saju smoke passed: memberSignIn=200, freshSession=true, memberSubjectMatch=true, birthProfilePresent=true, birthRevisionMatch=true, calculationFirst=200, calculationRepeat=200, deterministicRepeat=true, authority=calculation_only, ingressContract=v1, cacheControl=no-store.',
);
