// Watchtower-Track: character-memory
// Disabled by default until the new owner-RLS migration and privacy audit exist.
import { randomUUID } from 'node:crypto';
import { executeSecurityObservedRequestV1 } from '../../apps/api/src/security-observability.js';
import { createProductionCharacterSharedMemoryRuntimeV1 } from '../../apps/api/src/production-character-shared-memory-runtime-v1.js';

const ROUTE = '/api/me/shared-memory' as const;
type Runtime = Readonly<{
  handleRequest(input: Readonly<{request: Request; requestId: string; serverTime: string}>): Promise<Response>;
}>;

export interface CreateCharacterSharedMemoryVercelHandlerInputV1 {
  readonly getRuntime: () => Runtime;
  readonly enabled: boolean;
  readonly requestIdFactory?: () => string;
}
let runtime: ReturnType<typeof createProductionCharacterSharedMemoryRuntimeV1> | undefined;
function getRuntime() {
  runtime ??= createProductionCharacterSharedMemoryRuntimeV1({ env: process.env });
  return runtime;
}
function noStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, { status: response.status, headers });
}
export function createCharacterSharedMemoryVercelHandlerV1(input: CreateCharacterSharedMemoryVercelHandlerInputV1) {
  return Object.freeze({
    fetch(request: Request): Promise<Response> {
      return executeSecurityObservedRequestV1({
        request,
        routeId: 'api.me.shared-memory',
        requestIdFactory: input.requestIdFactory ?? randomUUID,
        execute: async ({ requestId }) => {
          const url = new URL(request.url);
          const keys = [...url.searchParams.keys()];
          if (url.pathname !== ROUTE || url.hash !== '' ||
              keys.some(key => key !== '_vercel_share') ||
              url.searchParams.getAll('_vercel_share').length > 1) {
            return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
          }
          if (!input.enabled) {
            return Response.json({
              ok: false, error: { code: 'NOT_ENABLED', messageKey: 'shared_memory.unavailable', retryable: false },
              meta: { apiContractVersion: 'v0.9', requestId },
            }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
          }
          return noStore(await input.getRuntime().handleRequest({
            request, requestId, serverTime: new Date().toISOString(),
          }));
        },
      });
    },
  });
}
export default createCharacterSharedMemoryVercelHandlerV1({
  getRuntime,
  enabled: process.env.MYEONGHA_SHARED_MEMORY_ENABLED === '1',
});
