import { readFile } from 'node:fs/promises';

const policyPath = 'config/operations/authenticated-json-request-resource-policy-v1.json';
const docsPath = 'docs/operations/AUTHENTICATED_JSON_REQUEST_RESOURCE_POLICY_V1.md';
const apiContractPath = 'docs/API_CONTRACT.md';

const runtimePath = 'apps/api/src/authenticated-json-request-resource.ts';
const birthHttpPath = 'apps/api/src/birth-profile-create-http.ts';
const birthCommandPath = 'apps/api/src/birth-profile-create-command.ts';
const chatBodyPath = 'apps/api/src/chat-open-request-body.ts';
const chatHttpPath = 'apps/api/src/chat-open-http.ts';
const readingHttpPath = 'apps/api/src/reading-create-http.ts';
const readingCommandPath = 'apps/api/src/reading-create-command.ts';
const birthAdapterPath = 'api/birth-profiles.ts';
const productionWorkflowPath = '.github/workflows/production-authenticated-json-resource-evidence.yml';
const productionVerifierPath = 'scripts/operations/verify-production-authenticated-json-resource-live.mjs';

const [
  policyRaw,
  docs,
  apiContract,
  runtime,
  birthHttp,
  birthCommand,
  chatBody,
  chatHttp,
  readingHttp,
  readingCommand,
  birthAdapter,
  productionWorkflow,
  productionVerifier,
] = await Promise.all([
  readFile(policyPath, 'utf8'),
  readFile(docsPath, 'utf8'),
  readFile(apiContractPath, 'utf8'),
  readFile(runtimePath, 'utf8'),
  readFile(birthHttpPath, 'utf8'),
  readFile(birthCommandPath, 'utf8'),
  readFile(chatBodyPath, 'utf8'),
  readFile(chatHttpPath, 'utf8'),
  readFile(readingHttpPath, 'utf8'),
  readFile(readingCommandPath, 'utf8'),
  readFile(birthAdapterPath, 'utf8'),
  readFile(productionWorkflowPath, 'utf8'),
  readFile(productionVerifierPath, 'utf8'),
]);

const policy = JSON.parse(policyRaw);

const expectedTopLevel = {
  contractVersion: 'myeongha-authenticated-json-request-resource-policy-v1',
  maximumBodyBytes: 16384,
  bodyByteUnit: 'utf8_octets',
  overLimitHttpStatus: 413,
  overLimitErrorCode: 'REQUEST_TOO_LARGE',
  authenticationOrder: 'verify_identity_before_body_consumption',
  contentLengthAuthority: 'early_rejection_hint_only_stream_count_is_final',
  preparsedAdapterGuarantee: 'after_authentication_no_unbounded_secondary_serialization',
  malformedJsonErrorCode: 'INVALID_REQUEST',
  semanticContractsOtherwiseUnchanged: true,
};

for (const [key, value] of Object.entries(expectedTopLevel)) {
  if (JSON.stringify(policy[key]) !== JSON.stringify(value)) {
    throw new Error(`${policyPath} has unexpected ${key}: ${JSON.stringify(policy[key])}`);
  }
}

const expectedRoutes = {
  birthProfileCreate: {
    route: '/api/birth-profiles',
    method: 'POST',
    productionExposure: 'active',
    bodyMode: 'streaming_runtime_with_preparsed_vercel_adapter',
    fields: {
      label: { maximumUtf8Bytes: 512, nullable: true },
    },
  },
  chatOpen: {
    route: '/api/chat',
    method: 'POST',
    productionExposure: 'active',
    bodyMode: 'streaming',
    fields: {
      characterId: { authority: 'existing_finite_allowlist' },
    },
  },
  readingCreate: {
    route: '/api/readings',
    method: 'POST',
    productionExposure: 'dormant',
    bodyMode: 'streaming',
    fields: {
      idempotencyKey: { maximumUtf8Bytes: 128 },
      sourceBirthProfileId: { maximumUtf8Bytes: 128 },
    },
  },
};

if (JSON.stringify(policy.routes) !== JSON.stringify(expectedRoutes)) {
  throw new Error(`${policyPath} route contract drifted.`);
}

function requireFragment(name, source, fragment) {
  if (!source.includes(fragment)) {
    throw new Error(`${name} missing required fragment: ${fragment}`);
  }
}

for (const fragment of [
  'Status: **APPROVED IMPLEMENTATION AUTHORITY**',
  '16 KiB = 16,384 UTF-8 octets',
  'Birth Profile label maximum                 = 512 UTF-8 octets',
  'Reading idempotencyKey maximum              = 128 UTF-8 octets',
  'Reading sourceBirthProfileId maximum        = 128 UTF-8 octets',
  'HTTP status = 413',
  'error.code  = REQUEST_TOO_LARGE',
  'Content-Length',
  'verify request identity',
  'bounded serialization/counting',
  'hosting platform',
  'dormant / not currently a create route',
  'exact-head Production evidence',
  'Upstream JSON response bounds are tracked separately by #700.',
]) {
  requireFragment(docsPath, docs, fragment);
}

for (const fragment of [
  'AUTHENTICATED_JSON_REQUEST_RESOURCE_POLICY_V1.md',
  'maximum body = 16,384 UTF-8 bytes',
  '413 REQUEST_TOO_LARGE',
  'Birth label = maximum 512 UTF-8 bytes',
  'Reading idempotencyKey = maximum 128 UTF-8 bytes',
  'Reading sourceBirthProfileId = maximum 128 UTF-8 bytes',
  'Reading create remains dormant',
  'Content-Length is an early-rejection hint only',
]) {
  requireFragment(apiContractPath, apiContract, fragment);
}


for (const fragment of [
  'AUTHENTICATED_JSON_REQUEST_MAXIMUM_BODY_BYTES_V1 = 16_384',
  'BIRTH_PROFILE_LABEL_MAXIMUM_UTF8_BYTES_V1 = 512',
  'READING_IDEMPOTENCY_KEY_MAXIMUM_UTF8_BYTES_V1 = 128',
  'READING_SOURCE_BIRTH_PROFILE_ID_MAXIMUM_UTF8_BYTES_V1 = 128',
  'AuthenticatedJsonRequestBodyTooLargeV1',
  'totalBytes = addBounded(',
  'reader.releaseLock()',
  'serializePreparsedJsonBodyBoundedV1',
  'measureJsonUtf8BytesBoundedV1(',
]) {
  requireFragment(runtimePath, runtime, fragment);
}

for (const [name, source] of [
  [birthHttpPath, birthHttp],
  [readingHttpPath, readingHttp],
]) {
  requireFragment(name, source, 'readAuthenticatedJsonRequestBodyV1(input.request)');
  requireFragment(name, source, "status: 413");
  requireFragment(name, source, "code: 'REQUEST_TOO_LARGE'");
  if (source.includes('input.request.json()')) {
    throw new Error(`${name} regressed to unbounded Request.json() body consumption.`);
  }
}

for (const fragment of [
  'readAuthenticatedJsonRequestBodyV1(request',
  'deadline.waitFor(pending)',
]) {
  requireFragment(chatBodyPath, chatBody, fragment);
}
for (const fragment of [
  'AuthenticatedJsonRequestBodyTooLargeV1',
  "status: 413",
  "code: 'REQUEST_TOO_LARGE'",
]) {
  requireFragment(chatHttpPath, chatHttp, fragment);
}
for (const fragment of [
  'BIRTH_PROFILE_LABEL_MAXIMUM_UTF8_BYTES_V1',
  'utf8ByteLengthV1(label)',
]) {
  requireFragment(birthCommandPath, birthCommand, fragment);
}
for (const fragment of [
  'READING_IDEMPOTENCY_KEY_MAXIMUM_UTF8_BYTES_V1',
  'READING_SOURCE_BIRTH_PROFILE_ID_MAXIMUM_UTF8_BYTES_V1',
  'utf8ByteLengthV1(value)',
]) {
  requireFragment(readingCommandPath, readingCommand, fragment);
}
for (const fragment of [
  'serializePreparsedJsonBodyBoundedV1',
  'createLazySerializedCreateBody',
  "headers.delete('content-length')",
]) {
  requireFragment(birthAdapterPath, birthAdapter, fragment);
}
if (birthAdapter.includes('JSON.stringify(body)')) {
  throw new Error(`${birthAdapterPath} regressed to unbounded direct parsed-body serialization.`);
}

for (const fragment of [
  'workflow_dispatch:',
  'watchtower_track:',
  'default: ops',
  'environment: production',
  'MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_BEARER',
  'node scripts/operations/verify-production-authenticated-json-resource-live.mjs',
]) {
  requireFragment(productionWorkflowPath, productionWorkflow, fragment);
}
for (const fragment of [
  "GITHUB_REF !== 'refs/heads/main'",
  "GITHUB_EVENT_NAME !== 'workflow_dispatch'",
  "'x'.repeat(17_000)",
  "response.status !== 413",
  "payload.error.code !== 'REQUEST_TOO_LARGE'",
  "authenticated_json_resource_evidence=pass",
  "request_body_logged=false",
  "credential_logged=false",
]) {
  requireFragment(productionVerifierPath, productionVerifier, fragment);
}
for (const forbidden of [
  'console.log(bearer',
  'console.log(birthBody',
  'console.log(chatBody',
  'access_token',
  'refresh_token',
]) {
  if (productionVerifier.includes(forbidden)) {
    throw new Error(`${productionVerifierPath} contains forbidden evidence material: ${forbidden}`);
  }
}

console.log(
  'MyeongHa authenticated JSON request resource policy v1 verification passed: 16 KiB body ceiling, explicit Birth/Reading string bounds, auth-before-body ordering, 413 resource failure, and bounded pre-parsed adapter guarantee are pinned.',
);
