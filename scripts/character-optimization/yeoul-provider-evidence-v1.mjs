/** Read-only, offline check of manually captured OpenRouter endpoint snapshots.
 * A self-reported snapshot cannot prove upstream provenance, active pricing,
 * routing/ZDR enforcement or owner authorization: there is NO HTTP transport.
 */
const fail = code => { throw new Error('YEOUL_PROVIDER_EVIDENCE_INVALID:' + code); };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validModel = id => typeof id === 'string' && /^[a-z0-9_-]+\/[a-z0-9_.:-]+$/u.test(id);
const validName = name => typeof name === 'string' && /^[a-zA-Z0-9 _./:-]{1,100}$/u.test(name);
const validNonnegativeInt = n => Number.isSafeInteger(n) && n >= 0;
const PRICE_COMPONENTS = Object.freeze(['prompt', 'completion', 'request']);

/** Convert a decimal USD unit price to integer nanoUSD/unit, always rounding UP.
 * Pricing API returns USD per token (prompt/completion) and USD per request.
 */
function priceNanos(value) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/u.test(value)) fail('non_decimal_endpoint_price');
  const [whole, part = ''] = value.split('.');
  const numerator = BigInt(whole + part);
  const denominator = 10n ** BigInt(part.length);
  const scaled = numerator * 1000000000n;
  return (scaled + denominator - 1n) / denominator;
}

function requireSingleEndpoint(response, modelId, tag) {
  if (!isObject(response) || !isObject(response.data) || response.data.id !== modelId
      || !Array.isArray(response.data.endpoints)) fail('model_endpoint_snapshot_shape');
  const matching = response.data.endpoints.filter(e => isObject(e) && e.model_id === modelId && e.tag === tag);
  if (matching.length !== 1 || !validName(matching[0].provider_name)) fail('unique_provider_endpoint_required');
  return matching[0];
}

/** Requires two separately captured snapshots. Passing this is NOT live authorization. */
export function inspectYeoulOpenRouterEndpointEvidence({
  modelId, providerTag, modelEndpointSnapshot, zdrEndpointSnapshot,
  capturedAtEpoch, evaluatedAtEpoch, maxAgeSeconds = 3600,
  requiredParameters, maxInputTokens, maxOutputTokens,
}) {
  if (!validModel(modelId) || !validName(providerTag) || !Number.isSafeInteger(capturedAtEpoch)
      || !Number.isSafeInteger(evaluatedAtEpoch) || !Number.isSafeInteger(maxAgeSeconds)
      || maxAgeSeconds < 1 || maxAgeSeconds > 86400 || capturedAtEpoch < 1
      || capturedAtEpoch > evaluatedAtEpoch || evaluatedAtEpoch - capturedAtEpoch > maxAgeSeconds)
    fail('stale_future_or_invalid_snapshot');
  if (!Array.isArray(requiredParameters) || requiredParameters.length < 1
      || requiredParameters.some(v => !validName(v)) || new Set(requiredParameters).size !== requiredParameters.length
      || !validNonnegativeInt(maxInputTokens) || maxInputTokens < 1
      || !validNonnegativeInt(maxOutputTokens) || maxOutputTokens < 1)
    fail('requested_capabilities_and_tokens');

  const endpoint = requireSingleEndpoint(modelEndpointSnapshot, modelId, providerTag);
  if (!isObject(zdrEndpointSnapshot) || !Array.isArray(zdrEndpointSnapshot.data))
    fail('independent_zdr_endpoint_snapshot_required');
  const eligible = zdrEndpointSnapshot.data.filter(e => isObject(e) && e.model_id === modelId
    && e.tag === providerTag && e.provider_name === endpoint.provider_name);
  if (eligible.length !== 1 || eligible[0].status !== 0 || endpoint.status !== 0)
    fail('zdr_endpoint_absent_inactive_or_ambiguous');

  if (!Array.isArray(endpoint.supported_parameters)
      || !Array.isArray(eligible[0].supported_parameters)
      || requiredParameters.some(name => !endpoint.supported_parameters.includes(name)
        || !eligible[0].supported_parameters.includes(name))) fail('required_parameter_not_supported');
  if (!validNonnegativeInt(endpoint.max_prompt_tokens)
      || !validNonnegativeInt(endpoint.max_completion_tokens)
      || maxInputTokens > endpoint.max_prompt_tokens
      || maxOutputTokens > endpoint.max_completion_tokens)
    fail('endpoint_token_ceiling_insufficient');

  if (!isObject(endpoint.pricing) || PRICE_COMPONENTS.some(k => !(k in endpoint.pricing)))
    fail('missing_provider_price_component');
  // Further usage categories may be billable on a real endpoint. Do not silently
  // include unknown categories in an executable cost authority.
  const prices = {};
  for (const component of PRICE_COMPONENTS) prices[component] = priceNanos(endpoint.pricing[component]);
  const costNano = BigInt(maxInputTokens) * prices.prompt
    + BigInt(maxOutputTokens) * prices.completion + prices.request;
  const micro = (costNano + 999n) / 1000n;
  return Object.freeze({
    schemaVersion: 'yeoul-openrouter-endpoint-evidence-v1', modelId,
    providerTag, providerName: endpoint.provider_name,
    capturedAtEpoch, evaluatedAtEpoch, maxAgeSeconds,
    maxInputTokens, maxOutputTokens,
    requiredParameters: Object.freeze([...requiredParameters]),
    // Quote excludes unlisted cache, reasoning, image and tiered billing; it
    // is an arithmetic screening subtotal, NOT the maximum payable amount.
    promptCompletionRequestOnlyQuoteMicroUsd: micro.toString(),
    unknownBillableCategoriesExcluded: true,
    providerZdrDirectoryMatched: true,
    upstreamSnapshotAuthenticated: false, endpointFreshnessAuthenticated: false,
    pricingCompleteAndAuthoritative: false,
    totalExperimentBudgetApproved: false, liveRouteActuallyEnforced: false,
    externalCallsAuthorized: false, paidExecutionReady: false,
    providerRoutingCandidate: Object.freeze({
      only: Object.freeze([providerTag]), allow_fallbacks: false,
      require_parameters: true, zdr: true, data_collection: 'deny',
    }),
  });
}
