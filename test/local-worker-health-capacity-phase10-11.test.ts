import { createServer } from 'node:http';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Existing benchmark JavaScript module has no TypeScript declarations.
import { collectLoopbackApiBaseline } from '../scripts/collect-loopback-api-performance-baseline.mjs';
// @ts-expect-error Existing benchmark JavaScript module has no TypeScript declarations.
import { measureControlledLoopbackCapacity } from '../scripts/measure-controlled-loopback-capacity.mjs';
// @ts-expect-error Worker JavaScript entrypoint has no TypeScript declarations.
import worker from '../cloudflare/myeongha-worker.mjs';

const DIAGNOSTIC_PATH = '/api/health';

describe('Phase 10–11 strictly isolated loopback Worker diagnostic measurements', () => {
  it('measures response-time baseline and bounded concurrent health probes', async () => {
    const server = createServer(async (incoming, outgoing) => {
      if (incoming.method !== 'GET' || incoming.url !== DIAGNOSTIC_PATH) {
        outgoing.writeHead(404, { 'Cache-Control': 'no-store' });
        outgoing.end();
        return;
      }
      try {
        const response = await worker.fetch(
          new Request('https://myeongha.local' + DIAGNOSTIC_PATH, {
            method: 'GET', headers: { 'Cache-Control': 'no-store' },
          }), {},
        );
        const payload = Buffer.from(await response.arrayBuffer());
        outgoing.writeHead(response.status, {
          'content-type': response.headers.get('content-type') ?? 'application/json',
          'cache-control': 'no-store',
        });
        outgoing.end(payload);
      } catch {
        outgoing.writeHead(503, { 'cache-control': 'no-store' });
        outgoing.end();
      }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('Missing loopback address');

    try {
      const baseline = await collectLoopbackApiBaseline({
        port: address.port, path: DIAGNOSTIC_PATH, samples: 50, warmup: 5,
      });
      const normal = await measureControlledLoopbackCapacity({
        port: address.port, path: DIAGNOSTIC_PATH, count: 100, concurrency: 4,
      });
      const burst = await measureControlledLoopbackCapacity({
        port: address.port, path: DIAGNOSTIC_PATH, count: 100, concurrency: 8,
      });
      expect(baseline.sampleCount).toBe(50);
      for (const result of [normal, burst]) {
        expect(result.completedSamples).toBe(100);
        expect(result.successfulSamples).toBe(100);
        expect(result.non200Samples).toBe(0);
        expect(result.transportFailureSamples).toBe(0);
      }
      expect(normal.observedPeakConcurrency).toBeLessThanOrEqual(4);
      expect(burst.observedPeakConcurrency).toBeLessThanOrEqual(8);
      expect(burst.productionCapacityProven).toBe(false);
      expect(burst.isolatedDbSaturationCeilingProven).toBe(false);

      console.log('MYEONGHA_LOCAL_DIAGNOSTIC_BASELINE_PHASE10_11 ' + JSON.stringify({
        target: 'in-process Cloudflare Worker health via 127.0.0.1',
        productionBaselineProven: false,
        sqlAuthSajuLatencyProven: false,
        baseline: {
          n: baseline.sampleCount,
          p50Ms: baseline.p50Ms,
          p95Ms: baseline.p95Ms,
          p99Ms: baseline.p99Ms,
        },
        concurrency4: {
          n: normal.completedSamples,
          peak: normal.observedPeakConcurrency,
          successful: normal.successfulSamples,
          failures: normal.non200Samples + normal.transportFailureSamples,
          requestsPerSecond: normal.observedRequestsPerSecond,
          p95Ms: normal.successfulLatencyP95Ms,
        },
        concurrency8: {
          n: burst.completedSamples,
          peak: burst.observedPeakConcurrency,
          successful: burst.successfulSamples,
          failures: burst.non200Samples + burst.transportFailureSamples,
          requestsPerSecond: burst.observedRequestsPerSecond,
          p95Ms: burst.successfulLatencyP95Ms,
        },
      }));
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close(error => error ? reject(error) : resolve()));
    }
  }, 15_000);
});
