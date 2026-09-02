import { randomUUID } from 'node:crypto';
import { createProductionCurrentSubjectProfileRuntimeV1 } from '../apps/api/src/production-current-subject-profile-runtime.js';

let runtime: ReturnType<typeof createProductionCurrentSubjectProfileRuntimeV1> | undefined;

function getRuntime(): ReturnType<typeof createProductionCurrentSubjectProfileRuntimeV1> {
  runtime ??= createProductionCurrentSubjectProfileRuntimeV1({
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
