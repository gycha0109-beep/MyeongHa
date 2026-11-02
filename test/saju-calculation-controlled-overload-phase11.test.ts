import { createServer } from 'node:http';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import {
  createSajuProductionCalculationHttpAdapterV1,
  SajuProductionCalculationHttpAdapterErrorV1,
  toSajuProductionCalculationApiErrorV1,
} from '../apps/api/src/saju-production-calculation-http-adapter.js';

const SYNTHETIC_BIRTH = {
  birthRevisionRef: 'birth-revision:phase11-synthetic:1',
  calendarType: 'solar',
  birthDate: '2001-07-14',
  birthTime: '15:20:00',
  timeKnown: true,
  isLeapMonth: false,
  sex: 'unspecified',
} as const;
const SYNTHETIC_TOKEN = 'synthetic-phase11-only-token';
const REQUESTS = 32;
const CONCURRENCY = 8;
const UPSTREAM_LIMIT = 2;

describe('Phase 11 bounded concurrent Saju dependency rejection on real loopback HTTP', () => {
  it('keeps rejected concurrent calls bounded, never retries, and does not reveal upstream response contents', async () => {
    let active = 0;
    let peakActive = 0;
    let observed = 0;
    let rejected = 0;
    const server = createServer((req, res) => {
      observed++;
      if (req.method !== 'POST' || req.url !== '/api/calculations' ||
          req.headers.authorization !== 'Bearer ' + SYNTHETIC_TOKEN) {
        res.writeHead(400).end();
        return;
      }
      if (active >= UPSTREAM_LIMIT) {
        rejected++;
        res.writeHead(429, { 'content-type': 'application/json' });
        res.end('{"private":"synthetic-upstream-error-do-not-expose"}');
        return;
      }
      active++;
      peakActive = Math.max(peakActive, active);
      setTimeout(() => {
        active--;
        if (!res.destroyed) {
          res.writeHead(503, { 'content-type': 'application/json' });
          res.end('{"private":"synthetic-upstream-error-do-not-expose"}');
        }
      }, 80);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw Error('missing ephemeral loopback port');
    const adapter = createSajuProductionCalculationHttpAdapterV1({
      baseUrl: 'http://127.0.0.1:' + addr.port,
      bearerToken: SYNTHETIC_TOKEN,
      timeoutMs: 1000,
    });
    let next = 0;
    const outcomes: Array<{ code: string; status: number | null }> = [];
    try {
      await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
        while (next < REQUESTS) {
          next++;
          const err = await adapter.calculate(SYNTHETIC_BIRTH).then(
            () => null,
            failure => failure as unknown,
          );
          expect(err).toBeInstanceOf(SajuProductionCalculationHttpAdapterErrorV1);
          const typed = err as SajuProductionCalculationHttpAdapterErrorV1;
          expect(['HTTP_4XX', 'HTTP_5XX']).toContain(typed.code);
          expect([429, 503]).toContain(typed.httpStatus);
          expect(typed.message).not.toContain('synthetic-upstream-error-do-not-expose');
          const publicError = toSajuProductionCalculationApiErrorV1(typed);
          expect(publicError.code).toBe('SAJU_TEMPORARILY_UNAVAILABLE');
          expect(JSON.stringify(publicError)).not.toContain(SYNTHETIC_TOKEN);
          expect(JSON.stringify(publicError)).not.toContain('synthetic-upstream-error-do-not-expose');
          outcomes.push({ code: typed.code, status: typed.httpStatus });
        }
      }));
      expect(outcomes).toHaveLength(REQUESTS);
      expect(observed).toBe(REQUESTS);
      expect(peakActive).toBeLessThanOrEqual(UPSTREAM_LIMIT);
      expect(rejected).toBeGreaterThan(0);
      expect(outcomes.some(x => x.status === 429)).toBe(true);
      expect(outcomes.some(x => x.status === 503)).toBe(true);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close(error => error ? reject(error) : resolve()));
    }
  }, 15_000);
});
