import { describe, expect, it } from 'vitest';
import {
  classifyCloudflarePreviewMetricRouteV1,
  summarizeCloudflarePreviewProbeMetricsV1,
} from '../scripts/cloudflare-preview-smoke-metrics.mjs';

const sample = (path, expectedStatus, actualStatus, elapsedMs) =>
  ({path,expectedStatus,actualStatus,elapsedMs});

describe('Cloudflare read-only Preview response-header wall-time metrics', () => {
  it('classifies only known route identifiers, never path params or query', () => {
    expect(classifyCloudflarePreviewMetricRouteV1('/',200)).toEqual({
      kind:'static',route:'static.root',
    });
    expect(classifyCloudflarePreviewMetricRouteV1('/index.html',200)).toEqual({
      kind:'static',route:'static.index.html',
    });
    expect(classifyCloudflarePreviewMetricRouteV1('/api/health',200)).toEqual({
      kind:'health',route:'api.health',
    });
    expect(classifyCloudflarePreviewMetricRouteV1('/api/readiness?token=SYNTHETIC_SECRET',404))
      .toEqual({kind:'api-denial',route:'api.readiness'});
    expect(classifyCloudflarePreviewMetricRouteV1(
      '/api/chat/SECRET-THREAD-ID/turns?state=SYNTHETIC_SECRET',503,
    )).toEqual({kind:'protected-hold',route:'rewrite.chat.turns'});
    expect(classifyCloudflarePreviewMetricRouteV1('/api/unported?foo=bar',404))
      .toEqual({kind:'api-denial',route:'api.unknown'});
  });

  it('keeps explicit 503 HOLD separate from unexpected 500 and 429', () => {
    const summary=summarizeCloudflarePreviewProbeMetricsV1([
      sample('/',200,200,3.25),
      sample('/index.html',200,200,10.11),
      sample('/api/health',200,200,6.7),
      sample('/api/health',405,405,10.2),
      sample('/api/chat/private-id/turns',503,503,20.01),
      sample('/api/auth/sign-in',404,429,30.6),
      sample('/api/readiness',404,500,50.5),
      sample('/api/unknown?token=SYNTHETIC_SECRET',404,null,40.5),
    ]);
    expect(summary.schema).toBe('myeongha-preview-http-probe-metrics-v1');
    expect(summary.requestAttempts).toBe(8);
    expect(summary.responses).toBe(7);
    expect(summary.transportFailures).toBe(1);
    expect(summary.unexpectedStatuses).toBe(3);
    expect(summary.http429).toBe(1);
    expect(summary.unexpected5xx).toBe(1);
    expect(summary.expectedHolds503).toBe(1);
    expect(summary.groups.static).toEqual({n:2,p50Ms:3.3,p95Ms:10.1,maxMs:10.1});
    expect(summary.groups.health).toEqual({n:2,p50Ms:6.7,p95Ms:10.2,maxMs:10.2});
    expect(summary.byRoute['rewrite.chat.turns'].n).toBe(1);
    const formatted=JSON.stringify(summary);
    expect(formatted).not.toContain('SYNTHETIC_SECRET');
    expect(formatted).not.toContain('private-id');
    expect(formatted).not.toContain('token=');
    expect(formatted).toContain('NOT a production traffic sample');
    expect(summary.notMeasured).toContain('workerCpuP50P95Max');
    expect(summary.notMeasured).toContain('cloudflareBilledCostUsd');
  });

  it('handles empty metrics without pretending to have CPU or a billing figure', () => {
    const summary=summarizeCloudflarePreviewProbeMetricsV1([]);
    expect(summary.requestAttempts).toBe(0);
    expect(summary.groups['protected-hold'])
      .toEqual({n:0,p50Ms:null,p95Ms:null,maxMs:null});
    expect(summary.byRoute).toEqual({});
    expect(summary.notMeasured).toContain('workerMemory');
  });

  it('rejects invalid or oversized samples without echoing secret inputs', () => {
    for (const samples of [
      null, Array.from({length:257},()=>sample('/',200,200,1)),
      [sample('/',200,200,NaN)],
      [sample('/',200,200,-1)],
      [sample('/',200,200,Infinity)],
      [sample('/',200,200,120001)],
      [sample('/',200,601,1)],
      [sample('/',200,undefined,1)],
      [sample('https://attacker.example.test/?token=SECRET',200,200,1)],
    ]) {
      expect(() => summarizeCloudflarePreviewProbeMetricsV1(samples))
        .toThrow(/Invalid/);
    }
  });
});
