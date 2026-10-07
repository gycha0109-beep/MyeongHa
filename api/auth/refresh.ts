import { executeSecurityObservedRequestV1 } from '../../apps/api/src/security-observability.js';
import { createProductionMemberAuthHttpRuntimeV1 } from '../../apps/api/src/production-member-auth-http-runtime.js';
import { handleSupabaseAuthRequestV1 } from '../../apps/api/src/supabase-auth-http.js';

export const maxDuration = 10;

const SOCIAL_COMPLETE_PARAM = '__myeongha_social_complete' as const;

let runtime: ReturnType<typeof createProductionMemberAuthHttpRuntimeV1> | undefined;

function getRuntime(): ReturnType<typeof createProductionMemberAuthHttpRuntimeV1> {
  runtime ??= createProductionMemberAuthHttpRuntimeV1({
    env: process.env,
  });
  return runtime;
}

function isSocialCompleteRequest(request: Request): boolean {
  const url = new URL(request.url);
  const values = url.searchParams.getAll(SOCIAL_COMPLETE_PARAM);
  return values.length === 1 && values[0] === '1';
}

export default {
  fetch(request: Request): Promise<Response> {
    const socialComplete = isSocialCompleteRequest(request);
    return executeSecurityObservedRequestV1({
      request,
      routeId: socialComplete ? 'api.auth.social.complete' : 'api.auth.refresh',
      execute: () => socialComplete
        ? handleSupabaseAuthRequestV1({
            request,
            env: process.env,
            action: 'social-complete',
          })
        : getRuntime().handleRequest({
            request,
            action: 'refresh',
          }),
    });
  },
};
