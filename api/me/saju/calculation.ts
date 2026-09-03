import { randomUUID } from 'node:crypto';
import { createProductionCurrentSubjectSajuCalculationRuntimeV1 } from '../../../apps/api/src/production-current-subject-saju-calculation-runtime.js';

const NO_STORE_CACHE_CONTROL = 'no-store' as const;

let runtime: ReturnType<typeof createProductionCurrentSubjectSajuCalculationRuntimeV1> | undefined;

function getRuntime(): ReturnType<typeof createProductionCurrentSubjectSajuCalculationRuntimeV1> {
  runtime ??= createProductionCurrentSubjectSajuCalculationRuntimeV1({
    env: process.env,
  });
  return runtime;
}

function withNoStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', NO_STORE_CACHE_CONTROL);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const response = await getRuntime().handleRequest({
      request,
      requestId: randomUUID(),
      serverTime: new Date().toISOString(),
    });
    return withNoStore(response);
  },
};
