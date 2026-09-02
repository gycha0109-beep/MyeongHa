import { randomUUID } from 'node:crypto';
import { createProductionGuestBootstrapHttpRuntimeV1 } from '../../apps/api/src/production-guest-bootstrap-http-runtime.js';

let runtime: ReturnType<typeof createProductionGuestBootstrapHttpRuntimeV1> | undefined;

function getRuntime(): ReturnType<typeof createProductionGuestBootstrapHttpRuntimeV1> {
  runtime ??= createProductionGuestBootstrapHttpRuntimeV1({
    env: process.env,
  });
  return runtime;
}

export default {
  async fetch(request: Request): Promise<Response> {
    return getRuntime().handleRequest({
      request,
      requestId: randomUUID(),
      serverTime: new Date().toISOString(),
    });
  },
};
