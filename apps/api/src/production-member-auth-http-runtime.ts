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
  readonly action: MemberAuthRateLimitActionV1;
}) => Promise<Response>;

export interface ProductionMemberAuthHttpRuntimeV1 {
  handleRequest(input: {
    readonly request: Request;
    readonly action: MemberAuthRateLimitActionV1;
  }): Promise<Response>;
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
      close: () => pool.close(),
    });
    return state;
  }

  return Object.freeze({
    async handleRequest(requestInput: {
      readonly request: Request;
      readonly action: MemberAuthRateLimitActionV1;
    }) {
      if (requestInput.request.method !== 'POST') {
        return authHandler({
          request: requestInput.request,
          env: input.env,
          action: requestInput.action,
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

      return handleMemberAuthRateLimitHttpV1({
        request: requestInput.request,
        action: requestInput.action,
        secret: currentState.secret,
        admissionPort: currentState.admissionPort,
        next: () => authHandler({
          request: requestInput.request,
          env: input.env,
          action: requestInput.action,
        }),
      });
    },
    async close() {
      await state?.close();
    },
  });
}
