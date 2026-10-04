import { executeSecurityObservedRequestV1 } from '../../../apps/api/src/security-observability.js';
import { handleSocialAuthStartRequestV1 } from '../../../apps/api/src/social-auth-start-http.js';

export const maxDuration = 10;

export default {
  fetch(request: Request): Promise<Response> {
    return executeSecurityObservedRequestV1({
      request,
      routeId: 'api.auth.social.start',
      execute: () =>
        handleSocialAuthStartRequestV1({
          request,
          env: process.env,
        }),
    });
  },
};
