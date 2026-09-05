import { createHash } from 'node:crypto';
import { acquireProductionMemberSmokeSession } from './production-member-smoke-session.mjs';

const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';
const SIGN_OUT_URL = `${PRODUCTION_ORIGIN}/api/auth/sign-out`;
const MEMBER_ME_URL = `${PRODUCTION_ORIGIN}/api/me`;
const BIRTH_PROFILE_URL = `${PRODUCTION_ORIGIN}/api/me/birth-profile`;
const SAJU_CALCULATION_URL = `${PRODUCTION_ORIGIN}/api/me/saju/calculation`;
const LIFE_RECORD_URL = `${PRODUCTION_ORIGIN}/api/life-record`;
const MEMORIES_URL = `${PRODUCTION_ORIGIN}/api/memories`;
const REQUEST_TIMEOUT_MS = 20_000;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(name, value) {
  if (!isRecord(value)) throw new Error(`${name} must be an object.`);
  return value;
}

function requireArray(name, value) {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array.`);
  return value;
}

function requireSecret(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required for the production Member reauthentication continuity smoke.`);
  }
  return value.trim();
}

function requireUuid(name, value) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)
  ) {
    throw new Error(`${name} must be a UUID.`);
  }
  return value;
}

function requireNullableUuid(name, value) {
  if (value === null) return null;
  return requireUuid(name, value);
}

function requirePositiveInteger(name, value) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function requireStoredString(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value;
}

function requireTimestamp(name, value) {
  const stored = requireStoredString(name, value);
  if (!Number.isFinite(Date.parse(stored))) {
    throw new Error(`${name} must be a timestamp.`);
  }
  return stored;
}

function requireNullableTimestamp(name, value) {
  if (value === null) return null;
  return requireTimestamp(name, value);
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

function requireApiContract(body, label) {
  const meta = requireRecord(`${label} meta`, body.meta);
  if (meta.apiContractVersion !== 'v0.9') {
    throw new Error(`${label} did not return API contract v0.9.`);
  }
}

function requireNoTokenReflection(token, values, label) {
  for (const value of values) {
    if (JSON.stringify(value).includes(token)) {
      throw new Error(`${label} reflected a fresh Member access token.`);
    }
  }
}

function canonicalizeJson(value, label) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalizeJson(item, `${label}[${index}]`));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalizeJson(value[key], `${label}.${key}`)]),
    );
  }
  throw new Error(`${label} must be valid JSON data.`);
}

function digestCanonicalSnapshot(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function buildLifeRecordDigest(data, label) {
  const facts = requireArray(`${label} facts`, data.facts);
  const seenIds = new Set();
  const stableFacts = facts.map((value, index) => {
    const fact = requireRecord(`${label} fact ${index}`, value);
    const lifeFactId = requireUuid(`${label} fact identity`, fact.lifeFactId);
    if (seenIds.has(lifeFactId)) throw new Error(`${label} returned duplicate Life Fact identities.`);
    seenIds.add(lifeFactId);
    if (fact.valueJsonb === undefined) throw new Error(`${label} fact value must be present.`);

    return {
      lifeFactId,
      factType: requireStoredString(`${label} fact type`, fact.factType),
      schemaVersion: requireStoredString(`${label} fact schema version`, fact.schemaVersion),
      valueJsonb: canonicalizeJson(fact.valueJsonb, `${label} fact value`),
      validFrom: requireNullableTimestamp(`${label} fact valid-from`, fact.validFrom),
      validTo: requireNullableTimestamp(`${label} fact valid-to`, fact.validTo),
      sourceKind: requireStoredString(`${label} fact source kind`, fact.sourceKind),
      sourceMessageId: requireNullableUuid(`${label} fact source message`, fact.sourceMessageId),
      sourceMergeActionId: requireNullableUuid(
        `${label} fact source merge action`,
        fact.sourceMergeActionId,
      ),
      supersedesFactId: requireNullableUuid(`${label} superseded fact`, fact.supersedesFactId),
      confirmedAt: requireTimestamp(`${label} fact confirmed-at`, fact.confirmedAt),
      revokedAt: requireNullableTimestamp(`${label} fact revoked-at`, fact.revokedAt),
      createdAt: requireTimestamp(`${label} fact created-at`, fact.createdAt),
    };
  });

  stableFacts.sort((left, right) => left.lifeFactId.localeCompare(right.lifeFactId));
  return digestCanonicalSnapshot(stableFacts);
}

function buildMemoriesDigest(data, label) {
  const memories = requireArray(`${label} memories`, data.memories);
  const seenIds = new Set();
  const stableMemories = memories.map((value, index) => {
    const memory = requireRecord(`${label} memory ${index}`, value);
    const memoryItemId = requireUuid(`${label} memory identity`, memory.memoryItemId);
    if (seenIds.has(memoryItemId)) throw new Error(`${label} returned duplicate Memory Item identities.`);
    seenIds.add(memoryItemId);
    if (memory.contentJsonb === undefined) throw new Error(`${label} memory content must be present.`);

    return {
      memoryItemId,
      memoryType: requireStoredString(`${label} memory type`, memory.memoryType),
      schemaVersion: requireStoredString(`${label} memory schema version`, memory.schemaVersion),
      contentJsonb: canonicalizeJson(memory.contentJsonb, `${label} memory content`),
      createdByCharacterId: requireNullableUuid(
        `${label} memory creator character`,
        memory.createdByCharacterId,
      ),
      createdAt: requireTimestamp(`${label} memory created-at`, memory.createdAt),
    };
  });

  stableMemories.sort((left, right) => left.memoryItemId.localeCompare(right.memoryItemId));
  return digestCanonicalSnapshot(stableMemories);
}

async function readOwnerRecords(accessToken, label) {
  const authorization = { Authorization: `Bearer ${accessToken}` };

  const lifeRecordResponse = await fetchCanonical(LIFE_RECORD_URL, {
    method: 'GET',
    headers: authorization,
  });
  requireNoStore(lifeRecordResponse, `${label} Life Record`);
  requireJsonContentType(lifeRecordResponse, `${label} Life Record`);
  if (lifeRecordResponse.status !== 200) {
    throw new Error(`${label} Life Record expected HTTP 200, received ${lifeRecordResponse.status}.`);
  }
  const lifeRecordBody = await readJsonWithoutLogging(lifeRecordResponse, `${label} Life Record`);
  requireApiContract(lifeRecordBody, `${label} Life Record`);
  if (lifeRecordBody.ok !== true) throw new Error(`${label} Life Record did not return ok=true.`);
  const lifeRecordData = requireRecord(`${label} Life Record data`, lifeRecordBody.data);
  const lifeRecordDigest = buildLifeRecordDigest(lifeRecordData, `${label} Life Record`);

  const memoriesResponse = await fetchCanonical(MEMORIES_URL, {
    method: 'GET',
    headers: authorization,
  });
  requireNoStore(memoriesResponse, `${label} Memories`);
  requireJsonContentType(memoriesResponse, `${label} Memories`);
  if (memoriesResponse.status !== 200) {
    throw new Error(`${label} Memories expected HTTP 200, received ${memoriesResponse.status}.`);
  }
  const memoriesBody = await readJsonWithoutLogging(memoriesResponse, `${label} Memories`);
  requireApiContract(memoriesBody, `${label} Memories`);
  if (memoriesBody.ok !== true) throw new Error(`${label} Memories did not return ok=true.`);
  const memoriesData = requireRecord(`${label} Memories data`, memoriesBody.data);
  const memoriesDigest = buildMemoriesDigest(memoriesData, `${label} Memories`);

  requireNoTokenReflection(accessToken, [lifeRecordBody, memoriesBody], `${label} Records`);

  return Object.freeze({ lifeRecordDigest, memoriesDigest });
}

async function verifyAuthenticatedContinuityPoint(accessToken, label, expectedSubjectId) {
  const authorization = { Authorization: `Bearer ${accessToken}` };

  const memberResponse = await fetchCanonical(MEMBER_ME_URL, {
    method: 'GET',
    headers: authorization,
  });
  requireNoStore(memberResponse, `${label} Member /api/me`);
  requireJsonContentType(memberResponse, `${label} Member /api/me`);
  if (memberResponse.status !== 200) {
    throw new Error(`${label} Member /api/me expected HTTP 200, received ${memberResponse.status}.`);
  }
  const memberBody = await readJsonWithoutLogging(memberResponse, `${label} Member /api/me`);
  requireApiContract(memberBody, `${label} Member /api/me`);
  if (memberBody.ok !== true) throw new Error(`${label} Member /api/me did not return ok=true.`);
  const memberData = requireRecord(`${label} Member data`, memberBody.data);
  if (memberData.subjectKind !== 'member') throw new Error(`${label} resolved a non-Member subject.`);
  if (memberData.subjectStatus !== 'active') throw new Error(`${label} Member subject must be active.`);
  if (memberData.subjectId !== expectedSubjectId) {
    throw new Error(`${label} resolved a different canonical subject than expected.`);
  }

  const birthResponse = await fetchCanonical(BIRTH_PROFILE_URL, {
    method: 'GET',
    headers: authorization,
  });
  requireNoStore(birthResponse, `${label} current Birth Profile`);
  requireJsonContentType(birthResponse, `${label} current Birth Profile`);
  if (birthResponse.status !== 200) {
    throw new Error(`${label} current Birth Profile expected HTTP 200, received ${birthResponse.status}.`);
  }
  const birthBody = await readJsonWithoutLogging(birthResponse, `${label} current Birth Profile`);
  requireApiContract(birthBody, `${label} current Birth Profile`);
  if (birthBody.ok !== true) throw new Error(`${label} current Birth Profile did not return ok=true.`);
  const birthData = requireRecord(`${label} current Birth Profile data`, birthBody.data);
  const birthProfile = requireRecord(`${label} current Birth Profile`, birthData.birthProfile);
  const birthProfileId = requireUuid(`${label} Birth Profile id`, birthProfile.birthProfileId);
  if (birthProfile.profileKind !== 'self') throw new Error(`${label} current Birth Profile must be self.`);
  if (birthProfile.archivedAt !== null) throw new Error(`${label} current Birth Profile must not be archived.`);
  const currentRevision = requireRecord(`${label} current Birth revision`, birthProfile.currentRevision);
  const revisionId = requireUuid(`${label} current Birth revision id`, currentRevision.revisionId);
  const revisionNo = requirePositiveInteger(`${label} current Birth revision number`, currentRevision.revisionNo);
  requireRecord(`${label} current Birth input`, currentRevision.input);

  const calculationResponse = await fetchCanonical(SAJU_CALCULATION_URL, {
    method: 'POST',
    headers: authorization,
  });
  requireNoStore(calculationResponse, `${label} Saju calculation`);
  requireJsonContentType(calculationResponse, `${label} Saju calculation`);
  if (calculationResponse.status !== 200) {
    throw new Error(`${label} Saju calculation expected HTTP 200, received ${calculationResponse.status}.`);
  }
  const calculationBody = await readJsonWithoutLogging(calculationResponse, `${label} Saju calculation`);
  requireApiContract(calculationBody, `${label} Saju calculation`);
  if (calculationBody.ok !== true) throw new Error(`${label} Saju calculation did not return ok=true.`);
  const calculationData = requireRecord(`${label} Saju data`, calculationBody.data);
  const calculation = requireRecord(`${label} Saju calculation artifact`, calculationData.calculation);
  if (calculation.schemaVersion !== 'myeongha-saju-production-calculation-ingress-v1') {
    throw new Error(`${label} Saju calculation schemaVersion is outside the production ingress contract.`);
  }
  if (calculation.kind !== 'saju_calculation_evidence') {
    throw new Error(`${label} Saju calculation kind is outside the production contract.`);
  }
  if (calculation.semanticAuthority !== 'calculation_only' || calculation.interpretationAuthorized !== false) {
    throw new Error(`${label} Saju calculation semantic authority widened unexpectedly.`);
  }
  if (calculation.birthRevisionRef !== revisionId) {
    throw new Error(`${label} Saju calculation did not use the current Birth revision.`);
  }

  const records = await readOwnerRecords(accessToken, label);
  requireNoTokenReflection(accessToken, [memberBody, birthBody, calculationBody], label);

  return Object.freeze({
    subjectId: memberData.subjectId,
    birthProfileId,
    revisionId,
    revisionNo,
    lifeRecordDigest: records.lifeRecordDigest,
    memoriesDigest: records.memoriesDigest,
  });
}

async function signOutFreshSession(accessToken) {
  const response = await fetchCanonical(SIGN_OUT_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: '{}',
  });
  requireNoStore(response, 'Production Member sign-out');
  requireJsonContentType(response, 'Production Member sign-out');
  if (response.status !== 200) {
    throw new Error(`Production Member sign-out expected HTTP 200, received ${response.status}.`);
  }
  const body = await readJsonWithoutLogging(response, 'Production Member sign-out');
  if (body.ok !== true) throw new Error('Production Member sign-out did not return ok=true.');
  const data = requireRecord('Production Member sign-out data', body.data);
  if (data.signedOut !== true) throw new Error('Production Member sign-out did not confirm signedOut=true.');
  requireNoTokenReflection(accessToken, [body], 'Production Member sign-out');
}

const expectedSubjectId = requireUuid(
  'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID',
  requireSecret('MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID'),
);

const firstSession = await acquireProductionMemberSmokeSession();
const beforeSignOut = await verifyAuthenticatedContinuityPoint(
  firstSession.accessToken,
  'Production Member pre-sign-out continuity point',
  expectedSubjectId,
);

await signOutFreshSession(firstSession.accessToken);

const secondSession = await acquireProductionMemberSmokeSession();
const afterReSignIn = await verifyAuthenticatedContinuityPoint(
  secondSession.accessToken,
  'Production Member post-re-sign-in continuity point',
  expectedSubjectId,
);

if (afterReSignIn.subjectId !== beforeSignOut.subjectId) {
  throw new Error('Production Member canonical subject changed across sign-out and re-sign-in.');
}
if (afterReSignIn.birthProfileId !== beforeSignOut.birthProfileId) {
  throw new Error('Production Member self Birth Profile changed across sign-out and re-sign-in.');
}
if (
  afterReSignIn.revisionId !== beforeSignOut.revisionId ||
  afterReSignIn.revisionNo !== beforeSignOut.revisionNo
) {
  throw new Error('Production Member current Birth revision changed across sign-out and re-sign-in.');
}
if (afterReSignIn.lifeRecordDigest !== beforeSignOut.lifeRecordDigest) {
  throw new Error('Production Member Life Record owner snapshot changed across sign-out and re-sign-in.');
}
if (afterReSignIn.memoriesDigest !== beforeSignOut.memoriesDigest) {
  throw new Error('Production Member Memories owner snapshot changed across sign-out and re-sign-in.');
}

console.log(
  'MyeongHa production Member reauthentication continuity smoke passed: firstSignIn=200, lifeRecordBefore=200, memoriesBefore=200, signOut=200, secondSignIn=200, memberSubjectPreserved=true, birthProfilePreserved=true, birthRevisionPreserved=true, calculationAfterReSignIn=200, lifeRecordAfterReSignIn=200, memoriesAfterReSignIn=200, recordsPreserved=true, authority=calculation_only, cacheControl=no-store.',
);
