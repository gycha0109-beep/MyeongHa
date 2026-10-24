import { handleSocialAuthStartRequestV1 } from '../../apps/api/src/social-auth-start-http.js';
import { createApprovedPortOnePreenrollmentMemberBindingPortV1 } from '../../apps/api/src/portone-v2-approved-member-binding-v1.js';
import { extractPortOnePreenrollmentCookieV1 } from '../../apps/api/src/portone-v2-preenrollment-age-authority-v1.js';
import { resolveProductionPortOnePreenrollmentModeV1 } from '../../apps/api/src/portone-v2-preenrollment-http-runtime-v1.js';
import { createNodePostgresSubjectPoolV1 } from '../../apps/api/src/node-postgres-subject-pool.js';
import { parseProductionUserDataRuntimeConfigV1 } from '../../apps/api/src/production-user-data-runtime-config.js';
import { handleNaverOAuthBridgeRequestV1, type NaverOAuthBridgeActionV1 } from '../../apps/api/src/naver-oauth-bridge-http.js';
import { createProductionMemberAuthHttpRuntimeV1 } from '../../apps/api/src/production-member-auth-http-runtime.js';
import { executeSecurityObservedRequestV1 } from '../../apps/api/src/security-observability.js';

export const maxDuration = 10;

const SOCIAL_AUTH_START_PARAM = '__myeongha_social_auth_start' as const;
const NAVER_BRIDGE_PARAM = '__myeongha_naver_oauth_bridge' as const;
const SIGN_IN_TARGET = Object.freeze({
  kind: 'sign-in' as const,
  routeId: 'api.auth.sign-in' as const,
});
const SOCIAL_AUTH_START_TARGET = Object.freeze({
  kind: 'social-start' as const,
  routeId: 'api.auth.social.start' as const,
});

let runtime: ReturnType<typeof createProductionMemberAuthHttpRuntimeV1> | undefined;
let preenrollmentPool: ReturnType<typeof createNodePostgresSubjectPoolV1> | undefined;

function getPreenrollmentPool() {
  preenrollmentPool ??= createNodePostgresSubjectPoolV1(
    parseProductionUserDataRuntimeConfigV1(process.env),
  );
  return preenrollmentPool;
}

function getRuntime(): ReturnType<typeof createProductionMemberAuthHttpRuntimeV1> {
  runtime ??= createProductionMemberAuthHttpRuntimeV1({
    env: process.env,
  });
  return runtime;
}

type AuthDispatchTarget =
  | typeof SIGN_IN_TARGET
  | typeof SOCIAL_AUTH_START_TARGET
  | { readonly kind: 'naver-bridge'; readonly action: NaverOAuthBridgeActionV1; readonly routeId: string };

function resolveAuthDispatchTarget(request: Request): AuthDispatchTarget | null {
  const url = new URL(request.url);
  const socialMarkers = url.searchParams.getAll(SOCIAL_AUTH_START_PARAM);
  const naverMarkers = url.searchParams.getAll(NAVER_BRIDGE_PARAM);
  if (naverMarkers.length > 0) {
    const action = naverMarkers[0];
    if (socialMarkers.length > 0 || naverMarkers.length !== 1 || (action !== 'authorize' && action !== 'callback' && action !== 'token' && action !== 'userinfo')) return null;
    return { kind: 'naver-bridge', action, routeId: `api.auth.social.naver.${action}` };
  }
  if (socialMarkers.length === 0) return SIGN_IN_TARGET;
  if (socialMarkers.length === 1 && socialMarkers[0] === '1') {
    return SOCIAL_AUTH_START_TARGET;
  }
  return null;
}

function routeNotFound(): Response {
  return new Response(null, {
    status: 404,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function resolveAuthSignInDispatchForTestV1(
  request: Request,
): AuthDispatchTarget | null {
  return resolveAuthDispatchTarget(request);
}

export default {
  fetch(request: Request): Promise<Response> {
    const target = resolveAuthDispatchTarget(request);
    return executeSecurityObservedRequestV1({
      request,
      routeId: target?.routeId ?? SIGN_IN_TARGET.routeId,
      execute: () => {
        if (target === null) return routeNotFound();
        if (target.kind === 'naver-bridge') {
          return handleNaverOAuthBridgeRequestV1({ request, action: target.action, env: process.env });
        }
        if (target.kind === 'social-start') {
          try {
            let preenrollmentMemberPort;
            if (resolveProductionPortOnePreenrollmentModeV1(process.env) === 'enforce' &&
                extractPortOnePreenrollmentCookieV1(request) !== null) {
              preenrollmentMemberPort = createApprovedPortOnePreenrollmentMemberBindingPortV1({
                env: process.env, request, pool: getPreenrollmentPool(),
              }) ?? undefined;
            }
            return handleSocialAuthStartRequestV1({
              request,
              env: process.env,
              ...(preenrollmentMemberPort === undefined ? {} : { preenrollmentMemberPort }),
            });
          } catch {
            return Promise.resolve(Response.json({
              ok: false,
              error: { code: 'AGE_VERIFICATION_UNAVAILABLE', retryable: false },
            }, { status: 503, headers: { 'Cache-Control': 'no-store' } }));
          }
        }
        return getRuntime().handleRequest({
          request,
          action: 'sign-in',
        });
      },
    });
  },
};
