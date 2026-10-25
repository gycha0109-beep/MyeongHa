import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import {
  handlePortOneV2IdentityIssueRequestV1,
  handlePortOneV2IdentityCompleteRequestV1,
} from './portone-v2-identity-http-v1.js';
import { createPortOneV2IdentityLookupAdapterV1 } from './portone-v2-identity-verification-lookup-v1.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import { resolveProductionPortOneVerifiedAgeModeV1 } from './portone-v2-age-enforcement-activation-v1.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';

/**
 * No secrets are read or provider/DB traffic emitted in OFF mode.
 * Separate operator-controlled contract, Privacy, DB and age-enforcement
 * gates must ALL be explicit before this composition becomes callable.
 */
export const PORTONE_V2_PRODUCTION_IDENTITY_HTTP_ACTIVATION_V1 = Object.freeze({
  mode: 'MYEONGHA_PORTONE_IDENTITY_HTTP_MODE',
  contract: 'MYEONGHA_PORTONE_IDENTITY_PROVIDER_CONTRACT_STATE',
  apiSecret: 'MYEONGHA_PORTONE_IDENTITY_API_SECRET',
  storeId: 'MYEONGHA_PORTONE_IDENTITY_STORE_ID',
  channelKey: 'MYEONGHA_PORTONE_IDENTITY_CHANNEL_KEY',
  off: 'OFF',
  enforce: 'ENFORCE',
  approved: 'APPROVED',
} as const);

export function resolveProductionPortOneIdentityHttpModeV1(
  env: ProductionUserDataRuntimeEnvV1,
): 'off' | 'enforce' {
  const keys = PORTONE_V2_PRODUCTION_IDENTITY_HTTP_ACTIVATION_V1;
  const mode = env[keys.mode];
  if (mode === undefined || mode === keys.off) return 'off';
  if (mode !== keys.enforce) throw new Error('PortOne identity HTTP mode is invalid.');
  if (resolveProductionPortOneVerifiedAgeModeV1(env) !== 'enforce') {
    throw new Error('PortOne identity HTTP requires approved and applied age authority.');
  }
  if (env[keys.contract] !== keys.approved) {
    throw new Error('PortOne identity provider contract is not approved.');
  }
  for (const field of [keys.storeId, keys.channelKey]) {
    const value = env[field];
    if (typeof value !== 'string' || !(field === keys.storeId
      ? /^store-[a-zA-Z0-9_-]{8,128}$/u.test(value)
      : /^channel-key-[a-zA-Z0-9_-]{8,128}$/u.test(value))) {
      throw new Error('PortOne identity channel configuration is missing.');
    }
  }
  const secret = env[keys.apiSecret];
  if (typeof secret !== 'string' || secret.trim() !== secret ||
      secret.length < 20 || secret.length > 4096 || /[\r\n]/u.test(secret)) {
    throw new Error('PortOne identity server credential is not configured.');
  }
  return 'enforce';
}

export function createProductionPortOneIdentityHttpRuntimeV1(input: Readonly<{
  env: ProductionUserDataRuntimeEnvV1;
  pool: PostgresSubjectPoolV1;
  memberFetchImpl?: SupabaseMemberVerifierFetchV1;
}>) {
  if (resolveProductionPortOneIdentityHttpModeV1(input.env) !== 'enforce') {
    throw new Error('PortOne identity production runtime must not be created in OFF mode.');
  }
  const config = parseProductionUserDataRuntimeConfigV1(input.env);
  const verifier = createProductionRequestIdentityVerifierV1({
    config,
    ...(input.memberFetchImpl === undefined ? {} : { memberFetchImpl: input.memberFetchImpl }),
  });
  const apiSecret = input.env[PORTONE_V2_PRODUCTION_IDENTITY_HTTP_ACTIVATION_V1.apiSecret]!;
  const lookup = createPortOneV2IdentityLookupAdapterV1({ apiSecret });
  return Object.freeze({
    handleRequest(inputRequest: Readonly<{
      request: Request;
      requestId: string;
      serverTime: string;
      action: 'issue' | 'complete';
    }>): Promise<Response> {
      const identityInput = {
        request: inputRequest.request,
        requestId: inputRequest.requestId,
        serverTime: inputRequest.serverTime,
        identityEvidenceVerifier: verifier,
        pool: input.pool,
        lookup,
        productionActivationApproved: true as const,
        browserChannel: Object.freeze({
          storeId: input.env[PORTONE_V2_PRODUCTION_IDENTITY_HTTP_ACTIVATION_V1.storeId]!,
          channelKey: input.env[PORTONE_V2_PRODUCTION_IDENTITY_HTTP_ACTIVATION_V1.channelKey]!,
        }),
      };
      return inputRequest.action === 'issue'
        ? handlePortOneV2IdentityIssueRequestV1(identityInput)
        : handlePortOneV2IdentityCompleteRequestV1(identityInput);
    },
  });
}
