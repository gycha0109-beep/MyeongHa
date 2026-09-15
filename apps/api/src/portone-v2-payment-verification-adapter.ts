import {
  PRODUCTION_COMMERCE_EVIDENCE_FINGERPRINT_BINDING_V1,
  fingerprintProductionCommerceEvidenceV1,
  requireProductionCommerceEvidenceHmacK1SecretV1,
} from './production-commerce-evidence-fingerprint.js';
import type {
  CommercePaymentVerificationAdapterRequestV1,
  CommercePaymentVerificationAdapterResultV1,
  CommercePaymentVerificationAdapterV1,
} from './commerce-payment-verification-execution.js';

export const PORTONE_V2_PAYMENT_API_ORIGIN_V1 = 'https://api.portone.io' as const;
export const PORTONE_V2_PAYMENT_VERIFIER_REVISION_V1 =
  'portone-v2-payment-lookup-v1' as const;
export const PORTONE_V2_PAYMENT_HTTP_DEFAULT_TIMEOUT_MS_V1 = 5_000 as const;
export const PORTONE_V2_PAYMENT_HTTP_MAX_TIMEOUT_MS_V1 = 30_000 as const;
export const PORTONE_V2_PAYMENT_HTTP_MAX_RESPONSE_BYTES_V1 = 65_536 as const;

export type PortOneV2PaymentVerificationAdapterFailureCodeV1 =
  | 'INVALID_CONFIGURATION'
  | 'INVALID_REQUEST'
  | 'TIMEOUT'
  | 'NETWORK_FAILURE'
  | 'HTTP_4XX'
  | 'HTTP_5XX'
  | 'HTTP_UNEXPECTED_STATUS'
  | 'INVALID_CONTENT_TYPE'
  | 'RESPONSE_TOO_LARGE'
  | 'INVALID_JSON'
  | 'INVALID_PAYMENT';

export class PortOneV2PaymentVerificationAdapterErrorV1 extends Error {
  constructor(
    readonly code: PortOneV2PaymentVerificationAdapterFailureCodeV1,
    message: string,
    readonly httpStatus: number | null = null,
  ) {
    super(message);
    this.name = 'PortOneV2PaymentVerificationAdapterErrorV1';
  }
}

export interface PortOneV2PaymentHttpResponseV1 {
  readonly status: number;
  readonly headers: Readonly<{
    get(name: string): string | null;
  }>;
  readonly body?: Readonly<{
    cancel(reason?: unknown): Promise<void>;
  }> | null;
  text(): Promise<string>;
}

export interface PortOneV2PaymentHttpRequestInitV1 {
  readonly method: 'GET';
  readonly headers: Readonly<Record<string, string>>;
  readonly redirect: 'error';
  readonly signal: AbortSignal;
}

export type PortOneV2PaymentHttpFetchV1 = (
  url: string,
  init: PortOneV2PaymentHttpRequestInitV1,
) => Promise<PortOneV2PaymentHttpResponseV1>;

export interface PortOneV2PaymentVerificationAdapterConfigV1 {
  readonly apiSecret: string;
  readonly evidenceHmacSecret: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: PortOneV2PaymentHttpFetchV1;
  readonly now?: () => Date;
}

interface PortOneV2PaymentHttpDeadlineLeaseV1 {
  readonly response: PortOneV2PaymentHttpResponseV1;
  readonly deadline: Promise<never>;
  readonly didTimeout: () => boolean;
  readonly release: () => void;
}

interface NormalizedPortOneV2PaidPaymentV1 {
  readonly paymentId: string;
  readonly transactionId: string;
  readonly externalProductId: string;
  readonly environment: 'sandbox' | 'production';
  readonly currency: string;
  readonly amountMinor: number;
  readonly paidAt: string;
}

interface PortOneV2PaymentBodyReaderV1 {
  read(): Promise<Readonly<{ done: boolean; value?: Uint8Array }>>;
  cancel(reason?: unknown): Promise<void>;
  releaseLock(): void;
}

const CURRENCY = /^[A-Z]{3}$/u;
const RFC3339_DATE_TIME =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})[Tt](?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<fraction>\d+))?(?<zone>[Zz]|(?<offsetSign>[+-])(?<offsetHour>\d{2}):(?<offsetMinute>\d{2}))$/u;
const MAX_PROVIDER_ID_LENGTH = 512;

function fail(
  code: PortOneV2PaymentVerificationAdapterFailureCodeV1,
  message: string,
  httpStatus: number | null = null,
): never {
  throw new PortOneV2PaymentVerificationAdapterErrorV1(
    code,
    message,
    httpStatus,
  );
}

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail('INVALID_PAYMENT', `${label} is invalid.`);
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    return fail('INVALID_PAYMENT', `${label} is invalid.`);
  }
  return value as Record<string, unknown>;
}

function boundedIdentity(
  value: unknown,
  label: string,
  maxLength = MAX_PROVIDER_ID_LENGTH,
): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value ||
    value.length > maxLength
  ) {
    return fail('INVALID_PAYMENT', `${label} is invalid.`);
  }
  return value;
}

function resolveApiSecret(value: string): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > 4_096
  ) {
    throw new PortOneV2PaymentVerificationAdapterErrorV1(
      'INVALID_CONFIGURATION',
      'PortOne V2 API credential is invalid.',
    );
  }
  return value;
}

function resolveEvidenceHmacSecret(value: string): string {
  try {
    return requireProductionCommerceEvidenceHmacK1SecretV1(value);
  } catch {
    throw new PortOneV2PaymentVerificationAdapterErrorV1(
      'INVALID_CONFIGURATION',
      'Commerce evidence fingerprint credential is invalid.',
    );
  }
}

function resolveTimeoutMs(value: number | undefined): number {
  const timeoutMs = value ?? PORTONE_V2_PAYMENT_HTTP_DEFAULT_TIMEOUT_MS_V1;
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > PORTONE_V2_PAYMENT_HTTP_MAX_TIMEOUT_MS_V1
  ) {
    throw new PortOneV2PaymentVerificationAdapterErrorV1(
      'INVALID_CONFIGURATION',
      `PortOne V2 timeoutMs must be an integer between 1 and ${String(PORTONE_V2_PAYMENT_HTTP_MAX_TIMEOUT_MS_V1)}.`,
    );
  }
  return timeoutMs;
}

function resolvePaymentId(request: CommercePaymentVerificationAdapterRequestV1): string {
  if (request.provider !== 'portone_v2') {
    return fail(
      'INVALID_REQUEST',
      'PortOne V2 adapter requires the canonical portone_v2 provider.',
    );
  }
  try {
    return boundedIdentity(request.providerRequestId, 'PortOne V2 paymentId');
  } catch (error) {
    if (error instanceof PortOneV2PaymentVerificationAdapterErrorV1) {
      throw new PortOneV2PaymentVerificationAdapterErrorV1(
        'INVALID_REQUEST',
        'PortOne V2 paymentId is invalid.',
      );
    }
    throw error;
  }
}

function paymentUrl(paymentId: string): string {
  return `${PORTONE_V2_PAYMENT_API_ORIGIN_V1}/payments/${encodeURIComponent(paymentId)}`;
}

const defaultFetch: PortOneV2PaymentHttpFetchV1 = async (url, init) =>
  fetch(url, {
    method: init.method,
    headers: init.headers,
    redirect: init.redirect,
    signal: init.signal,
  });

function timeoutError(): PortOneV2PaymentVerificationAdapterErrorV1 {
  return new PortOneV2PaymentVerificationAdapterErrorV1(
    'TIMEOUT',
    'PortOne V2 payment lookup timed out.',
  );
}

async function fetchWithTimeout(input: {
  readonly fetchImpl: PortOneV2PaymentHttpFetchV1;
  readonly url: string;
  readonly apiSecret: string;
  readonly timeoutMs: number;
}): Promise<PortOneV2PaymentHttpDeadlineLeaseV1> {
  const controller = new AbortController();
  let timedOut = false;
  let released = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      const error = timeoutError();
      reject(error);
      controller.abort();
    }, input.timeoutMs);
  });

  const release = (): void => {
    if (released) return;
    released = true;
    if (timer !== undefined) clearTimeout(timer);
  };

  try {
    const response = await Promise.race([
      input.fetchImpl(input.url, {
        method: 'GET',
        headers: Object.freeze({
          accept: 'application/json',
          authorization: `PortOne ${input.apiSecret}`,
        }),
        redirect: 'error',
        signal: controller.signal,
      }),
      deadline,
    ]);

    return Object.freeze({
      response,
      deadline,
      didTimeout: () => timedOut,
      release,
    });
  } catch (error) {
    release();
    if (
      error instanceof PortOneV2PaymentVerificationAdapterErrorV1 &&
      error.code === 'TIMEOUT'
    ) {
      throw error;
    }
    if (timedOut) throw timeoutError();
    throw new PortOneV2PaymentVerificationAdapterErrorV1(
      'NETWORK_FAILURE',
      'PortOne V2 payment lookup failed before an HTTP response was accepted.',
    );
  }
}

function cancelUnusedResponseBody(response: PortOneV2PaymentHttpResponseV1): void {
  try {
    const body = response.body;
    if (body === undefined || body === null) return;
    void body.cancel().catch(() => undefined);
  } catch {
    return;
  }
}

function readResponseStatus(response: PortOneV2PaymentHttpResponseV1): number {
  try {
    const status: unknown = response.status;
    if (typeof status !== 'number' || !Number.isSafeInteger(status)) {
      throw new TypeError('PortOne V2 payment response status is invalid.');
    }
    return status;
  } catch {
    cancelUnusedResponseBody(response);
    return fail(
      'NETWORK_FAILURE',
      'PortOne V2 payment response status could not be read.',
    );
  }
}

function readResponseHeader(
  response: PortOneV2PaymentHttpResponseV1,
  name: string,
  status: number,
): string | null {
  try {
    const value: unknown = response.headers.get(name);
    if (value !== null && typeof value !== 'string') {
      throw new TypeError('PortOne V2 payment response header value is invalid.');
    }
    return value;
  } catch {
    cancelUnusedResponseBody(response);
    return fail(
      'NETWORK_FAILURE',
      'PortOne V2 payment response headers could not be read.',
      status,
    );
  }
}

function assertSuccessfulStatus(
  response: PortOneV2PaymentHttpResponseV1,
  status: number,
): void {
  if (status === 200) return;
  cancelUnusedResponseBody(response);
  if (status >= 400 && status <= 499) {
    return fail(
      'HTTP_4XX',
      'PortOne V2 payment lookup was rejected.',
      status,
    );
  }
  if (status >= 500 && status <= 599) {
    return fail(
      'HTTP_5XX',
      'PortOne V2 payment lookup failed upstream.',
      status,
    );
  }
  return fail(
    'HTTP_UNEXPECTED_STATUS',
    'PortOne V2 payment lookup returned an unsupported HTTP status.',
    status,
  );
}

function assertJsonContentType(
  response: PortOneV2PaymentHttpResponseV1,
  status: number,
): void {
  const contentType = readResponseHeader(response, 'content-type', status);
  if (
    contentType === null ||
    !/^application\/json(?:\s*;|$)/iu.test(contentType.trim())
  ) {
    cancelUnusedResponseBody(response);
    return fail(
      'INVALID_CONTENT_TYPE',
      'PortOne V2 payment lookup returned a non-JSON success response.',
      status,
    );
  }
}

function assertDeclaredBodyBound(
  response: PortOneV2PaymentHttpResponseV1,
  status: number,
): void {
  const contentLength = readResponseHeader(response, 'content-length', status);
  if (contentLength === null) return;
  if (!/^[0-9]+$/u.test(contentLength.trim())) {
    cancelUnusedResponseBody(response);
    return fail(
      'RESPONSE_TOO_LARGE',
      'PortOne V2 payment response body size could not be bounded.',
      status,
    );
  }
  if (Number(contentLength) > PORTONE_V2_PAYMENT_HTTP_MAX_RESPONSE_BYTES_V1) {
    cancelUnusedResponseBody(response);
    return fail(
      'RESPONSE_TOO_LARGE',
      'PortOne V2 payment response body exceeded the configured bound.',
      status,
    );
  }
}

function getResponseBodyReader(
  response: PortOneV2PaymentHttpResponseV1,
): PortOneV2PaymentBodyReaderV1 | null {
  const body = response.body as
    | (Readonly<{
        cancel(reason?: unknown): Promise<void>;
        getReader?: () => PortOneV2PaymentBodyReaderV1;
      }>)
    | null
    | undefined;
  if (body === undefined || body === null || typeof body.getReader !== 'function') {
    return null;
  }
  return body.getReader();
}

function mapBodyReadFailure(
  error: unknown,
  status: number,
  didTimeout: () => boolean,
): never {
  if (
    didTimeout() ||
    (error instanceof PortOneV2PaymentVerificationAdapterErrorV1 &&
      error.code === 'TIMEOUT')
  ) {
    throw timeoutError();
  }
  throw new PortOneV2PaymentVerificationAdapterErrorV1(
    'NETWORK_FAILURE',
    'PortOne V2 payment response body could not be read.',
    status,
  );
}

type PortOneV2PaymentBodyReadResultSnapshotV1 =
  | Readonly<{ done: true }>
  | Readonly<{
      done: false;
      value: Uint8Array;
      byteLength: number;
    }>;

function snapshotBodyReadResult(
  result: Readonly<{ done: boolean; value?: Uint8Array }>,
  status: number,
  didTimeout: () => boolean,
): PortOneV2PaymentBodyReadResultSnapshotV1 {
  try {
    const done = result.done;
    if (typeof done !== 'boolean') {
      throw new TypeError('PortOne V2 payment response body read result is invalid.');
    }
    if (done) {
      return Object.freeze({ done: true });
    }

    const value = result.value;
    if (!(value instanceof Uint8Array)) {
      throw new TypeError('PortOne V2 payment response body chunk is invalid.');
    }
    const byteLength = value.byteLength;
    if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
      throw new TypeError('PortOne V2 payment response body chunk length is invalid.');
    }

    return Object.freeze({
      done: false,
      value,
      byteLength,
    });
  } catch (error) {
    return mapBodyReadFailure(error, status, didTimeout);
  }
}

async function parseJsonResponse(
  response: PortOneV2PaymentHttpResponseV1,
  status: number,
  deadline: Promise<never>,
  didTimeout: () => boolean,
): Promise<unknown> {
  let reader: PortOneV2PaymentBodyReaderV1 | null;
  try {
    reader = getResponseBodyReader(response);
  } catch (error) {
    cancelUnusedResponseBody(response);
    return mapBodyReadFailure(error, status, didTimeout);
  }

  if (reader === null) {
    cancelUnusedResponseBody(response);
    throw new PortOneV2PaymentVerificationAdapterErrorV1(
      'NETWORK_FAILURE',
      'PortOne V2 payment response body could not be read.',
      status,
    );
  }

  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  let completed = false;
  let text: string;

  try {
    while (true) {
      let rawResult: Readonly<{ done: boolean; value?: Uint8Array }>;
      try {
        rawResult = await Promise.race([reader.read(), deadline]);
      } catch (error) {
        return mapBodyReadFailure(error, status, didTimeout);
      }

      const result = snapshotBodyReadResult(rawResult, status, didTimeout);
      if (result.done) {
        completed = true;
        break;
      }

      receivedBytes += result.byteLength;
      if (receivedBytes > PORTONE_V2_PAYMENT_HTTP_MAX_RESPONSE_BYTES_V1) {
        return fail(
          'RESPONSE_TOO_LARGE',
          'PortOne V2 payment response body exceeded the configured bound.',
          status,
        );
      }
      chunks.push(result.value);
    }

    try {
      text = new TextDecoder('utf-8', {
        fatal: true,
        ignoreBOM: true,
      }).decode(Buffer.concat(chunks, receivedBytes));
    } catch {
      return fail(
        'INVALID_JSON',
        'PortOne V2 payment lookup returned malformed JSON.',
        status,
      );
    }
  } finally {
    if (!completed) {
      try {
        void reader.cancel().catch(() => undefined);
      } catch {
      }
    }
    try {
      reader.releaseLock();
    } catch {
    }
  }

  if (Buffer.byteLength(text, 'utf8') > PORTONE_V2_PAYMENT_HTTP_MAX_RESPONSE_BYTES_V1) {
    return fail(
      'RESPONSE_TOO_LARGE',
      'PortOne V2 payment response body exceeded the configured bound.',
      status,
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return fail(
      'INVALID_JSON',
      'PortOne V2 payment lookup returned malformed JSON.',
      status,
    );
  }
}

function requireEnvironment(channelValue: unknown): 'sandbox' | 'production' {
  const channel = plainRecord(channelValue, 'PortOne V2 channel');
  if (channel.type === 'TEST') return 'sandbox';
  if (channel.type === 'LIVE') return 'production';
  return fail('INVALID_PAYMENT', 'PortOne V2 channel type is invalid.');
}

function requireAmountMinor(amount: unknown): number {
  const record = plainRecord(amount, 'PortOne V2 amount');
  const total = record.total;
  if (
    typeof total !== 'number' ||
    !Number.isSafeInteger(total) ||
    total <= 0
  ) {
    return fail('INVALID_PAYMENT', 'PortOne V2 amount.total is invalid.');
  }
  return total;
}

function requireExternalProductId(products: unknown): string {
  if (!Array.isArray(products) || products.length !== 1) {
    return fail(
      'INVALID_PAYMENT',
      'PortOne V2 payment must contain exactly one authoritative product.',
    );
  }
  const product = plainRecord(products[0], 'PortOne V2 payment product');
  return boundedIdentity(product.id, 'PortOne V2 payment product id');
}

function requireCurrency(value: unknown): string {
  if (typeof value !== 'string' || !CURRENCY.test(value)) {
    return fail('INVALID_PAYMENT', 'PortOne V2 payment currency is invalid.');
  }
  return value;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  const days = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return days[month - 1] ?? 0;
}

function canonicalFraction(fraction: string): string {
  if (fraction.length <= 3) return fraction.padEnd(3, '0');
  const trimmed = fraction.replace(/0+$/u, '');
  return trimmed.length < 3 ? trimmed.padEnd(3, '0') : trimmed;
}

function requirePaidAt(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
    return fail('INVALID_PAYMENT', 'PortOne V2 payment paidAt is invalid.');
  }

  const match = RFC3339_DATE_TIME.exec(value);
  const groups = match?.groups;
  if (groups === undefined) {
    return fail('INVALID_PAYMENT', 'PortOne V2 payment paidAt is invalid.');
  }

  const year = Number(groups.year);
  const month = Number(groups.month);
  const day = Number(groups.day);
  const hour = Number(groups.hour);
  const minute = Number(groups.minute);
  const second = Number(groups.second);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 60
  ) {
    return fail('INVALID_PAYMENT', 'PortOne V2 payment paidAt is invalid.');
  }

  const zone = groups.zone;
  if (zone === undefined) {
    return fail('INVALID_PAYMENT', 'PortOne V2 payment paidAt is invalid.');
  }

  let offsetMinutes = 0;
  if (!/^z$/iu.test(zone)) {
    const offsetHour = Number(groups.offsetHour);
    const offsetMinute = Number(groups.offsetMinute);
    const offsetSign = groups.offsetSign;
    if (
      (offsetSign !== '+' && offsetSign !== '-') ||
      !Number.isInteger(offsetHour) ||
      !Number.isInteger(offsetMinute) ||
      offsetHour < 0 ||
      offsetHour > 23 ||
      offsetMinute < 0 ||
      offsetMinute > 59
    ) {
      return fail('INVALID_PAYMENT', 'PortOne V2 payment paidAt is invalid.');
    }
    offsetMinutes =
      (offsetSign === '+' ? 1 : -1) * (offsetHour * 60 + offsetMinute);
  }

  const localSecond = second === 60 ? 59 : second;
  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, localSecond, 0);
  const occurredAtMs = local.getTime() - offsetMinutes * 60_000;
  if (!Number.isFinite(occurredAtMs)) {
    return fail('INVALID_PAYMENT', 'PortOne V2 payment paidAt is invalid.');
  }

  const utc = new Date(occurredAtMs);
  const iso = utc.toISOString();
  if (!/^\d{4}-/u.test(iso)) {
    return fail('INVALID_PAYMENT', 'PortOne V2 payment paidAt is invalid.');
  }

  let canonicalWholeSecond: string;
  if (second === 60) {
    const utcMonth = utc.getUTCMonth() + 1;
    const utcDay = utc.getUTCDate();
    if (
      utc.getUTCHours() !== 23 ||
      utc.getUTCMinutes() !== 59 ||
      !(
        (utcMonth === 6 && utcDay === 30) ||
        (utcMonth === 12 && utcDay === 31)
      )
    ) {
      return fail('INVALID_PAYMENT', 'PortOne V2 payment paidAt is invalid.');
    }
    canonicalWholeSecond = `${iso.slice(0, 17)}60`;
  } else {
    canonicalWholeSecond = iso.slice(0, 19);
  }

  return `${canonicalWholeSecond}.${canonicalFraction(groups.fraction ?? '')}Z`;
}

function normalizePaidPayment(
  value: unknown,
  expectedPaymentId: string,
): NormalizedPortOneV2PaidPaymentV1 {
  const payment = plainRecord(value, 'PortOne V2 payment');
  if (payment.status !== 'PAID') {
    return fail(
      'INVALID_PAYMENT',
      'PortOne V2 payment is not in the authoritative PAID state.',
    );
  }

  const paymentId = boundedIdentity(payment.id, 'PortOne V2 payment id');
  if (paymentId !== expectedPaymentId) {
    return fail('INVALID_PAYMENT', 'PortOne V2 payment identity mismatch.');
  }

  return Object.freeze({
    paymentId,
    transactionId: boundedIdentity(
      payment.transactionId,
      'PortOne V2 transaction id',
    ),
    externalProductId: requireExternalProductId(payment.products),
    environment: requireEnvironment(payment.channel),
    currency: requireCurrency(payment.currency),
    amountMinor: requireAmountMinor(payment.amount),
    paidAt: requirePaidAt(payment.paidAt),
  });
}

function requireVerifiedAt(now: () => Date): string {
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new PortOneV2PaymentVerificationAdapterErrorV1(
      'INVALID_CONFIGURATION',
      'PortOne V2 verification clock is invalid.',
    );
  }
  return value.toISOString();
}

function fingerprintEvidence(input: {
  readonly request: CommercePaymentVerificationAdapterRequestV1;
  readonly payment: NormalizedPortOneV2PaidPaymentV1;
  readonly evidenceHmacSecret: string;
}): string {
  const canonicalEvidence = JSON.stringify({
    schemaVersion: 'myeongha.portone-v2.payment-evidence-fingerprint.v1',
    provider: 'portone_v2',
    platform: input.request.platform,
    environment: input.payment.environment,
    paymentId: input.payment.paymentId,
    transactionId: input.payment.transactionId,
    externalProductId: input.payment.externalProductId,
    currentState: 'active',
    amountMinor: input.payment.amountMinor,
    currency: input.payment.currency,
    paidAt: input.payment.paidAt,
    purchaseIntentId: input.request.purchaseIntentId,
  });

  return fingerprintProductionCommerceEvidenceV1({
    domain:
      PRODUCTION_COMMERCE_EVIDENCE_FINGERPRINT_BINDING_V1.domains
        .receiptEvidence,
    canonicalEvidenceBytes: Buffer.from(canonicalEvidence, 'utf8'),
    secret: input.evidenceHmacSecret,
  });
}

export function createPortOneV2PaymentVerificationAdapterV1(
  config: PortOneV2PaymentVerificationAdapterConfigV1,
): CommercePaymentVerificationAdapterV1 {
  const apiSecret = resolveApiSecret(config.apiSecret);
  const evidenceHmacSecret = resolveEvidenceHmacSecret(config.evidenceHmacSecret);
  const timeoutMs = resolveTimeoutMs(config.timeoutMs);
  const fetchImpl = config.fetchImpl ?? defaultFetch;
  const now = config.now ?? (() => new Date());

  return Object.freeze({
    async verify(
      request: CommercePaymentVerificationAdapterRequestV1,
    ): Promise<CommercePaymentVerificationAdapterResultV1> {
      const paymentId = resolvePaymentId(request);
      const lease = await fetchWithTimeout({
        fetchImpl,
        url: paymentUrl(paymentId),
        apiSecret,
        timeoutMs,
      });

      try {
        const { response } = lease;
        const status = readResponseStatus(response);
        assertSuccessfulStatus(response, status);
        assertJsonContentType(response, status);
        assertDeclaredBodyBound(response, status);
        const rawPayment = await parseJsonResponse(
          response,
          status,
          lease.deadline,
          lease.didTimeout,
        );
        const payment = normalizePaidPayment(rawPayment, paymentId);
        const verifiedAt = requireVerifiedAt(now);
        const evidenceFingerprint = fingerprintEvidence({
          request,
          payment,
          evidenceHmacSecret,
        });

        return Object.freeze({
          providerRequestId: paymentId,
          evidence: Object.freeze({
            schemaVersion: 'commerce-evidence-v2',
            provider: 'portone_v2',
            platform: request.platform,
            environment: payment.environment,
            externalTransactionId: payment.transactionId,
            externalProductId: payment.externalProductId,
            providerOccurredAt: payment.paidAt,
            currentState: 'active',
            ownerBinding: Object.freeze({
              kind: 'purchase_intent',
              purchaseIntentId: request.purchaseIntentId,
            }),
            evidenceFingerprint,
            verifierRevision: PORTONE_V2_PAYMENT_VERIFIER_REVISION_V1,
            verifiedAmountMinor: payment.amountMinor,
            verifiedCurrency: payment.currency,
            verifiedAt,
          }),
        });
      } finally {
        lease.release();
      }
    },
  });
}
