import { randomUUID } from 'node:crypto';
import { createProductionCurrentSubjectSajuPreviewReadingRuntimeV1 } from '../../../apps/api/src/production-current-subject-saju-preview-reading-runtime.js';

const NO_STORE_CACHE_CONTROL = 'no-store' as const;

let runtime:
  | ReturnType<typeof createProductionCurrentSubjectSajuPreviewReadingRuntimeV1>
  | undefined;

function getRuntime(): ReturnType<typeof createProductionCurrentSubjectSajuPreviewReadingRuntimeV1> {
  runtime ??= createProductionCurrentSubjectSajuPreviewReadingRuntimeV1({
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

function reportRouteFailure(): Response {
  console.error('MyeongHa Saju Preview Reading route failed.');
  return new Response('Internal Server Error', {
    status: 500,
    headers: {
      'Cache-Control': NO_STORE_CACHE_CONTROL,
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

export interface CurrentSubjectSajuPreviewReadingRouteRuntimeV1 {
  handleRequest(input: {
    readonly request: Request;
    readonly requestId: string;
    readonly serverTime: string;
  }): Promise<Response>;
}

export function createCurrentSubjectSajuPreviewReadingRouteV1(
  runtimePort: CurrentSubjectSajuPreviewReadingRouteRuntimeV1,
): { fetch(request: Request): Promise<Response> } {
  return {
    async fetch(request: Request): Promise<Response> {
      try {
        return withNoStore(
          await runtimePort.handleRequest({
            request,
            requestId: randomUUID(),
            serverTime: new Date().toISOString(),
          }),
        );
      } catch {
        return reportRouteFailure();
      }
    },
  };
}

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      return await createCurrentSubjectSajuPreviewReadingRouteV1(getRuntime()).fetch(request);
    } catch {
      return reportRouteFailure();
    }
  },
};
