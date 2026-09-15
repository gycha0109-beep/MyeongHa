import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  executeAuthenticatedCommerceProviderPaymentCompletionV1,
  type AuthenticatedCommerceProviderIngressV1,
  type AuthenticatedCommerceProviderPaymentCompletionV1,
  type CommerceProviderIngressAuthenticatorV1,
} from './commerce-provider-payment-completion-orchestration.js';
import type { CommercePaymentVerificationAdapterV1 } from './commerce-payment-verification-execution.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

export const PORTONE_V2_WEBHOOK_VERSION_V1 = '2024-04-25' as const;
export const PORTONE_V2_WEBHOOK_PAID_EVENT_V1 = 'Transaction.Paid' as const;
export const PORTONE_V2_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS_V1 = 300 as const;
export const PORTONE_V2_WEBHOOK_MAX_BODY_BYTES_V1 = 65_536 as const;
export const PORTONE_V2_WEBHOOK_MAX_ID_LENGTH_V1 = 512 as const;
export const PORTONE_V2_WEBHOOK_MAX_SIGNATURE_HEADER_LENGTH_V1 = 8_192 as const;
export const PORTONE_V2_WEBHOOK_MAX_SIGNATURE_ENTRIES_V1 = 16 as const;

export type PortOneV2WebhookPaymentCompletionFailureCodeV1 =
  | 'INVALID_CONFIGURATION'
  | 'INVALID_REQUEST'
  | 'INVALID_SIGNATURE'
  | 'STALE_WEBHOOK'
  | 'INVALID_WEBHOOK';

export class PortOneV2WebhookPaymentCompletionErrorV1 extends Error {
  constructor(
    readonly code: PortOneV2WebhookPaymentCompletionFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'PortOneV2WebhookPaymentCompletionErrorV1';
  }
}

export interface PortOneV2WebhookRequestV1 {
  readonly rawBody: string | Uint8Array;
  readonly headers: Readonly<
    Record<string, string | readonly string[] | undefined>
  >;
}

export interface PortOneV2WebhookPaymentCompletionConfigV1 {
  readonly environment: 'sandbox' | 'production';
  readonly webhookSecrets: readonly string[];
  readonly now?: () => Date;
}

type PortOneV2WebhookPaymentCompletionConfigSnapshotV1 = Readonly<{
  environment: 'sandbox' | 'production';
  webhookSecrets: readonly string[];
  now: (() => Date) | undefined;
}>;

export interface AuthenticatedPortOneV2PaidWebhookV1 {
  readonly kind: 'payment_completion';
  readonly providerWebhookId: string;
  readonly authenticatedIngress: AuthenticatedCommerceProviderIngressV1;
}

export interface IgnoredAuthenticatedPortOneV2WebhookV1 {
  readonly kind: 'ignored';
  readonly providerWebhookId: string;
  readonly eventType: string;
}

export type AuthenticatedPortOneV2WebhookDecisionV1 =
  | AuthenticatedPortOneV2PaidWebhookV1
  | IgnoredAuthenticatedPortOneV2WebhookV1;

export type PortOneV2WebhookPaymentCompletionExecutionV1 =
  | Readonly<{
      kind: 'ignored';
      providerWebhookId: string;
      eventType: string;
    }>
  | Readonly<
      {
        kind: 'completed';
        providerWebhookId: string;
      } & AuthenticatedCommerceProviderPaymentCompletionV1
    >;

const MAX_PROVIDER_ID_LENGTH = 512;
const MAX_EVENT_TYPE_LENGTH = 256;
const MAX_SECRET_SERIALIZED_LENGTH = 512;
const STANDARD_WEBHOOK_SECRET_PREFIX = 'whsec_';
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const CONTENT_TYPE_JSON = /^application\/json(?:\s*;|$)/iu;

function fail(
  code: PortOneV2WebhookPaymentCompletionFailureCodeV1,
  message: string,
): never {
  throw new PortOneV2WebhookPaymentCompletionErrorV1(code, message);
}

function snapshotWebhookConfig(
  config: PortOneV2WebhookPaymentCompletionConfigV1,
): PortOneV2WebhookPaymentCompletionConfigSnapshotV1 {
  try {
    return Object.freeze({
      environment: config.environment,
      webhookSecrets: config.webhookSecrets,
      now: config.now,
    });
  } catch {
    return fail(
      'INVALID_CONFIGURATION',
      'PortOne V2 webhook configuration could not be read.',
    );
  }
}

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail('INVALID_WEBHOOK', `${label} is invalid.`);
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    return fail('INVALID_WEBHOOK', `${label} is invalid.`);
  }
  return value as Record<string, unknown>;
}

function rawBodyBytes(value: string | Uint8Array): Uint8Array {
  const bytes =
    typeof value === 'string'
      ? Buffer.from(value, 'utf8')
      : value instanceof Uint8Array
        ? Buffer.from(value)
        : fail('INVALID_REQUEST', 'PortOne V2 webhook request body is invalid.');

  if (bytes.byteLength === 0 || bytes.byteLength > PORTONE_V2_WEBHOOK_MAX_BODY_BYTES_V1) {
    return fail('INVALID_REQUEST', 'PortOne V2 webhook request body is invalid.');
  }
  return bytes;
}

function normalizeHeaders(
  headers: PortOneV2WebhookRequestV1['headers'],
): Readonly<Record<string, string>> {
  if (typeof headers !== 'object' || headers === null || Array.isArray(headers)) {
    return fail('INVALID_REQUEST', 'PortOne V2 webhook request headers are invalid.');
  }

  const normalized: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(headers)) {
    const key = rawKey.toLowerCase();
    if (rawValue === undefined) continue;
    if (typeof rawValue !== 'string') {
      if (rawValue.length !== 1 || typeof rawValue[0] !== 'string') {
        return fail('INVALID_REQUEST', 'PortOne V2 webhook request headers are invalid.');
      }
      if (normalized[key] !== undefined) {
        return fail('INVALID_REQUEST', 'PortOne V2 webhook request headers are invalid.');
      }
      normalized[key] = rawValue[0];
      continue;
    }
    if (normalized[key] !== undefined) {
      return fail('INVALID_REQUEST', 'PortOne V2 webhook request headers are invalid.');
    }
    normalized[key] = rawValue;
  }
  return Object.freeze(normalized);
}

function requiredHeader(
  headers: Readonly<Record<string, string>>,
  name: string,
  maxLength: number,
): string {
  const value = headers[name];
  if (
    value === undefined ||
    value.length === 0 ||
    value.trim() !== value ||
    value.length > maxLength
  ) {
    return fail('INVALID_SIGNATURE', 'PortOne V2 webhook signature verification failed.');
  }
  return value;
}

function requireContentType(headers: Readonly<Record<string, string>>): void {
  const value = headers['content-type'];
  if (value === undefined || !CONTENT_TYPE_JSON.test(value.trim())) {
    return fail('INVALID_REQUEST', 'PortOne V2 webhook content type is invalid.');
  }
}

function requireWebhookId(headers: Readonly<Record<string, string>>): string {
  const value = requiredHeader(
    headers,
    'webhook-id',
    PORTONE_V2_WEBHOOK_MAX_ID_LENGTH_V1,
  );
  if (value.includes('.') || /[\u0000-\u001f\u007f]/u.test(value)) {
    return fail('INVALID_SIGNATURE', 'PortOne V2 webhook signature verification failed.');
  }
  return value;
}

function resolveClock(now: (() => Date) | undefined): Date {
  let value: Date;
  try {
    value = (now ?? (() => new Date()))();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw new TypeError('invalid PortOne V2 webhook verification clock');
    }
  } catch {
    return fail('INVALID_CONFIGURATION', 'PortOne V2 webhook verification clock is invalid.');
  }
  return value;
}

function requireTimestamp(
  headers: Readonly<Record<string, string>>,
  now: Date,
): string {
  const value = requiredHeader(headers, 'webhook-timestamp', 20);
  if (!/^[0-9]+$/u.test(value)) {
    return fail('INVALID_SIGNATURE', 'PortOne V2 webhook signature verification failed.');
  }
  const timestampSeconds = Number(value);
  if (!Number.isSafeInteger(timestampSeconds) || timestampSeconds < 0) {
    return fail('INVALID_SIGNATURE', 'PortOne V2 webhook signature verification failed.');
  }
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  if (
    Math.abs(nowSeconds - timestampSeconds) >
    PORTONE_V2_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS_V1
  ) {
    return fail('STALE_WEBHOOK', 'PortOne V2 webhook timestamp is outside the accepted replay window.');
  }
  return value;
}

function normalizeBase64(value: string): string | null {
  if (value.length === 0 || /[^A-Za-z0-9+/=]/u.test(value)) return null;
  const firstPadding = value.indexOf('=');
  if (firstPadding !== -1 && /[^=]/u.test(value.slice(firstPadding))) return null;
  if (value.length % 4 === 1) return null;
  const unpadded = value.replace(/=+$/u, '');
  const padded = `${unpadded}${'='.repeat((4 - (unpadded.length % 4)) % 4)}`;
  if (!BASE64.test(padded)) return null;
  return padded;
}

function strictBase64(value: string): Buffer {
  const normalized = normalizeBase64(value);
  if (normalized === null) {
    return fail('INVALID_CONFIGURATION', 'PortOne V2 webhook credential is invalid.');
  }
  const decoded = Buffer.from(normalized, 'base64');
  if (decoded.length === 0 || decoded.toString('base64') !== normalized) {
    return fail('INVALID_CONFIGURATION', 'PortOne V2 webhook credential is invalid.');
  }
  return decoded;
}

function decodeWebhookSecret(value: string): Buffer {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_SECRET_SERIALIZED_LENGTH ||
    value.trim() !== value ||
    !value.startsWith(STANDARD_WEBHOOK_SECRET_PREFIX)
  ) {
    return fail('INVALID_CONFIGURATION', 'PortOne V2 webhook credential is invalid.');
  }
  const serialized = value.slice(STANDARD_WEBHOOK_SECRET_PREFIX.length);
  const decoded = strictBase64(serialized);
  if (decoded.length < 24 || decoded.length > 64) {
    return fail('INVALID_CONFIGURATION', 'PortOne V2 webhook credential is invalid.');
  }
  return decoded;
}

function resolveWebhookSecrets(values: readonly string[]): readonly Buffer[] {
  if (!Array.isArray(values) || values.length < 1 || values.length > 2) {
    return fail('INVALID_CONFIGURATION', 'PortOne V2 webhook credentials are invalid.');
  }
  return Object.freeze(values.map((value) => decodeWebhookSecret(value)));
}

function strictSignatureBase64(value: string): Buffer | null {
  const normalized = normalizeBase64(value);
  if (normalized === null) return null;
  const decoded = Buffer.from(normalized, 'base64');
  if (decoded.length !== 32 || decoded.toString('base64') !== normalized) return null;
  return decoded;
}

function requireV1Signatures(
  headers: Readonly<Record<string, string>>,
): readonly Buffer[] {
  const header = requiredHeader(
    headers,
    'webhook-signature',
    PORTONE_V2_WEBHOOK_MAX_SIGNATURE_HEADER_LENGTH_V1,
  );
  const entries = header.split(' ');
  if (
    entries.length < 1 ||
    entries.length > PORTONE_V2_WEBHOOK_MAX_SIGNATURE_ENTRIES_V1 ||
    entries.some((entry) => entry.length === 0)
  ) {
    return fail('INVALID_SIGNATURE', 'PortOne V2 webhook signature verification failed.');
  }

  const signatures: Buffer[] = [];
  for (const entry of entries) {
    const separator = entry.indexOf(',');
    if (separator <= 0 || entry.indexOf(',', separator + 1) !== -1) {
      return fail('INVALID_SIGNATURE', 'PortOne V2 webhook signature verification failed.');
    }
    const version = entry.slice(0, separator);
    if (version !== 'v1') continue;
    const decoded = strictSignatureBase64(entry.slice(separator + 1));
    if (decoded === null) {
      return fail('INVALID_SIGNATURE', 'PortOne V2 webhook signature verification failed.');
    }
    signatures.push(decoded);
  }
  if (signatures.length === 0) {
    return fail('INVALID_SIGNATURE', 'PortOne V2 webhook signature verification failed.');
  }
  return Object.freeze(signatures);
}

function verifySignature(input: {
  readonly webhookId: string;
  readonly timestamp: string;
  readonly rawBody: Uint8Array;
  readonly secrets: readonly Buffer[];
  readonly signatures: readonly Buffer[];
}): void {
  for (const secret of input.secrets) {
    const digest = createHmac('sha256', secret)
      .update(input.webhookId, 'utf8')
      .update('.', 'utf8')
      .update(input.timestamp, 'utf8')
      .update('.', 'utf8')
      .update(input.rawBody)
      .digest();
    for (const signature of input.signatures) {
      if (digest.length === signature.length && timingSafeEqual(digest, signature)) return;
    }
  }
  return fail('INVALID_SIGNATURE', 'PortOne V2 webhook signature verification failed.');
}

function parseVerifiedPayload(rawBody: Uint8Array): Record<string, unknown> {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(rawBody);
  } catch {
    return fail('INVALID_WEBHOOK', 'PortOne V2 webhook payload is invalid.');
  }
  try {
    return plainRecord(JSON.parse(text) as unknown, 'PortOne V2 webhook payload');
  } catch (error) {
    if (error instanceof PortOneV2WebhookPaymentCompletionErrorV1) throw error;
    return fail('INVALID_WEBHOOK', 'PortOne V2 webhook payload is invalid.');
  }
}

function boundedString(value: unknown, label: string, maxLength: number): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maxLength ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    return fail('INVALID_WEBHOOK', `${label} is invalid.`);
  }
  return value;
}

function eventType(payload: Record<string, unknown>): string {
  return boundedString(payload.type, 'PortOne V2 webhook type', MAX_EVENT_TYPE_LENGTH);
}

function paidIngress(
  payload: Record<string, unknown>,
  environment: 'sandbox' | 'production',
): AuthenticatedCommerceProviderIngressV1 {
  const data = plainRecord(payload.data, 'PortOne V2 webhook data');
  const paymentId = boundedString(
    data.paymentId,
    'PortOne V2 webhook paymentId',
    MAX_PROVIDER_ID_LENGTH,
  );
  const transactionId = boundedString(
    data.transactionId,
    'PortOne V2 webhook transactionId',
    MAX_PROVIDER_ID_LENGTH,
  );
  return Object.freeze({
    provider: 'portone_v2',
    environment,
    providerRequestId: paymentId,
    providerTransactionId: transactionId,
  });
}

export function authenticatePortOneV2WebhookPaymentCompletionV1(input: {
  readonly request: PortOneV2WebhookRequestV1;
  readonly config: PortOneV2WebhookPaymentCompletionConfigV1;
}): AuthenticatedPortOneV2WebhookDecisionV1 {
  const config = snapshotWebhookConfig(input.config);
  if (
    config.environment !== 'sandbox' &&
    config.environment !== 'production'
  ) {
    return fail('INVALID_CONFIGURATION', 'PortOne V2 webhook environment is invalid.');
  }

  const rawBody = rawBodyBytes(input.request.rawBody);
  const headers = normalizeHeaders(input.request.headers);
  requireContentType(headers);
  const webhookId = requireWebhookId(headers);
  const now = resolveClock(config.now);
  const timestamp = requireTimestamp(headers, now);
  const signatures = requireV1Signatures(headers);
  const secrets = resolveWebhookSecrets(config.webhookSecrets);
  verifySignature({ webhookId, timestamp, rawBody, secrets, signatures });

  const payload = parseVerifiedPayload(rawBody);
  const type = eventType(payload);
  if (type !== PORTONE_V2_WEBHOOK_PAID_EVENT_V1) {
    return Object.freeze({
      kind: 'ignored',
      providerWebhookId: webhookId,
      eventType: type,
    });
  }

  return Object.freeze({
    kind: 'payment_completion',
    providerWebhookId: webhookId,
    authenticatedIngress: paidIngress(payload, config.environment),
  });
}

function preauthenticatedIngressAuthenticator(
  authenticatedIngress: AuthenticatedCommerceProviderIngressV1,
): CommerceProviderIngressAuthenticatorV1 {
  return Object.freeze({
    authenticate: async () => authenticatedIngress,
  });
}

export async function executePortOneV2WebhookPaymentCompletionV1(input: {
  readonly pool: PostgresSubjectPoolV1;
  readonly request: PortOneV2WebhookRequestV1;
  readonly config: PortOneV2WebhookPaymentCompletionConfigV1;
  readonly verificationAdapter: CommercePaymentVerificationAdapterV1;
}): Promise<PortOneV2WebhookPaymentCompletionExecutionV1> {
  const decision = authenticatePortOneV2WebhookPaymentCompletionV1({
    request: input.request,
    config: input.config,
  });
  if (decision.kind === 'ignored') return decision;

  const completed = await executeAuthenticatedCommerceProviderPaymentCompletionV1({
    pool: input.pool,
    ingress: Object.freeze({ providerWebhookId: decision.providerWebhookId }),
    authenticator: preauthenticatedIngressAuthenticator(decision.authenticatedIngress),
    verificationAdapter: input.verificationAdapter,
  });

  return Object.freeze({
    kind: 'completed',
    providerWebhookId: decision.providerWebhookId,
    ...completed,
  });
}