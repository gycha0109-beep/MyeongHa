import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectYeoulOpenRouterLivePreflight, YEOUL_STUDENT_MODEL }
  from './yeoul-openrouter-readonly-preflight-v1.mjs';

const ENDPOINT = {
  model_id: YEOUL_STUDENT_MODEL, tag: 'deepseek', provider_name: 'DeepSeek',
  status: 0, max_prompt_tokens: 8192, max_completion_tokens: 4096,
  supported_parameters: ['max_tokens'],
  pricing: { prompt: '0.00000005', completion: '0.00000060', request: '0' },
};
const endpointDoc = { data: { id: YEOUL_STUDENT_MODEL, endpoints: [ENDPOINT] } };
const zdrDoc = { data: [structuredClone(ENDPOINT)] };
const inferenceKey = { data: { is_management_key: false, limit_remaining: 1.25 } };
const creditDoc = { data: { total_credits: 10, total_usage: 1 } };

function stub({ overrides = {}, status = 200, seen = [] } = {}) {
  const responses = {
    '/api/v1/key': inferenceKey,
    '/api/v1/models/deepseek/deepseek-v4.1-flash-1017/endpoints': endpointDoc,
    '/api/v1/endpoints/zdr': zdrDoc,
    '/api/v1/credits': creditDoc,
    ...overrides,
  };
  return async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://openrouter.ai');
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.ok(options.headers.Authorization === 'Bearer test-key'
      || options.headers.Authorization === 'Bearer manager-key');
    seen.push(parsed.pathname);
    return new Response(JSON.stringify(responses[parsed.pathname]), {
      status, headers: { 'content-type': 'application/json' },
    });
  };
}

const config = { apiKey: 'test-key', managementKey: 'manager-key',
  providerTag: 'deepseek', nowEpoch: 1800000000, fetchImpl: stub() };

test('Only GET: authenticated model/ZDR, account credit and pinned candidate; never paid', async () => {
  const seen = [];
  const result = await inspectYeoulOpenRouterLivePreflight({
    ...config, fetchImpl: stub({ seen }),
  });
  assert.deepEqual(seen, ['/api/v1/key',
    '/api/v1/models/deepseek/deepseek-v4.1-flash-1017/endpoints',
    '/api/v1/endpoints/zdr', '/api/v1/credits']);
  assert.equal(result.modelId, YEOUL_STUDENT_MODEL);
  assert.equal(result.inferenceKeyVerified, true);
  assert.equal(result.existingCreditVerified, true);
  assert.equal(result.existingCreditPositive, true);
  assert.deepEqual(result.availableZdrProviderTags, ['deepseek']);
  assert.equal(result.selectedProviderEvidence.providerRoutingCandidate.allow_fallbacks, false);
  assert.equal(result.selectedProviderEvidence.pricingCompleteAndAuthoritative, false);
  assert.equal(result.paidExecutionReady, false);
  assert.equal(result.paidCompletionRequestsSent, 0);
  assert.equal(JSON.stringify(result).includes('test-key'), false);
  assert.equal(JSON.stringify(result).includes('manager-key'), false);
  assert.equal(JSON.stringify(result).includes('"total_credits"'), false);
});

test('No management key leaves credit unverified, never assumes account balance', async () => {
  const seen = [];
  const result = await inspectYeoulOpenRouterLivePreflight({
    ...config, managementKey: null, fetchImpl: stub({ seen }),
  });
  assert.equal(seen.includes('/api/v1/credits'), false);
  assert.equal(result.existingCreditVerified, false);
  assert.equal(result.existingCreditPositive, null);
  assert.equal(result.paidExecutionReady, false);
});

test('Missing selected provider does not invent a routable quote', async () => {
  const result = await inspectYeoulOpenRouterLivePreflight({
    ...config, providerTag: null,
  });
  assert.equal(result.selectedProviderEvidence, null);
  assert.deepEqual(result.availableZdrProviderTags, ['deepseek']);
});

test('ZDR loss, unsupported parameter and mismatched status fail closed', async () => {
  await assert.rejects(inspectYeoulOpenRouterLivePreflight({
    ...config, fetchImpl: stub({ overrides: { '/api/v1/endpoints/zdr': { data: [] } } }),
  }), /provider_zdr_unavailable/);
  await assert.rejects(inspectYeoulOpenRouterLivePreflight({
    ...config, requiredParameters: ['unknown_parameter'],
  }), /required_parameter_not_supported/);
  await assert.rejects(inspectYeoulOpenRouterLivePreflight({
    ...config, fetchImpl: stub({ status: 401 }),
  }), /read_only_http_status_or_type/);
});

test('Read-only account controls reject management-only inference key and unknown credits', async () => {
  await assert.rejects(inspectYeoulOpenRouterLivePreflight({
    ...config, fetchImpl: stub({ overrides: {
      '/api/v1/key': { data: { is_management_key: true } },
    } }),
  }), /inference_key_not_verified/);
  await assert.rejects(inspectYeoulOpenRouterLivePreflight({
    ...config, fetchImpl: stub({ overrides: {
      '/api/v1/credits': { data: { total_credits: '10', total_usage: 1 } },
    } }),
  }), /account_credit_shape/);
  await assert.rejects(inspectYeoulOpenRouterLivePreflight({
    ...config, apiKey: '',
  }), /missing_or_invalid_local_key/);
});

test('Invalid JSON and oversized response fail without outputting provider bytes', async () => {
  await assert.rejects(inspectYeoulOpenRouterLivePreflight({
    ...config, fetchImpl: async () => new Response('private-bad-data', {
      status: 200, headers: { 'content-type': 'application/json' },
    }),
  }), /invalid_json/);
  await assert.rejects(inspectYeoulOpenRouterLivePreflight({
    ...config, fetchImpl: async () => new Response('{}', {
      status: 200, headers: { 'content-type': 'application/json', 'content-length': '9000000' },
    }),
  }), /response_too_large/);
});

test('Unexpected network exception never reaches caller with secret contents', async () => {
  await assert.rejects(inspectYeoulOpenRouterLivePreflight({
    ...config, fetchImpl: async () => { throw new Error('test-key leaked?'); },
  }), error => {
    assert.equal(error.message, 'YEOUL_OPENROUTER_READONLY_HOLD:read_only_http_failure');
    return true;
  });
});
