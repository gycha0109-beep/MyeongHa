import { createServer, type RequestListener } from 'node:http';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import {
  createSajuProductionCalculationHttpAdapterV1,
  SajuProductionCalculationHttpAdapterErrorV1,
  toSajuProductionCalculationApiErrorV1,
} from '../apps/api/src/saju-production-calculation-http-adapter.js';
// @ts-expect-error Runtime Worker is a JavaScript module without TypeScript declarations.
import worker from '../cloudflare/myeongha-worker.mjs';

const BIRTH = {
  birthRevisionRef: 'birth-revision:synthetic-chaos:1',
  calendarType: 'solar',
  birthDate: '2001-07-14',
  birthTime: '15:20:00',
  timeKnown: true,
  isLeapMonth: false,
  sex: 'unspecified',
} as const;
const SENSITIVE = 'synthetic-secret-must-never-escape';

async function listen(handler: RequestListener) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('missing local server port');
  return {
    server,
    origin: 'http://127.0.0.1:' + address.port,
    async stop() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close(error => error ? reject(error) : resolve()));
    },
  };
}
function adapter(origin: string, bearerToken = SENSITIVE) {
  return createSajuProductionCalculationHttpAdapterV1({
    baseUrl: origin, bearerToken, timeoutMs: 80,
  });
}
async function codeOf(promise: Promise<unknown>) {
  const error: unknown = await promise.then(() => null, reason => reason);
  expect(error).toBeInstanceOf(SajuProductionCalculationHttpAdapterErrorV1);
  return (error as SajuProductionCalculationHttpAdapterErrorV1);
}
async function health() {
  const response = await worker.fetch(new Request('https://myeongha.synthetic/api/health'), {});
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
}

describe('Phase 7 bounded Saju outage on actual loopback TCP, not mocked fetch', () => {
  it('rejects a killed upstream socket and leaves the Worker health route healthy', async () => {
    const local = await listen((_req, res) => res.end('not used'));
    const origin = local.origin;
    await local.stop();
    const error = await codeOf(adapter(origin).calculate(BIRTH));
    expect(error.code).toBe('NETWORK_FAILURE');
    expect(error.message).not.toContain(SENSITIVE);
    await health();
  });

  it.each(['slow-headers', 'slow-body'] as const)(
    'bounds %s at the real HTTP transport and keeps independent liveness available',
    async scenario => {
      let accepted = 0;
      const local = await listen((req, res) => {
        accepted++;
        if (req.method !== 'POST' || req.url !== '/api/calculations') {
          res.writeHead(404).end();
          return;
        }
        if (scenario === 'slow-headers') {
          setTimeout(() => { if (!res.destroyed) {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end('{}');
          } }, 400);
        } else {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.flushHeaders();
          res.write('{');
          setTimeout(() => { if (!res.destroyed) res.end('}'); }, 400);
        }
      });
      try {
        const started = performance.now();
        const error = await codeOf(adapter(local.origin).calculate(BIRTH));
        const durationMs = performance.now() - started;
        expect(error.code).toBe('TIMEOUT');
        expect(durationMs).toBeLessThan(1500);
        expect(accepted).toBe(1);
        expect(toSajuProductionCalculationApiErrorV1(error).code)
          .toBe('SAJU_TEMPORARILY_UNAVAILABLE');
        await health();
      } finally {
        await local.stop();
      }
    },
  );

  it('rejects wrong Saju bearer without retry or upstream credential reflection', async () => {
    let accepted = 0;
    const local = await listen((req, res) => {
      accepted++;
      expect(req.url).toBe('/api/calculations');
      expect(req.method).toBe('POST');
      if (req.headers.authorization !== 'Bearer local-correct-token') {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ reason: SENSITIVE }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
    try {
      const error = await codeOf(adapter(local.origin).calculate(BIRTH));
      expect(error.code).toBe('HTTP_4XX');
      expect(error.httpStatus).toBe(401);
      expect(error.message).not.toContain(SENSITIVE);
      const publicError = toSajuProductionCalculationApiErrorV1(error);
      expect(JSON.stringify(publicError)).not.toContain(SENSITIVE);
      expect(publicError.code).toBe('SAJU_TEMPORARILY_UNAVAILABLE');
      expect(accepted).toBe(1);
      await health();
    } finally {
      await local.stop();
    }
  });
});
