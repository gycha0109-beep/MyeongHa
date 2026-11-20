/** Authenticated read-only OpenRouter reconnaissance for the Yeoul KRW500 pilot.
 * No chat completion, credit purchase, GEPA optimization or live send authorization.
 * All HTTP destinations/methods are fixed here; never accept a caller URL.
 */
import { pathToFileURL } from 'node:url';
import { inspectYeoulOpenRouterEndpointEvidence } from './yeoul-provider-evidence-v1.mjs';

export const YEOUL_STUDENT_MODEL = 'deepseek/deepseek-v4.1-flash-1017';
const ORIGIN = 'https://openrouter.ai';
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_CLOCK_SECONDS = 3600;

function deny(code) {
  throw new Error('YEOUL_OPENROUTER_READONLY_HOLD:' + code);
}

function boundedEpoch(value) {
  if (!Number.isSafeInteger(value) || value < 1) deny('invalid_clock');
  return value;
}

function positiveFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

async function getJson({ path, token, fetchImpl, signal }) {
  if (typeof token !== 'string' || !/^[-A-Za-z0-9_]+$/u.test(token) || token.length > 512)
    deny('missing_or_invalid_local_key');
  if (typeof fetchImpl !== 'function') deny('fetch_unavailable');
  let response;
  try {
    response = await fetchImpl(ORIGIN + path, {
      method: 'GET',
      redirect: 'error',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      signal,
    });
  } catch {
    deny('read_only_http_failure');
  }
  if (!response || response.status !== 200 || !response.headers
      || !/^application\/json(?:\s*;|$)/iu.test(response.headers.get('content-type') ?? ''))
    deny('read_only_http_status_or_type');
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null && (!/^\d+$/u.test(declaredLength)
      || Number(declaredLength) > MAX_RESPONSE_BYTES)) deny('response_too_large');
  if (!response.body || typeof response.body.getReader !== 'function')
    deny('missing_bounded_body');
  const reader = response.body.getReader();
  let bytes = 0;
  const chunks = [];
  try {
    while (true) {
      const part = await reader.read();
      if (!part || typeof part.done !== 'boolean') deny('body_stream_failure');
      if (part.done) break;
      if (!(part.value instanceof Uint8Array)) deny('body_stream_failure');
      bytes += part.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) deny('response_too_large');
      chunks.push(part.value);
    }
  } catch {
    deny('body_read_failure');
  } finally {
    try { reader.releaseLock(); } catch { /* cleanup only */ }
  }
  let json;
  try {
    const joined = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined));
  } catch {
    deny('invalid_json');
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) deny('invalid_shape');
  return json;
}

function verifyCurrentInferenceKey(payload) {
  const key = payload?.data;
  if (!key || typeof key !== 'object' || Array.isArray(key) || key.is_management_key !== false)
    deny('inference_key_not_verified');
  // A key's per-key remaining LIMIT is not the account's credit balance.
  return {
    inferenceKeyVerified: true,
    keyHasSpendAllowance: positiveFiniteNumber(key.limit_remaining)
      ? key.limit_remaining > 0 : null,
  };
}

function verifyCredits(payload) {
  const credits = payload?.data;
  if (!credits || !positiveFiniteNumber(credits.total_credits)
      || !positiveFiniteNumber(credits.total_usage)) deny('account_credit_shape');
  return { existingCreditVerified: true,
    existingCreditPositive: credits.total_credits > credits.total_usage };
}

function endpointCandidateTags(modelEndpoints, zdrEndpoints) {
  const endpoints = modelEndpoints?.data?.endpoints;
  const zdr = zdrEndpoints?.data;
  if (!Array.isArray(endpoints) || !Array.isArray(zdr)
      || modelEndpoints?.data?.id !== YEOUL_STUDENT_MODEL) deny('endpoint_directory_shape');
  const eligible = new Set(zdr.filter(e => e?.model_id === YEOUL_STUDENT_MODEL
    && e.status === 0 && typeof e.tag === 'string').map(e => e.tag));
  return [...new Set(endpoints.filter(e => e?.model_id === YEOUL_STUDENT_MODEL
    && e.status === 0 && eligible.has(e.tag) && /^[a-zA-Z0-9 _./:-]{1,100}$/u.test(e.tag))
    .map(e => e.tag))].sort();
}

/** Never returns a live-executable tariff or grant. The keys remain caller-private. */
export async function inspectYeoulOpenRouterLivePreflight({
  apiKey, managementKey = null, providerTag = null, fetchImpl = globalThis.fetch,
  nowEpoch = Math.floor(Date.now() / 1000), maxInputTokens = 512,
  maxOutputTokens = 256, requiredParameters = ['max_tokens'],
} = {}) {
  boundedEpoch(nowEpoch);
  if (managementKey !== null && (typeof managementKey !== 'string' || !managementKey))
    deny('management_key_shape');
  if (providerTag !== null && (typeof providerTag !== 'string' || !providerTag))
    deny('provider_tag_shape');
  if (!Number.isSafeInteger(maxInputTokens) || maxInputTokens < 1
      || !Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1)
    deny('token_limit_shape');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const get = (path, token) => getJson({ path, token, fetchImpl, signal: controller.signal });
    const key = verifyCurrentInferenceKey(await get('/api/v1/key', apiKey));
    const modelEndpointSnapshot = await get(
      '/api/v1/models/deepseek/deepseek-v4.1-flash-1017/endpoints', apiKey);
    const zdrEndpointSnapshot = await get('/api/v1/endpoints/zdr', apiKey);
    const availableZdrProviderTags = endpointCandidateTags(modelEndpointSnapshot, zdrEndpointSnapshot);
    let selectedProviderEvidence = null;
    if (providerTag !== null) {
      if (!availableZdrProviderTags.includes(providerTag)) deny('provider_zdr_unavailable');
      selectedProviderEvidence = inspectYeoulOpenRouterEndpointEvidence({
        modelId: YEOUL_STUDENT_MODEL, providerTag, modelEndpointSnapshot,
        zdrEndpointSnapshot, capturedAtEpoch: nowEpoch,
        evaluatedAtEpoch: nowEpoch, maxAgeSeconds: MAX_CLOCK_SECONDS,
        requiredParameters, maxInputTokens, maxOutputTokens,
      });
    }
    const credits = managementKey === null
      ? { existingCreditVerified: false, existingCreditPositive: null }
      : verifyCredits(await get('/api/v1/credits', managementKey));
    // Never print API keys, account identifiers, exact balances, payloads or prompts.
    return Object.freeze({
      schemaVersion: 'yeoul-openrouter-readonly-preflight-v1',
      modelId: YEOUL_STUDENT_MODEL, capturedAtEpoch: nowEpoch,
      ...key, ...credits, availableZdrProviderTags,
      selectedProviderEvidence,
      creditPurchasePerformed: false, paidCompletionRequestsSent: 0,
      readOnlyCatalogAuthenticatedByLocalKey: true,
      endpointPricingNotFullChargeGuarantee: true,
      pinnedLiveRoutingProven: false, paidExecutionReady: false,
    });
  } finally {
    clearTimeout(timeout);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Explicitly no implicit dotenv loading and no secrets printed on errors.
  try {
    const result = await inspectYeoulOpenRouterLivePreflight({
      apiKey: process.env.OPENROUTER_API_KEY,
      managementKey: process.env.OPENROUTER_MANAGEMENT_KEY || null,
      providerTag: process.env.YEOUL_OPENROUTER_PROVIDER_TAG || null,
    });
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    process.stderr.write(
      (typeof error?.message === 'string' && error.message.startsWith('YEOUL_')
        ? error.message.split(':')[0] + ':' + error.message.split(':')[1]
        : 'YEOUL_OPENROUTER_READONLY_HOLD:preflight_failed') + '\n');
    process.exitCode = 1;
  }
}
