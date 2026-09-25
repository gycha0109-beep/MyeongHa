import { readFile } from 'node:fs/promises';

const policyPath = 'config/operations/upstream-json-response-resource-policy-v1.json';
const docsPath = 'docs/operations/UPSTREAM_JSON_RESPONSE_RESOURCE_POLICY_V1.md';
const apiContractPath = 'docs/API_CONTRACT.md';

const [policyRaw, docs, apiContract] = await Promise.all([
  readFile(policyPath, 'utf8'),
  readFile(docsPath, 'utf8'),
  readFile(apiContractPath, 'utf8'),
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
  'sign-out is status-only',
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

console.log(
  'MyeongHa upstream JSON response resource policy v1 authority verification passed: Auth 128 KiB, Member 64 KiB, Saju 256 KiB, application-visible stream bytes final, deadlines preserved.',
);
