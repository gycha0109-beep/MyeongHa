import {
  evaluateProductionReadinessV1,
  type ProductionReadinessReportV1,
} from '../apps/api/src/production-readiness.js';
import {
  parseProductionSajuRuntimeConfigV1,
  ProductionSajuRuntimeConfigErrorV1,
  type ProductionSajuRuntimeEnvV1,
} from '../apps/api/src/production-saju-runtime-config.js';

const GET_METHOD = 'GET' as const;
const NO_STORE_CACHE_CONTROL = 'no-store' as const;

function methodNotAllowed(): Response {
  return new Response(null, {
    status: 405,
    headers: {
      Allow: GET_METHOD,
      'Cache-Control': NO_STORE_CACHE_CONTROL,
    },
  });
}

function logSajuRuntimeConfigDiagnostic(env: ProductionSajuRuntimeEnvV1): void {
  try {
    parseProductionSajuRuntimeConfigV1(env);
    console.info('[readiness:saju-runtime-config]', {
      valid: true,
    });
  } catch (error) {
    if (error instanceof ProductionSajuRuntimeConfigErrorV1) {
      console.info('[readiness:saju-runtime-config]', {
        valid: false,
        reason: error.message,
      });
      return;
    }
    throw error;
  }
}

export function createProductionReadinessResponseV1(
  env: ProductionSajuRuntimeEnvV1,
): Response {
  const report: ProductionReadinessReportV1 = evaluateProductionReadinessV1(env);
  if (report.capabilities.sajuCalculation !== 'ready') {
    logSajuRuntimeConfigDiagnostic(env);
  }
  return Response.json(report, {
    status: report.status === 'unready' ? 503 : 200,
    headers: {
      'Cache-Control': NO_STORE_CACHE_CONTROL,
    },
  });
}

export default {
  fetch(request: Request): Response {
    if (request.method !== GET_METHOD) {
      return methodNotAllowed();
    }

    return createProductionReadinessResponseV1(process.env);
  },
};
