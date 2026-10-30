import { describe, expect, it } from 'vitest';
import {
  measureSustainedLoopbackCapacity,
  SUSTAINED_LOOPBACK_SCHEMA_V1,
  validateSustainedLoopbackConfig,
} from '../scripts/measure-sustained-loopback-capacity.mjs';

function simulatedClock() {
  let time = 0;
  return {
    now: () => time,
    wait: async ms => { time += ms; await new Promise(resolve => setImmediate(resolve)); },
  };
}

const base = {
  port: 3000, path: '/api/health',
  durationSeconds: 300, maxRequestsPerSecond: 1, concurrency: 1,
};

describe('Phase 11 sustained local-only 5m/15m capacity evidence', () => {
  it('rejects remote/private/unbounded or unsupported load configurations', () => {
    expect(validateSustainedLoopbackConfig(base)).toEqual(base);
    for (const patch of [
      { path: '/api/me' }, { path: 'https://example.invalid/api/health' },
      { port: 0 }, { port: 65536 },
      { durationSeconds: 60 }, { durationSeconds: 901 },
      { maxRequestsPerSecond: 0 }, { maxRequestsPerSecond: 9 },
      { concurrency: 0 }, { concurrency: 9 },
    ]) {
      expect(() => validateSustainedLoopbackConfig({ ...base, ...patch }))
        .toThrow('only 5m/15m bounded 127.0.0.1');
    }
  });

  it('records a simulated five-minute envelope using only public loopback GETs', async () => {
    const simulated = simulatedClock();
    let calls = 0;
    const result = await measureSustainedLoopbackCapacity(
      base,
      async (url, options) => {
        calls++;
        expect(url).toBe('http://127.0.0.1:3000/api/health');
        expect(options).toMatchObject({
          method: 'GET', redirect: 'manual',
          headers: { 'Cache-Control': 'no-store' },
        });
        expect(options.body).toBeUndefined();
        return new Response('synthetic-secret-not-for-output', { status: 200 });
      },
      simulated.now, simulated.wait,
    );
    expect(calls).toBe(300);
    expect(result).toMatchObject({
      schema: SUSTAINED_LOOPBACK_SCHEMA_V1,
      configuredDurationSeconds: 300,
      scheduledSlots: 300, attemptedRequests: 300, skippedSlots: 0,
      successfulRequests: 300, non200Requests: 0,
      transportFailureRequests: 0, observedElapsedMs: 300000,
      target: '127.0.0.1-only',
      outputContainsIdentifiers: false,
      productionCapacityProven: false,
      isolatedDbSaturationCeilingProven: false,
      sajuCpuMemoryCeilingProven: false,
    });
    expect(JSON.stringify(result)).not.toContain('synthetic-secret');
  });

  it('keeps non-200 and transport failures visible across a simulated 15-minute envelope', async () => {
    const simulated = simulatedClock();
    let calls = 0;
    const result = await measureSustainedLoopbackCapacity(
      { ...base, durationSeconds: 900, maxRequestsPerSecond: 2, concurrency: 2 },
      async () => {
        calls++;
        if (calls === 1) throw new Error('private transport failure');
        return new Response(null, { status: calls === 2 ? 503 : 200 });
      },
      simulated.now, simulated.wait,
    );
    expect(result.scheduledSlots).toBe(1800);
    expect(result.attemptedRequests).toBe(1800);
    expect(result.successfulRequests).toBe(1798);
    expect(result.transportFailureRequests).toBe(1);
    expect(result.non200Requests).toBe(1);
    expect(result.observedElapsedMs).toBe(900000);
    expect(result.successfulLatencyP95Ms).not.toBeNull();
    expect(JSON.stringify(result)).not.toContain('private transport failure');
  });

  it('refuses unexpected redirects rather than publishing a usable capacity report', async () => {
    const simulated = simulatedClock();
    await expect(measureSustainedLoopbackCapacity(
      base,
      async () => new Response(null, {
        status: 302, headers: { location: 'https://example.invalid' },
      }),
      simulated.now, simulated.wait,
    )).rejects.toThrow('unsafe diagnostic response or measurement');
  });
});
