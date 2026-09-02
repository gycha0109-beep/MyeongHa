import { randomUUID } from 'node:crypto';
import { createProductionBirthProfileReadRuntimeV1 } from '../../apps/api/src/production-birth-profile-read-runtime.js';

let runtime:
  | ReturnType<typeof createProductionBirthProfileReadRuntimeV1>
  | undefined;

function getRuntime(): ReturnType<typeof createProductionBirthProfileReadRuntimeV1> {
  runtime ??= createProductionBirthProfileReadRuntimeV1({ env: process.env });
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
