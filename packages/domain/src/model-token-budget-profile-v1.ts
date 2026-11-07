export const MODEL_TOKEN_BUDGET_PROFILE_SCHEMA_VERSION_V1 =
  'model-token-budget-profile-v1' as const;
export const MODEL_TOKEN_BUDGET_RECEIPT_SCHEMA_VERSION_V1 =
  'model-token-budget-receipt-v1' as const;

export const MODEL_TOKEN_BUDGET_INPUT_BOUND_SEMANTICS_V1 =
  'certified_upper_bound_includes_reserved_headroom' as const;

export interface ModelTokenBudgetProfileV1 {
  readonly schemaVersion: typeof MODEL_TOKEN_BUDGET_PROFILE_SCHEMA_VERSION_V1;
  /** Server-owned stable identity for this exact model/policy/rate-card profile. */
  readonly profileId: string;
  readonly policyVersion: string;
  readonly providerKey: string;
  readonly modelKey: string;
  readonly pricingVersion: string;
  readonly contextWindowTokens: number;
  /** Hard input ceiling. The certified input upper bound must include headroom. */
  readonly maximumInputTokens: number;
  /** Must be the cap enforced in the actual Provider request. */
  readonly maximumOutputTokens: number;
  readonly reservedHeadroomTokens: number;
  readonly maximumSerializedRequestBytes: number;
  readonly tokenCounter: Readonly<{
    readonly adapterId: string;
    readonly adapterVersion: string;
    readonly supportedRequestFormat: string;
    readonly inputBoundSemantics:
      typeof MODEL_TOKEN_BUDGET_INPUT_BOUND_SEMANTICS_V1;
  }>;
}

export interface ModelTokenCountExactRequestV1<TRequest = unknown> {
  readonly request: TRequest;
  readonly requestFormat: string;
  /** Exact immutable JSON body that will be sent to the generation Provider. */
  readonly serializedRequestBody: string;
  readonly serializedRequestBodyBytes: number;
}

export interface ModelTokenCountAdapterV1<TRequest = unknown> {
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly providerKey: string;
  readonly modelKey: string;
  readonly supportedRequestFormat: string;
  readonly reservedHeadroomTokens: number;
  readonly inputBoundSemantics:
    typeof MODEL_TOKEN_BUDGET_INPUT_BOUND_SEMANTICS_V1;
  /**
   * Returns a conservative input-token upper bound INCLUDING the exact
   * reservedHeadroomTokens declared by this adapter and its bound profile.
   * It must count the exact serialized request, not a reconstructed prompt.
   */
  countExactRequest(
    input: ModelTokenCountExactRequestV1<TRequest>,
  ): number | null | Promise<number | null>;
}

export interface ModelTokenBudgetReceiptV1 {
  readonly schemaVersion: typeof MODEL_TOKEN_BUDGET_RECEIPT_SCHEMA_VERSION_V1;
  readonly profileId: string;
  readonly policyVersion: string;
  readonly pricingVersion: string;
  readonly providerKey: string;
  readonly modelKey: string;
  readonly requestFormat: string;
  readonly tokenCounterAdapterId: string;
  readonly tokenCounterAdapterVersion: string;
  readonly serializedRequestBodyBytes: number;
  readonly certifiedInputTokenUpperBound: number;
  readonly reservedHeadroomTokens: number;
  readonly outputTokenLimit: number;
  readonly contextWindowTokens: number;
  readonly availableInputTokens: number;
  readonly remainingInputTokens: number;
}

export type ModelTokenBudgetFailureCodeV1 =
  | 'INVALID_PROFILE'
  | 'COUNTER_PROFILE_MISMATCH'
  | 'UNSUPPORTED_REQUEST_FORMAT'
  | 'OUTPUT_CAP_MISMATCH'
  | 'INVALID_REQUEST_BODY'
  | 'REQUEST_BODY_BYTES_MISMATCH'
  | 'REQUEST_BODY_TOO_LARGE'
  | 'TOKEN_COUNT_FAILED'
  | 'TOKEN_COUNT_UNAVAILABLE'
  | 'TOKEN_COUNT_INVALID'
  | 'INPUT_BUDGET_EXCEEDED';

export class ModelTokenBudgetErrorV1 extends Error {
  constructor(
    readonly code: ModelTokenBudgetFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'ModelTokenBudgetErrorV1';
  }
}

function fail(
  code: ModelTokenBudgetFailureCodeV1,
  message: string,
): never {
  throw new ModelTokenBudgetErrorV1(code, message);
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() !== value ||
      value.length < 1 || value.length > 256) {
    fail('INVALID_PROFILE', 'Model token budget ' + label + ' is invalid.');
  }
  return value;
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    fail('INVALID_PROFILE', 'Model token budget ' + label + ' is invalid.');
  }
  return value;
}

export function validateModelTokenBudgetProfileV1(
  profile: ModelTokenBudgetProfileV1,
): ModelTokenBudgetProfileV1 {
  if (typeof profile !== 'object' || profile === null ||
      profile.schemaVersion !== MODEL_TOKEN_BUDGET_PROFILE_SCHEMA_VERSION_V1 ||
      typeof profile.tokenCounter !== 'object' || profile.tokenCounter === null) {
    fail('INVALID_PROFILE', 'Model token budget profile shape is unsupported.');
  }

  const profileId = requireText(profile.profileId, 'profile id');
  const policyVersion = requireText(profile.policyVersion, 'policy version');
  const providerKey = requireText(profile.providerKey, 'provider key');
  const modelKey = requireText(profile.modelKey, 'model key');
  const pricingVersion = requireText(profile.pricingVersion, 'pricing version');
  const contextWindowTokens = requirePositiveInteger(
    profile.contextWindowTokens,
    'context window',
  );
  const maximumInputTokens = requirePositiveInteger(
    profile.maximumInputTokens,
    'maximum input tokens',
  );
  const maximumOutputTokens = requirePositiveInteger(
    profile.maximumOutputTokens,
    'maximum output tokens',
  );
  const reservedHeadroomTokens = requirePositiveInteger(
    profile.reservedHeadroomTokens,
    'reserved headroom',
  );
  const maximumSerializedRequestBytes = requirePositiveInteger(
    profile.maximumSerializedRequestBytes,
    'maximum serialized request bytes',
  );
  const adapterId = requireText(profile.tokenCounter.adapterId, 'counter adapter id');
  const adapterVersion = requireText(
    profile.tokenCounter.adapterVersion,
    'counter adapter version',
  );
  const supportedRequestFormat = requireText(
    profile.tokenCounter.supportedRequestFormat,
    'supported request format',
  );

  if (reservedHeadroomTokens >= maximumInputTokens) {
    fail('INVALID_PROFILE', 'Reserved headroom must be smaller than the input ceiling.');
  }
  if (BigInt(maximumInputTokens) + BigInt(maximumOutputTokens) >
      BigInt(contextWindowTokens)) {
    fail('INVALID_PROFILE', 'Input and output ceilings exceed the model context window.');
  }
  if (profile.tokenCounter.inputBoundSemantics !==
      MODEL_TOKEN_BUDGET_INPUT_BOUND_SEMANTICS_V1) {
    fail('INVALID_PROFILE', 'Token counter must include reserved headroom in its certified upper bound.');
  }

  return Object.freeze({
    schemaVersion: MODEL_TOKEN_BUDGET_PROFILE_SCHEMA_VERSION_V1,
    profileId,
    policyVersion,
    providerKey,
    modelKey,
    pricingVersion,
    contextWindowTokens,
    maximumInputTokens,
    maximumOutputTokens,
    reservedHeadroomTokens,
    maximumSerializedRequestBytes,
    tokenCounter: Object.freeze({
      adapterId,
      adapterVersion,
      supportedRequestFormat,
      inputBoundSemantics: MODEL_TOKEN_BUDGET_INPUT_BOUND_SEMANTICS_V1,
    }),
  });
}

/**
 * Provider-neutral exact-request preflight. It has no persistence, reservation,
 * network, model dispatch, or pricing side effects. Call the Cost Governor only
 * after this receipt has been produced successfully.
 */
export async function certifyModelTokenBudgetV1<TRequest>(input: Readonly<{
  profile: ModelTokenBudgetProfileV1;
  adapter: ModelTokenCountAdapterV1<TRequest>;
  request: TRequest;
  requestFormat: string;
  serializedRequestBody: string;
  serializedRequestBodyBytes: number;
  enforcedOutputTokenLimit: number;
}>): Promise<ModelTokenBudgetReceiptV1> {
  const profile = validateModelTokenBudgetProfileV1(input.profile);
  const adapter = input.adapter;

  if (
    adapter.adapterId !== profile.tokenCounter.adapterId ||
    adapter.adapterVersion !== profile.tokenCounter.adapterVersion ||
    adapter.providerKey !== profile.providerKey ||
    adapter.modelKey !== profile.modelKey ||
    adapter.supportedRequestFormat !== profile.tokenCounter.supportedRequestFormat ||
    adapter.reservedHeadroomTokens !== profile.reservedHeadroomTokens ||
    adapter.inputBoundSemantics !== profile.tokenCounter.inputBoundSemantics
  ) {
    fail(
      'COUNTER_PROFILE_MISMATCH',
      'Token counter identity, model, request format, or headroom does not match the approved profile.',
    );
  }

  if (
    input.requestFormat !== profile.tokenCounter.supportedRequestFormat ||
    input.requestFormat !== adapter.supportedRequestFormat
  ) {
    fail(
      'UNSUPPORTED_REQUEST_FORMAT',
      'The exact request format is not supported by the approved token counter.',
    );
  }

  if (input.enforcedOutputTokenLimit !== profile.maximumOutputTokens) {
    fail(
      'OUTPUT_CAP_MISMATCH',
      'The actual Provider output-token cap does not match the approved model profile.',
    );
  }

  if (
    typeof input.serializedRequestBody !== 'string' ||
    input.serializedRequestBody.length === 0 ||
    !Number.isSafeInteger(input.serializedRequestBodyBytes) ||
    input.serializedRequestBodyBytes < 1
  ) {
    fail('INVALID_REQUEST_BODY', 'The final serialized Provider request is invalid.');
  }

  const actualBytes = new TextEncoder().encode(
    input.serializedRequestBody,
  ).byteLength;
  if (actualBytes !== input.serializedRequestBodyBytes) {
    fail(
      'REQUEST_BODY_BYTES_MISMATCH',
      'The supplied request byte count does not match the exact serialized request.',
    );
  }
  if (actualBytes > profile.maximumSerializedRequestBytes) {
    fail(
      'REQUEST_BODY_TOO_LARGE',
      'The exact serialized Provider request exceeds the approved byte ceiling.',
    );
  }

  let certifiedInputTokenUpperBound: number | null;
  try {
    certifiedInputTokenUpperBound = await adapter.countExactRequest({
      request: input.request,
      requestFormat: input.requestFormat,
      serializedRequestBody: input.serializedRequestBody,
      serializedRequestBodyBytes: actualBytes,
    });
  } catch {
    fail(
      'TOKEN_COUNT_FAILED',
      'The approved token-count adapter failed before Provider dispatch.',
    );
  }

  if (certifiedInputTokenUpperBound === null) {
    fail(
      'TOKEN_COUNT_UNAVAILABLE',
      'The approved token-count adapter could not certify this request.',
    );
  }
  if (
    !Number.isSafeInteger(certifiedInputTokenUpperBound) ||
    certifiedInputTokenUpperBound < profile.reservedHeadroomTokens
  ) {
    fail(
      'TOKEN_COUNT_INVALID',
      'The token-count adapter returned an invalid certified upper bound.',
    );
  }

  // Both ceilings include the reserved headroom. The Provider output cap is
  // held aside before the remaining input capacity is exposed to the caller.
  const availableInputTokens = Math.min(
    profile.maximumInputTokens,
    profile.contextWindowTokens - profile.maximumOutputTokens,
  );
  if (certifiedInputTokenUpperBound > availableInputTokens) {
    fail(
      'INPUT_BUDGET_EXCEEDED',
      'The certified input upper bound exceeds the approved model input budget.',
    );
  }

  return Object.freeze({
    schemaVersion: MODEL_TOKEN_BUDGET_RECEIPT_SCHEMA_VERSION_V1,
    profileId: profile.profileId,
    policyVersion: profile.policyVersion,
    pricingVersion: profile.pricingVersion,
    providerKey: profile.providerKey,
    modelKey: profile.modelKey,
    requestFormat: input.requestFormat,
    tokenCounterAdapterId: adapter.adapterId,
    tokenCounterAdapterVersion: adapter.adapterVersion,
    serializedRequestBodyBytes: actualBytes,
    certifiedInputTokenUpperBound,
    reservedHeadroomTokens: profile.reservedHeadroomTokens,
    outputTokenLimit: profile.maximumOutputTokens,
    contextWindowTokens: profile.contextWindowTokens,
    availableInputTokens,
    remainingInputTokens: availableInputTokens - certifiedInputTokenUpperBound,
  });
}
