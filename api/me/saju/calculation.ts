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

function internalServerErrorNoStore(): Response {
  return new Response('Internal Server Error', {
    status: 500,
    headers: {
      'Cache-Control': NO_STORE_CACHE_CONTROL,
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      const response = await getRuntime().handleRequest({
        request,
        requestId: randomUUID(),
        serverTime: new Date().toISOString(),
      });
      return withNoStore(response);
    } catch {
      console.error('MyeongHa Saju calculation route failed.');
      return internalServerErrorNoStore();
    }
  },
};
