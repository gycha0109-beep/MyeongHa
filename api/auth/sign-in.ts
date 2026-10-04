import { handleSocialAuthStartRequestV1 } from '../../apps/api/src/social-auth-start-http.js';
import { createProductionMemberAuthHttpRuntimeV1 } from '../../apps/api/src/production-member-auth-http-runtime.js';
import { executeSecurityObservedRequestV1 } from '../../apps/api/src/security-observability.js';

export const maxDuration = 10;

const SOCIAL_AUTH_START_PARAM = '__myeongha_social_auth_start' as const;
const SIGN_IN_TARGET = Object.freeze({
  kind: 'sign-in' as const,
  routeId: 'api.auth.sign-in' as const,
});
const SOCIAL_AUTH_START_TARGET = Object.freeze({
  kind: 'social-start' as const,
  routeId: 'api.auth.social.start' as const,
});

let runtime: ReturnType<typeof createProductionMemberAuthHttpRuntimeV1> | undefined;

function getRuntime(): ReturnType<typeof createProductionMemberAuthHttpRuntimeV1> {
  runtime ??= createProductionMemberAuthHttpRuntimeV1({
    env: process.env,
  });
  return runtime;
}

type AuthDispatchTarget =
  | typeof SIGN_IN_TARGET
  | typeof SOCIAL_AUTH_START_TARGET;

function resolveAuthDispatchTarget(request: Request): AuthDispatchTarget | null {
  const url = new URL(request.url);
  const socialMarkers = url.searchParams.getAll(SOCIAL_AUTH_START_PARAM);
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
        if (target.kind === 'social-start') {
          return handleSocialAuthStartRequestV1({
            request,
            env: process.env,
          });
        }
        return getRuntime().handleRequest({
          request,
          action: 'sign-in',
        });
      },
    });
  },
};
