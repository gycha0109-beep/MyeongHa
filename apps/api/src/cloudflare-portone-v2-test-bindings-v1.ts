// Watchtower-Track: commerce-payment
// Cloudflare Worker bindings for the already-created PortOne V2 NHN KCP
// TEST channel. A binding is not permission to activate Production checkout.
import {readOwnerAdminAccessV1} from './myeongha-owner-admin-access-v1.js';
import type {PostgresSubjectPoolV1} from './postgres-subject-execution.js';
import type {VerifiedSubjectIdentityEvidenceV1} from './subject-identity-resolver.js';
import {
  buildPortOneChatCreditCheckoutV1,
  CHAT_CREDIT_PORTONE_V2_OFFER_V1,
  type ServerVerifiedCreditCheckoutV1,
} from './portone-chat-credit-checkout-v1.js';
import {
  createPortOneV2PaymentVerificationAdapterV1,
} from './portone-v2-payment-verification-adapter.js';
import type {
  CommercePaymentVerificationAdapterV1,
  CommercePaymentVerificationAdapterRequestV1,
} from './commerce-payment-verification-execution.js';
import {
  PRODUCTION_COMMERCE_EVIDENCE_FINGERPRINT_BINDING_V1,
  requireProductionCommerceEvidenceHmacK1SecretV1,
} from './production-commerce-evidence-fingerprint.js';

export const CLOUDFLARE_PORTONE_V2_TEST_BINDINGS_V1 = Object.freeze({
  storeIdEnv: 'Store_ID',
  channelKeyEnv: 'Channel_Key',
  apiSecretEnv: 'V2_API_Secret',
  evidenceHmacEnv: PRODUCTION_COMMERCE_EVIDENCE_FINGERPRINT_BINDING_V1.secretEnvName,
  provider: 'portone_v2',
  pgProvider: 'kcp_v2',
  testMid: 'T0000',
  environment: 'sandbox',
  mode: 'server-owned-owner-sandbox',
  // Explicitly not a route, an entitlement, a saleable SKU, or live approval.
  publicRouteMounted: false,
  productionCheckoutEnabled: false,
  sandboxCreditMintEnabled: false,
} as const);

export type CloudflarePortOneTestBindingEnvironmentV1 =
  Readonly<Record<string, unknown>>;

const STORE_ID = /^store-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;
const CHANNEL_KEY = /^channel-key-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;

export interface CloudflarePortOneOwnerSandboxAuthorityV1 {
  readonly pool: PostgresSubjectPoolV1;
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
}

function fail(): never {
  // Neither Worker logs nor error objects may expose private credential text.
  throw new Error('Cloudflare PortOne V2 TEST binding authority unavailable.');
}

function checked(value: unknown, pattern: RegExp): string {
  if (typeof value !== 'string' || value !== value.trim() ||
      value.length > 128 || !pattern.test(value)) return fail();
  return value;
}

function secret(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 ||
      value !== value.trim() || value.length > 4_096) return fail();
  return value;
}

/**
 * Read EXACT dashboard binding names only within the trusted server runtime.
 * No plaintext secret is returned to the browser or a public status endpoint.
 */
function resolveCloudflarePortOneTestBindingsV1(
  env: CloudflarePortOneTestBindingEnvironmentV1,
): Readonly<{storeId: string; channelKey: string; apiSecret: string}> {
  if (!env || typeof env !== 'object') return fail();
  return Object.freeze({
    storeId: checked(env.Store_ID, STORE_ID),
    channelKey: checked(env.Channel_Key, CHANNEL_KEY),
    apiSecret: secret(env.V2_API_Secret),
  });
}

/** No caller-owned flag can substitute for the canonical Member/Owner DB read. */
async function assertCloudflarePortOneSandboxOwnerV1(
  authority: CloudflarePortOneOwnerSandboxAuthorityV1,
): Promise<void> {
  if (!authority || authority.verifiedEvidence?.kind !== 'member') return fail();
  try {
    const owner = await readOwnerAdminAccessV1(authority.pool,authority.verifiedEvidence);
    if (owner.isOwnerAdmin !== true || owner.sandboxCheckoutAllowed !== true ||
        typeof owner.verifiedSubjectId !== 'string' ||
        !UUID.test(owner.verifiedSubjectId)) return fail();
  } catch {
    // Preserve fail-closed behavior without exposing any DB/identity details.
    return fail();
  }
}

/**
 * Only a previously DB-approved Owner Admin sandbox Purchase Intent can be
 * materialized into PortOne V2 browser checkout arguments. Never use the
 * browser response itself as evidence of payment or credit ownership.
 */
export async function buildCloudflarePortOneOwnerTestCheckoutV1(
  env: CloudflarePortOneTestBindingEnvironmentV1,
  serverIssued: Omit<ServerVerifiedCreditCheckoutV1,'storeId'|'channelKey'>,
  authority: CloudflarePortOneOwnerSandboxAuthorityV1,
): Promise<ReturnType<typeof buildPortOneChatCreditCheckoutV1>> {
  if (serverIssued?.environment !== 'sandbox' ||
      serverIssued.ownerAdminSandboxAllowed !== true ||
      typeof serverIssued.paymentId!=='string' ||
      !/^[A-Za-z0-9_-]{6,40}$/.test(serverIssued.paymentId)) return fail();
  const {storeId, channelKey} = resolveCloudflarePortOneTestBindingsV1(env);
  await assertCloudflarePortOneSandboxOwnerV1(authority);
  return buildPortOneChatCreditCheckoutV1({...serverIssued,storeId,channelKey});
}

function checkSandboxVerificationContext(
  request: CommercePaymentVerificationAdapterRequestV1,
): void {
  if (request?.environment !== 'sandbox' ||
      typeof request.providerRequestId!=='string' ||
      !/^[A-Za-z0-9_-]{6,40}$/.test(request.providerRequestId) ||
      request.provider !== 'portone_v2' ||
      request.platform !== 'web' ||
      request.expectedExternalProductId !== CHAT_CREDIT_PORTONE_V2_OFFER_V1.externalProductId ||
      request.expectedAmountMinor !== CHAT_CREDIT_PORTONE_V2_OFFER_V1.amountMinor ||
      request.expectedCurrency !== CHAT_CREDIT_PORTONE_V2_OFFER_V1.currency) {
    fail();
  }
}

/**
 * The PortOne V2 API Secret and independent 32+-byte evidence HMAC key are
 * BOTH required before ANY server-side payment lookup. The adapter remains
 * private; a new HTTP route or sandbox mint is explicitly out of scope.
 */
export async function createCloudflarePortOneOwnerTestVerifierV1(
  env: CloudflarePortOneTestBindingEnvironmentV1,
  authority: CloudflarePortOneOwnerSandboxAuthorityV1,
): Promise<CommercePaymentVerificationAdapterV1> {
  const {apiSecret} = resolveCloudflarePortOneTestBindingsV1(env);
  let evidenceHmacSecret: string;
  try {
    evidenceHmacSecret = requireProductionCommerceEvidenceHmacK1SecretV1(
      env[CLOUDFLARE_PORTONE_V2_TEST_BINDINGS_V1.evidenceHmacEnv],
    );
  } catch {
    return fail();
  }
  await assertCloudflarePortOneSandboxOwnerV1(authority);
  const adapter = createPortOneV2PaymentVerificationAdapterV1({
    apiSecret, evidenceHmacSecret,
  });
  return Object.freeze({
    verify(request: CommercePaymentVerificationAdapterRequestV1) {
      checkSandboxVerificationContext(request);
      return adapter.verify(request);
    },
  });
}
