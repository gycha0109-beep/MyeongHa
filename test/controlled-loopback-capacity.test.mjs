import { describe, expect, it } from 'vitest';
import {
  LOOPBACK_CAPACITY_PROBE_SCHEMA_V1,
  measureControlledLoopbackCapacity,
  parseControlledCapacityConfig,
} from '../scripts/measure-controlled-loopback-capacity.mjs';

describe('Phase 11 bounded loopback-only diagnostic concurrency', () => {
  it('restricts endpoints, total requests and concurrent connections', () => {
    const good = { port: 4000, path: '/api/health', count: 20, concurrency: 2 };
    expect(parseControlledCapacityConfig(good)).toEqual(good);
    for (const patch of [
      { path: '/api/me' },
      { port: 0 }, { port: 99999 },
      { count: 19 }, { count: 501 },
      { concurrency: 0 }, { concurrency: 9 },
      { concurrency: 21, count: 20 },
    ]) {
      expect(() => parseControlledCapacityConfig({ ...good, ...patch }))
        .toThrow('fixed loopback-only diagnostic route');
    }
  });

  it('measures 200 and non200 observed outcomes without copying private responses', async () => {
    let active = 0, maxActive = 0, index = 0, time = 0;
    const result = await measureControlledLoopbackCapacity(
      { port: 4000, path: '/api/readiness', count: 20, concurrency: 4 },
      async (url, options) => {
        expect(url).toBe('http://127.0.0.1:4000/api/readiness');
        expect(options.method).toBe('GET');
        expect(options.redirect).toBe('manual');
        expect(options.headers).toEqual({ 'Cache-Control': 'no-store' });
        expect(options.body).toBeUndefined();
        active++;
        maxActive = Math.max(maxActive, active);
        const current = index++;
        await Promise.resolve();
        active--;
        return new Response(JSON.stringify({ private: 'do-not-output' }), {
          status: current % 5 === 0 ? 503 : 200,
        });
      },
      () => { time += 5; return time; },
    );
    expect(result).toMatchObject({
      schema: LOOPBACK_CAPACITY_PROBE_SCHEMA_V1,
      target: '127.0.0.1-only',
      route: '/api/readiness',
      requestedSamples: 20,
      requestedConcurrency: 4,
      completedSamples: 20,
      successfulSamples: 16,
      non200Samples: 4,
      transportFailureSamples: 0,
      productionCapacityProven: false,
      isolatedDbSaturationCeilingProven: false,
      sajuCpuMemoryCeilingProven: false,
      outputContainsIdentifiers: false,
    });
    expect(maxActive).toBeLessThanOrEqual(4);
    expect(maxActive).toBeGreaterThan(1);
    expect(result.observedPeakConcurrency).toBe(4);
    expect(result.successfulLatencyP95Ms).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain('do-not-output');
    expect(JSON.stringify(result)).not.toContain('http://');
  });

  it('counts failed requests as failures rather than pretending zero latency', async () => {
    let time = 0, n = 0;
    const result = await measureControlledLoopbackCapacity(
      { port: 4000, path: '/api/health', count: 20, concurrency: 1 },
      async () => {
        if (n++ === 0) throw new Error('synthetic private exception');
        return new Response(null, { status: 200 });
      },
      () => { time += 2; return time; },
    );
    expect(result.transportFailureSamples).toBe(1);
    expect(result.successfulSamples).toBe(19);
    expect(JSON.stringify(result)).not.toContain('synthetic private exception');
  });

  it('never reports success latency when all probes fail', async () => {
    let time = 0;
    const result = await measureControlledLoopbackCapacity(
      { port: 4000, path: '/api/health', count: 20, concurrency: 2 },
      async () => { throw new Error('synthetic failed connection'); },
      () => { time += 3; return time; },
    );
    expect(result.transportFailureSamples).toBe(20);
    expect(result.successfulLatencyP50Ms).toBeNull();
    expect(result.successfulLatencyP95Ms).toBeNull();
    expect(result.successfulLatencyP99Ms).toBeNull();
  });
});
