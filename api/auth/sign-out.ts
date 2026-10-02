import { executeSecurityObservedRequestV1 } from '../../apps/api/src/security-observability.js';
import { handleSupabaseAuthRequestV1 } from '../../apps/api/src/supabase-auth-http.js';

export const maxDuration = 10;

export default {
  fetch(request: Request): Promise<Response> {
    return executeSecurityObservedRequestV1({
      request,
      routeId: 'api.auth.sign-out',
      execute: () =>
        handleSupabaseAuthRequestV1({
          request,
          env: process.env,
          action: 'sign-out',
        }),
    });
  },
};
