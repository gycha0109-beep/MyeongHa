import { randomBytes, randomUUID } from 'node:crypto';
import type {
  GuestBootstrapCredentialIssuerPortV1,
  IssuedGuestBootstrapCredentialV1,
} from './guest-bootstrap-command.js';
import type { ProductionUserDataRuntimeEnvV1 } from './production-user-data-runtime-config.js';

export const PRODUCTION_GUEST_BOOTSTRAP_ENV_V1 = Object.freeze({
  sessionTtlSeconds: 'MYEONGHA_GUEST_SESSION_TTL_SECONDS',
} as const);

export const PRODUCTION_GUEST_BEARER_PREFIX_V1 = 'myeongha_guest_v1_' as const;

export interface ProductionGuestBootstrapActivationConfigV1 {
  readonly guestSessionTtlSeconds: number;
}

export class ProductionGuestBootstrapActivationConfigErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductionGuestBootstrapActivationConfigErrorV1';
  }
}

function failConfig(message: string): never {
  throw new ProductionGuestBootstrapActivationConfigErrorV1(message);
}

export function parseProductionGuestBootstrapActivationConfigV1(
  env: ProductionUserDataRuntimeEnvV1,
): ProductionGuestBootstrapActivationConfigV1 {
  const name = PRODUCTION_GUEST_BOOTSTRAP_ENV_V1.sessionTtlSeconds;
  const raw = env[name];
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return failConfig(`Required production Guest bootstrap setting is missing: ${name}.`);
  }

  const value = raw.trim();
  if (!/^[1-9][0-9]*$/u.test(value)) {
    return failConfig(`${name} must be a positive whole number of seconds.`);
  }

  const guestSessionTtlSeconds = Number(value);
  if (!Number.isSafeInteger(guestSessionTtlSeconds) || guestSessionTtlSeconds <= 0) {
    return failConfig(`${name} must be a positive safe integer number of seconds.`);
  }

  return Object.freeze({ guestSessionTtlSeconds });
}

export interface CreateProductionGuestBootstrapCredentialIssuerInputV1 {
  readonly config: ProductionGuestBootstrapActivationConfigV1;
  readonly now?: () => Date;
  readonly generateUuid?: () => string;
  readonly generateBearerToken?: () => string;
}

function defaultBearerToken(): string {
  return `${PRODUCTION_GUEST_BEARER_PREFIX_V1}${randomBytes(32).toString('base64url')}`;
}

function requireUuid(name: string, value: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  ) {
    throw new Error(`Production Guest bootstrap issuer generated an invalid ${name}.`);
  }
  return value;
}

function requireOpaqueBearer(value: string): string {
  if (
    value.length < 32 ||
    value.length > 512 ||
    !/^[\x21-\x7E]+$/u.test(value) ||
    value.includes(',') ||
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(value)
  ) {
    throw new Error(
      'Production Guest bootstrap issuer generated a bearer outside the Guest transport contract.',
    );
  }
  return value;
}

function computeExpiry(now: Date, ttlSeconds: number): string {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) {
    throw new Error('Production Guest bootstrap issuer clock returned an invalid instant.');
  }

  const expiresMs = nowMs + ttlSeconds * 1000;
  if (!Number.isFinite(expiresMs)) {
    throw new Error('Production Guest bootstrap TTL cannot be represented as an expiry instant.');
  }

  const expiresAt = new Date(expiresMs);
  if (!Number.isFinite(expiresAt.getTime())) {
    throw new Error('Production Guest bootstrap TTL cannot be represented as an expiry instant.');
  }
  return expiresAt.toISOString();
}

/**
 * Creates server-owned Guest credentials only after an explicit TTL policy has
 * been supplied through the dedicated activation config. No default TTL exists.
 */
export function createProductionGuestBootstrapCredentialIssuerPortV1(
  input: CreateProductionGuestBootstrapCredentialIssuerInputV1,
): GuestBootstrapCredentialIssuerPortV1 {
  if (
    !Number.isSafeInteger(input.config.guestSessionTtlSeconds) ||
    input.config.guestSessionTtlSeconds <= 0
  ) {
    throw new ProductionGuestBootstrapActivationConfigErrorV1(
      'Production Guest bootstrap TTL must be an explicitly configured positive safe integer.',
    );
  }

  const now = input.now ?? (() => new Date());
  const generateUuid = input.generateUuid ?? randomUUID;
  const generateBearerToken = input.generateBearerToken ?? defaultBearerToken;

  return Object.freeze({
    issueGuestBootstrapCredential(): IssuedGuestBootstrapCredentialV1 {
      const subjectId = requireUuid('subject id', generateUuid());
      const guestSessionId = requireUuid('guest session id', generateUuid());
      const bearerToken = requireOpaqueBearer(generateBearerToken());
      const expiresAt = computeExpiry(now(), input.config.guestSessionTtlSeconds);

      return Object.freeze({
        subjectId,
        guestSessionId,
        bearerToken,
        expiresAt,
      });
    },
  });
}
