import { readFile } from 'node:fs/promises';

const policyPath = 'config/operations/authenticated-json-request-resource-policy-v1.json';
const docsPath = 'docs/operations/AUTHENTICATED_JSON_REQUEST_RESOURCE_POLICY_V1.md';
const apiContractPath = 'docs/API_CONTRACT.md';

const [policyRaw, docs, apiContract] = await Promise.all([
  readFile(policyPath, 'utf8'),
  readFile(docsPath, 'utf8'),
  readFile(apiContractPath, 'utf8'),
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

console.log(
  'MyeongHa authenticated JSON request resource policy v1 verification passed: 16 KiB body ceiling, explicit Birth/Reading string bounds, auth-before-body ordering, 413 resource failure, and bounded pre-parsed adapter guarantee are pinned.',
);
