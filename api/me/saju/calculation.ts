import { randomUUID } from 'node:crypto';
import { createProductionCurrentSubjectSajuCalculationRuntimeV1 } from '../../../apps/api/src/production-current-subject-saju-calculation-runtime.js';
import { hasRequestBodyWithoutDrainingV1 } from '../../../apps/api/src/request-body-presence-probe.js';

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

async function toBodyPresenceBoundRequest(request: Request): Promise<Request> {
  if (request.method !== 'POST') return request;

  const hasBody = await hasRequestBodyWithoutDrainingV1(request);
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.delete('transfer-encoding');

  return new Request(request.url, {
    method: request.method,
    headers,
    ...(hasBody ? { body: new Uint8Array([1]) } : {}),
  });
}

export interface CurrentSubjectSajuCalculationRouteRuntimeV1 {
  handleRequest(input: {
    readonly request: Request;
    readonly requestId: string;
    readonly serverTime: string;
  }): Promise<Response>;
}

export function createCurrentSubjectSajuCalculationRouteV1(
  runtimePort: CurrentSubjectSajuCalculationRouteRuntimeV1,
): { fetch(request: Request): Promise<Response> } {
  return {
    async fetch(request: Request): Promise<Response> {
      try {
        const response = await runtimePort.handleRequest({
          request: await toBodyPresenceBoundRequest(request),
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
}

export default {
  async fetch(request: Request): Promise<Response> {
    return createCurrentSubjectSajuCalculationRouteV1(getRuntime()).fetch(request);
  },
};
