import { readFile } from 'node:fs/promises';

const policyPath = 'config/operations/upstream-json-response-resource-policy-v1.json';
const docsPath = 'docs/operations/UPSTREAM_JSON_RESPONSE_RESOURCE_POLICY_V1.md';
const apiContractPath = 'docs/API_CONTRACT.md';
const runtimePath = 'apps/api/src/upstream-json-response-resource.ts';
const authPath = 'apps/api/src/supabase-auth-http.ts';
const memberPath = 'apps/api/src/supabase-member-identity-verifier.ts';
const sajuPath = 'apps/api/src/saju-production-calculation-http-adapter.ts';
const runtimeTestPath = 'apps/api/src/upstream-json-response-resource.test.ts';
const authResourceTestPath = 'apps/api/src/supabase-auth-response-resource.test.ts';
const memberTestPath = 'apps/api/src/supabase-member-identity-verifier.test.ts';
const sajuResourceTestPath = 'test/saju-production-calculation-response-resource.test.ts';

const [
  policyRaw,
  docs,
  apiContract,
  runtime,
  auth,
  member,
  saju,
  runtimeTest,
  authResourceTest,
  memberTest,
  sajuResourceTest,
] = await Promise.all([
  readFile(policyPath, 'utf8'),
  readFile(docsPath, 'utf8'),
  readFile(apiContractPath, 'utf8'),
  readFile(runtimePath, 'utf8'),
  readFile(authPath, 'utf8'),
  readFile(memberPath, 'utf8'),
  readFile(sajuPath, 'utf8'),
  readFile(runtimeTestPath, 'utf8'),
  readFile(authResourceTestPath, 'utf8'),
  readFile(memberTestPath, 'utf8'),
  readFile(sajuResourceTestPath, 'utf8'),
]);

const policy = JSON.parse(policyRaw);

const expected = {
  contractVersion: 'myeongha-upstream-json-response-resource-policy-v1',
  responseByteUnit: 'application_visible_octets',
  contentLengthAuthority: 'early_rejection_hint_only_stream_count_is_final',
  encodedContentLengthAuthority: 'not_an_application_visible_size_approval_signal',
  cancellation: 'best_effort_non_blocking',
  existingDeadlinesRemainAuthoritative: true,
  boundaries: {
    supabaseAuth: {
      productionExposure: 'active',
      maximumBodyBytes: 131072,
      successActions: ['sign-in', 'sign-up', 'refresh'],
      statusOnlyActions: ['sign-out'],
      resourceFailure: {
        publicHttpStatus: 502,
        publicErrorCode: 'AUTH_UPSTREAM_MALFORMED',
      },
    },
    supabaseMember: {
      productionExposure: 'active',
      maximumBodyBytes: 65536,
      resourceFailure: {
        internalErrorCode: 'SUPABASE_MEMBER_VERIFIER_RESPONSE_INVALID',
      },
    },
    sajuCalculation: {
      productionExposure: 'active',
      maximumBodyBytes: 262144,
      resourceFailure: {
        internalErrorCode: 'RESPONSE_TOO_LARGE',
        publicErrorCode: 'SAJU_TEMPORARILY_UNAVAILABLE',
      },
    },
  },
  semanticContractsOtherwiseUnchanged: true,
};

if (JSON.stringify(policy) !== JSON.stringify(expected)) {
  throw new Error(`${policyPath} drifted from the approved V1 authority.`);
}

function requireFragment(name, source, fragment) {
  if (!source.includes(fragment)) {
    throw new Error(`${name} missing required fragment: ${fragment}`);
  }
}

for (const fragment of [
  'Status: **APPROVED IMPLEMENTATION AUTHORITY**',
  '128 KiB = 131,072 application-visible octets',
  '64 KiB =  65,536 application-visible octets',
  '256 KiB = 262,144 application-visible octets',
  'Content-Length',
  'Content-Encoding',
  'Actual application-visible stream bytes are final authority.',
  'best-effort, non-blocking',
  'Sign-out is status-only',
  'AUTH_UPSTREAM_MALFORMED',
  'SUPABASE_MEMBER_VERIFIER_RESPONSE_INVALID',
  'RESPONSE_TOO_LARGE',
  'SAJU_TEMPORARILY_UNAVAILABLE',
  'exact-SHA Production verification',
  '#699 owns those separately',
]) {
  requireFragment(docsPath, docs, fragment);
}

for (const fragment of [
  'UPSTREAM_JSON_RESPONSE_RESOURCE_POLICY_V1.md',
  'Supabase Auth success JSON maximum = 131,072 application-visible bytes',
  'Supabase Member success JSON maximum = 65,536 application-visible bytes',
  'Saju calculation success JSON maximum = 262,144 application-visible bytes',
  'Content-Length is an early-rejection hint only',
  'existing upstream deadlines remain independently authoritative',
]) {
  requireFragment(apiContractPath, apiContract, fragment);
}


for (const fragment of [
  'SUPABASE_AUTH_JSON_RESPONSE_MAXIMUM_BYTES_V1 = 131_072',
  'SUPABASE_MEMBER_JSON_RESPONSE_MAXIMUM_BYTES_V1 = 65_536',
  'SAJU_CALCULATION_JSON_RESPONSE_MAXIMUM_BYTES_V1 = 262_144',
  'UpstreamJsonResponseTooLargeV1',
  'readBoundedUpstreamJsonTextV1',
  "response.headers.get('content-length')",
  "response.headers.get('content-encoding')",
  'value.byteLength > maximumBodyBytes - totalBytes',
  'void reader.cancel().catch(() => undefined)',
  'reader.releaseLock()',
  'new TextDecoder().decode(bytes)',
]) {
  requireFragment(runtimePath, runtime, fragment);
}

for (const fragment of [
  'SUPABASE_AUTH_JSON_RESPONSE_MAXIMUM_BYTES_V1',
  'readBoundedUpstreamJsonTextV1(deadline.response',
  "responseMode: 'json' | 'status-only' = 'json'",
  "}, 'status-only');",
  "errorResponse('AUTH_UPSTREAM_MALFORMED', 502)",
]) {
  requireFragment(authPath, auth, fragment);
}
if (auth.includes('deadline.response.json()')) {
  throw new Error(`${authPath} regressed to unbounded successful Response.json() consumption.`);
}

for (const fragment of [
  'SUPABASE_MEMBER_JSON_RESPONSE_MAXIMUM_BYTES_V1',
  'readBoundedUpstreamJsonTextV1(response',
  'SUPABASE_MEMBER_VERIFIER_RESPONSE_INVALID',
]) {
  requireFragment(memberPath, member, fragment);
}
if (member.includes('payload = await response.json()')) {
  throw new Error(`${memberPath} regressed to unbounded successful Response.json() consumption.`);
}

for (const fragment of [
  'SAJU_CALCULATION_JSON_RESPONSE_MAXIMUM_BYTES_V1',
  'readBoundedUpstreamJsonTextV1(response',
  "'RESPONSE_TOO_LARGE'",
  'signal: controller.signal',
  'ingestAuthorizedSajuProductionCalculationV1',
]) {
  requireFragment(sajuPath, saju, fragment);
}
if (saju.includes('response.text()')) {
  throw new Error(`${sajuPath} regressed to unbounded successful Response.text() consumption.`);
}

for (const [name, source, fragments] of [
  [runtimeTestPath, runtimeTest, [
    'accepts an exact-limit application-visible response',
    'rejects at the first chunk that crosses the ceiling and consumes no later chunk',
    'does not trust a falsely small Content-Length',
    'does not treat encoded Content-Length as application-visible acceptance authority',
    'body.locked',
  ]],
  [authResourceTestPath, authResourceTest, [
    'AUTH_UPSTREAM_MALFORMED',
    'SUPABASE_AUTH_JSON_RESPONSE_MAXIMUM_BYTES_V1 + 1',
  ]],
  [memberTestPath, memberTest, [
    'SUPABASE_MEMBER_JSON_RESPONSE_MAXIMUM_BYTES_V1 + 1',
    'SUPABASE_MEMBER_VERIFIER_RESPONSE_INVALID',
  ]],
  [sajuResourceTestPath, sajuResourceTest, [
    'SAJU_CALCULATION_JSON_RESPONSE_MAXIMUM_BYTES_V1 + 1',
    'RESPONSE_TOO_LARGE',
    'SAJU_TEMPORARILY_UNAVAILABLE',
  ]],
]) {
  for (const fragment of fragments) requireFragment(name, source, fragment);
}

console.log(
  'MyeongHa upstream JSON response resource policy v1 verification passed: Auth 128 KiB, Member 64 KiB, Saju 256 KiB, bounded streaming readers, non-blocking cleanup, and existing deadlines are pinned.',
);
