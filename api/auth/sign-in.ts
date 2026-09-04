import { handleSupabaseAuthRequestV1 } from '../../apps/api/src/supabase-auth-http.js';

export const maxDuration = 10;

export default {
  fetch(request: Request): Promise<Response> {
    return handleSupabaseAuthRequestV1({
      request,
      env: process.env,
      action: 'sign-in',
    });
  },
};
