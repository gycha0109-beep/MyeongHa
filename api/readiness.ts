import { timingSafeEqual } from 'node:crypto';
import { Client, type ClientConfig } from 'pg';

import {
  PRODUCTION_POSTGRES_TLS_ACTIVATION_CANARY_ENV_V1,
  ProductionPostgresTlsActivationCanaryErrorV1,
  isProductionPostgresTlsActivationCanaryRuntimeV1,
  runProductionPostgresTlsActivationCanaryV1,
} from '../apps/api/src/production-postgres-tls-activation-canary.js';
import {
  PRODUCTION_POSTGRES_TLS_CANARY_ENV_V1,
  ProductionPostgresTlsCanaryErrorV1,
  isProductionPostgresTlsCanaryRuntimeV1,
  runProductionPostgresTlsPeerCanaryV1,
} from '../apps/api/src/production-postgres-tls-peer-canary.js';
import {
  evaluateProductionReadinessV1,
  type ProductionReadinessReportV1,
} from '../apps/api/src/production-readiness.js';
import type { ProductionSajuRuntimeEnvV1 } from '../apps/api/src/production-saju-runtime-config.js';

const GET_METHOD = 'GET' as const;
const POST_METHOD = 'POST' as const;
const NO_STORE_CACHE_CONTROL = 'no-store' as const;

function cancelUnusedRequestBodyBestEffort(request: Request): void {
  const body = request.body;
  if (body === null || request.bodyUsed) return;

  try {
    void body.cancel().catch(() => undefined);
  } catch {
    // Method rejection is authoritative; best-effort cleanup must never replace it.
  }
}

function methodNotAllowed(): Response {
  return new Response(null, {
    status: 405,
    headers: {
      Allow: GET_METHOD,
      'Cache-Control': NO_STORE_CACHE_CONTROL,
    },
  });
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorizeBearerToken(request: Request, token: unknown): boolean {
  if (typeof token !== 'string' || token.length < 32) return false;

  const header = request.headers.get('authorization');
  if (header === null || !header.startsWith('Bearer ')) return false;

  return safeEqual(header.slice('Bearer '.length), token);
}

function authorizeTlsCanary(request: Request): boolean {
  return authorizeBearerToken(
    request,
    process.env[PRODUCTION_POSTGRES_TLS_CANARY_ENV_V1.token],
  );
}

function authorizeTlsActivationCanary(request: Request): boolean {
  return authorizeBearerToken(
    request,
    process.env[PRODUCTION_POSTGRES_TLS_ACTIVATION_CANARY_ENV_V1.token],
  );
}

async function createTlsActivationCanaryResponse(
  request: Request,
): Promise<Response> {
  if (!authorizeTlsActivationCanary(request)) {
    return Response.json(
      { status: 'not_found' },
      { status: 404, headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL } },
    );
  }

  try {
    const evidence = await runProductionPostgresTlsActivationCanaryV1({
      env: process.env,
    });
    return Response.json(
      { status: 'pass', evidence },
      {
        status: 200,
        headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL },
      },
    );
  } catch (error) {
    const code =
      error instanceof ProductionPostgresTlsActivationCanaryErrorV1
        ? error.code
        : 'ACTIVATION_CANARY_UNEXPECTED_FAILURE';
    return Response.json(
      { status: 'fail', code },
      {
        status: 503,
        headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL },
      },
    );
  }
}

async function createTlsCanaryResponse(request: Request): Promise<Response> {
  if (!authorizeTlsCanary(request)) {
    return Response.json(
      { status: 'not_found' },
      { status: 404, headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL } },
    );
  }

  try {
    const evidence = await runProductionPostgresTlsPeerCanaryV1({
      env: process.env,
      createClient(config: ClientConfig) {
        const client = new Client(config);
        return {
          connect: async () => {
            await client.connect();
          },
          query: async (text: string) => {
            const result = await client.query(text);
            return { rows: result.rows as readonly Record<string, unknown>[] };
          },
          end: () => client.end(),
        };
      },
    });

    return Response.json(
      { status: 'pass', evidence },
      {
        status: 200,
        headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL },
      },
    );
  } catch (error) {
    const code =
      error instanceof ProductionPostgresTlsCanaryErrorV1
        ? error.code
        : 'CANARY_UNEXPECTED_FAILURE';
    return Response.json(
      { status: 'fail', code },
      {
        status: 503,
        headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL },
      },
    );
  }
}

export function createProductionReadinessResponseV1(
  env: ProductionSajuRuntimeEnvV1,
): Response {
  const report: ProductionReadinessReportV1 = evaluateProductionReadinessV1(env);
  return Response.json(report, {
    status: report.status === 'unready' ? 503 : 200,
    headers: {
      'Cache-Control': NO_STORE_CACHE_CONTROL,
    },
  });
}

export default {
  fetch(request: Request): Response | Promise<Response> {
    if (
      request.method === POST_METHOD &&
      isProductionPostgresTlsActivationCanaryRuntimeV1(process.env)
    ) {
      return createTlsActivationCanaryResponse(request);
    }

    if (
      request.method === POST_METHOD &&
      isProductionPostgresTlsCanaryRuntimeV1(process.env)
    ) {
      return createTlsCanaryResponse(request);
    }

    if (request.method !== GET_METHOD) {
      cancelUnusedRequestBodyBestEffort(request);
      return methodNotAllowed();
    }

    return createProductionReadinessResponseV1(process.env);
  },
};
