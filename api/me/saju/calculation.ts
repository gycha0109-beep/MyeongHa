import { randomUUID } from 'node:crypto';
import { createProductionCurrentSubjectSajuCalculationRuntimeV1 } from '../../../apps/api/src/production-current-subject-saju-calculation-runtime.js';

let runtime: ReturnType<typeof createProductionCurrentSubjectSajuCalculationRuntimeV1> | undefined;

function getRuntime(): ReturnType<typeof createProductionCurrentSubjectSajuCalculationRuntimeV1> {
  runtime ??= createProductionCurrentSubjectSajuCalculationRuntimeV1({
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
