import { describe, expect, it } from 'vitest';
import {
  collectLoopbackApiBaseline,
  percentile,
  validateLoopbackBaselineConfig,
} from '../scripts/collect-loopback-api-performance-baseline.mjs';

describe('Phase 10 local API performance baseline', () => {
  it('computes p50/p95/p99 from monotonic sampled durations', () => {
    expect(percentile([40, 10, 20, 30, 50], 0.50)).toBe(30);
    expect(percentile([40, 10, 20, 30, 50], 0.95)).toBe(48);
    expect(percentile([40, 10, 20, 30, 50], 0.99)).toBe(49.6);
  });

  it('only accepts bounded loopback public diagnostic paths', () => {
    expect(() => validateLoopbackBaselineConfig({
      port: 54321, path: '/api/me', samples: 20, warmup: 0,
    })).toThrow('only bounded 127.0.0.1');
    expect(() => validateLoopbackBaselineConfig({
      port: 54321, path: '/api/health', samples: 10000, warmup: 0,
    })).toThrow('only bounded 127.0.0.1');
  });

  it('collects actual response-completion intervals without client identity or body output', async () => {
    let calls = 0;
    let time = 0;
    const result = await collectLoopbackApiBaseline({
      port: 54321, path: '/api/health', samples: 20, warmup: 2,
    }, async (url, options) => {
      calls++;
      expect(url).toBe('http://127.0.0.1:54321/api/health');
      expect(options.method).toBe('GET');
      expect(options.redirect).toBe('manual');
      expect(options.headers).toEqual({ 'Cache-Control': 'no-store' });
      expect(options.body).toBeUndefined();
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    }, () => { time += 10; return time; });

    expect(calls).toBe(22);
    expect(result).toMatchObject({
      target: '127.0.0.1-only',
      route: '/api/health',
      sampleCount: 20,
      warmupExcluded: 2,
      p50Ms: 10, p95Ms: 10, p99Ms: 10,
      productionBaselineProven: false,
      dependencyLatencyProven: false,
      outputContainsIdentifiers: false,
    });
    expect(result.measuredLatencyMs).toHaveLength(20);
    expect(JSON.stringify(result)).not.toContain('localhost:54321');
  });

  it('rejects failed diagnostic responses without reporting fictitious latency percentiles', async () => {
    await expect(collectLoopbackApiBaseline({
      port: 54321, path: '/api/readiness', samples: 20, warmup: 0,
    }, async () => new Response(null, { status: 503 })))
      .rejects.toThrow('observation not usable');
  });
});
