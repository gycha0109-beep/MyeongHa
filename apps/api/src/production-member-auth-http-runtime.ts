import { denyUnverifiedInitialIdentityAdmissionV1 } from './portone-v2-preidentity-admission-v1.js';
import { createApprovedPortOnePreenrollmentMemberBindingPortV1 } from './portone-v2-approved-member-binding-v1.js';
import { resolveProductionPortOneVerifiedAgeModeV1 } from './portone-v2-age-enforcement-activation-v1.js';
import { resolveProductionPortOnePreenrollmentModeV1 } from './portone-v2-preenrollment-http-runtime-v1.js';
import {
  extractPortOnePreenrollmentCookieV1,
  fingerprintPortOnePreenrollmentBindingV1,
} from './portone-v2-preenrollment-age-authority-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import {
  createMemberAuthRateLimitUnavailableResponseV1,
  handleMemberAuthRateLimitHttpV1,
} from './member-auth-rate-limit-http.js';
import type {
  MemberAuthRateLimitActionV1,
  MemberAuthRateLimitAdmissionPortV1,
} from './member-auth-rate-limit.js';
import {
  createNodePostgresSubjectPoolV1,
  type NodePostgresSubjectPoolOptionsV1,
} from './node-postgres-subject-pool.js';
import { PostgresMemberAuthRateLimitAdmissionPortV1 } from './postgres-member-auth-rate-limit.js';
import {
  parseProductionMemberAuthRateLimitConfigV1,
} from './production-member-auth-rate-limit-config.js';
import {
  handleSupabaseAuthRequestV1,
  type SupabaseAuthActionV1,
  type SupabasePreenrollmentMemberBindingPortV1,
} from './supabase-auth-http.js';
import type {
  ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';

export const MEMBER_AUTH_RATE_LIMIT_POSTGRES_POOL_OPTIONS_V1 =
  Object.freeze<NodePostgresSubjectPoolOptionsV1>({
    maxConnectionsPerRuntime: 4,
    connectionTimeoutMs: 1_500,
    idleTimeoutMs: 5_000,
    statementTimeoutMs: 1_500,
  });

type MemberAuthUpstreamHandlerV1 = (input: {
  readonly request: Request;
  readonly env: ProductionUserDataRuntimeEnvV1;
  readonly action: SupabaseAuthActionV1;
  readonly preenrollmentMemberPort?: SupabasePreenrollmentMemberBindingPortV1;
}) => Promise<Response>;

type ProductionMemberAuthHttpRequestV1 =
  | Readonly<{
      request: Request;
      action: Exclude<MemberAuthRateLimitActionV1, 'refresh'>;
      authAction?: never;
    }>
  | Readonly<{
      request: Request;
      action: 'refresh';
      authAction?: 'social-complete';
    }>;

export interface ProductionMemberAuthHttpRuntimeV1 {
  handleRequest(
    input: ProductionMemberAuthHttpRequestV1,
  ): Promise<Response>;
  close(): Promise<void>;
}

export interface CreateProductionMemberAuthHttpRuntimeInputV1 {
  readonly env: ProductionUserDataRuntimeEnvV1;
  /** Test/runtime injection only. Production composes the governed PostgreSQL port. */
  readonly admissionPort?: MemberAuthRateLimitAdmissionPortV1;
  /** Test/runtime injection only. Production delegates to the existing Auth proxy. */
  readonly authHandler?: MemberAuthUpstreamHandlerV1;
}

type RuntimeStateV1 = Readonly<{
  secret: string;
  admissionPort: MemberAuthRateLimitAdmissionPortV1;
  pool?: PostgresSubjectPoolV1;
  close: () => Promise<void>;
}>;

export function createProductionMemberAuthHttpRuntimeV1(
  input: CreateProductionMemberAuthHttpRuntimeInputV1,
): ProductionMemberAuthHttpRuntimeV1 {
  let state: RuntimeStateV1 | undefined;
  const authHandler: MemberAuthUpstreamHandlerV1 = input.authHandler
    ?? ((authInput) => handleSupabaseAuthRequestV1(authInput));

  function getState(): RuntimeStateV1 {
    if (state !== undefined) return state;

    const config = parseProductionMemberAuthRateLimitConfigV1(input.env);
    if (input.admissionPort !== undefined) {
      state = Object.freeze({
        secret: config.authRateLimitSecret,
        admissionPort: input.admissionPort,
        close: async () => undefined,
      });
      return state;
    }

    const pool = createNodePostgresSubjectPoolV1(
      config,
      MEMBER_AUTH_RATE_LIMIT_POSTGRES_POOL_OPTIONS_V1,
    );
    state = Object.freeze({
      secret: config.authRateLimitSecret,
      admissionPort: new PostgresMemberAuthRateLimitAdmissionPortV1(pool),
      pool,
      close: () => pool.close(),
    });
    return state;
  }

  return Object.freeze({
    async handleRequest(
      requestInput:
        ProductionMemberAuthHttpRequestV1,
    ) {
      const authAction =
        requestInput.authAction ??
        requestInput.action;
      let preenrollmentBindingDigest: string | undefined;
      if (requestInput.request.method === 'POST' &&
          (authAction === 'sign-up' || authAction === 'social-complete')) {
        const denied = denyUnverifiedInitialIdentityAdmissionV1({
          env: input.env,
          surface: authAction === 'sign-up' ? 'member-sign-up' : 'social-complete',
        });
        if (denied !== null) {
          if (authAction !== 'sign-up' && authAction !== 'social-complete') return denied;
          try {
            if (resolveProductionPortOneVerifiedAgeModeV1(input.env) !== 'enforce' ||
                resolveProductionPortOnePreenrollmentModeV1(input.env) !== 'enforce') return denied;
            const rawNonce = extractPortOnePreenrollmentCookieV1(requestInput.request);
            const secret = input.env.MYEONGHA_PORTONE_PREENROLLMENT_BINDING_SECRET;
            if (rawNonce === null || typeof secret !== 'string') return denied;
            preenrollmentBindingDigest = fingerprintPortOnePreenrollmentBindingV1({
              rawNonce, secret,
            });
          } catch { return denied; }
        }
      }

      if (requestInput.request.method !== 'POST') {
        return authHandler({
          request: requestInput.request,
          env: input.env,
          action: authAction,
        });
      }

      let currentState: RuntimeStateV1;
      try {
        currentState = getState();
      } catch {
        return createMemberAuthRateLimitUnavailableResponseV1(
          requestInput.request,
        );
      }

      // The pre-account proof is read only after rate-limit admission. Its
      // atomic binding to a canonical Member occurs AFTER the trusted Supabase
      // UUID is received, and BEFORE any new session token is returned.
      if (preenrollmentBindingDigest !== undefined && currentState.pool === undefined) {
        return createMemberAuthRateLimitUnavailableResponseV1(requestInput.request);
      }
      const preenrollmentMemberPort =
        preenrollmentBindingDigest !== undefined && currentState.pool !== undefined
          ? createApprovedPortOnePreenrollmentMemberBindingPortV1({
              env: input.env,
              request: requestInput.request,
              pool: currentState.pool,
            }) ?? undefined
          : undefined;

      return handleMemberAuthRateLimitHttpV1({
        request: requestInput.request,
        action: requestInput.action,
        secret: currentState.secret,
        admissionPort: currentState.admissionPort,
        next: () => authHandler({
          request: requestInput.request,
          env: input.env,
          action: authAction,
          ...(preenrollmentMemberPort === undefined ? {} : { preenrollmentMemberPort }),
        }),
      });
    },
    async close() {
      await state?.close();
    },
  });
}
