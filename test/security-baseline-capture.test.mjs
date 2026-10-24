import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSecurityBaselineCapture } from '../scripts/collect-security-baseline.mjs';
import { analyzeSecurityEventBaseline, parseSecurityEventText } from '../scripts/analyze-security-event-baseline.mjs';
import { analyzeSajuAbuseBaseline, parseSajuAbuseObservationText } from '../scripts/analyze-saju-abuse-baseline.mjs';
import { executeSecurityObservedRequestV1 } from '../apps/api/src/security-observability.js';

const from = '2026-10-23T00:00:00.000Z';
const to = '2026-10-23T00:10:00.000Z';
const clientKey = 'a'.repeat(64);
const exclusions = { schemaVersion: 'myeongha-saju-abuse-synthetic-exclusions-v1', requests: [] };
const capture = (overrides = {}) => ({ file: 'logs.jsonl', from, to, recordCount: 3, recordLimit: 100, retentionLimited: false, ...overrides });
const manifest = (captures = [capture()]) => ({ schemaVersion: 'myeongha-security-baseline-capture-input-v1', captures });
const admission = (overrides = {}) => ({ schemaVersion: 'myeongha-saju-abuse-observation-v1', mode: 'observe_only', routeId: 'api.me.saju.calculation', subjectKind: 'member', clientKeyVersion: 'myeongha-saju-abuse-client-hmac-sha256-v1', clientKey, requestId: 'request-a', occurredAt: from, ...overrides });
const security = (overrides = {}) => ({ schemaVersion: 'myeongha-security-event-v1', owasp: ['A09:2025'], eventCode: 'ACCESS_DENIED', severity: 'warning', routeId: 'api.me.dispatch', method: 'POST', status: 401, requestId: 'request-a', occurredAt: from, durationMs: 20, ...overrides });
const encode = (events) => events.map((event) => JSON.stringify({ message: `${event.schemaVersion === 'myeongha-security-event-v1' ? 'MYEONGHA_SECURITY_EVENT ' : 'MYEONGHA_SAJU_ABUSE_OBSERVATION '}${JSON.stringify(event)}` })).join('\n');
const build = (events, options = {}) => buildSecurityBaselineCapture({ manifest: manifest(), captures: [encode(events)], syntheticExclusions: exclusions, ...options });

describe('general security baseline implementation', () => {
  it('consumes actual runtime emitter events and separates 401, 403 and 429', async () => {
    const events = [];
    for (const status of [401, 403, 429]) {
      await executeSecurityObservedRequestV1({
        request: new Request('https://example.test', { method: 'POST' }),
        routeId: 'api.me.dispatch', requestIdFactory: () => `request-${status}`,
        now: () => Date.parse(from), eventWriter: (event) => events.push(event),
        execute: () => new Response(null, { status }),
      });
    }
    const report = build(events);
    expect(report.security.statusDistribution).toEqual({ 401: 1, 403: 1, 429: 1 });
    expect(report.security.byEventCode.ACCESS_DENIED.totalEvents).toBe(2);
    expect(report.security.byEventCode.RATE_LIMITED.totalEvents).toBe(1);
    expect(report.decision).toMatchObject({ numericAdmissionPolicy: 'HOLD', enforcementAuthorized: false, issueClosureAllowed: false });
  });

  it('reads structured JSONL and merges overlapping captures without doubling either signal', () => {
    const text = encode([admission(), security()]);
    const report = buildSecurityBaselineCapture({ manifest: manifest([capture(), capture()]), captures: [text, text], syntheticExclusions: exclusions });
    expect(report.saju.authenticatedAttempts.total).toBe(1);
    expect(report.saju.inputQuality.exactDuplicateEventCount).toBe(1);
    expect(report.security.totalEvents).toBe(1);
    expect(report.security.inputQuality.exactDuplicateEventCount).toBe(1);
    expect(report.collectionQuality.queryGaps).toEqual([]);
    expect(report.collectionQuality.completePopulationProven).toBe(false);
  });

  it('keeps separate route observations and exceptional send events for a single request', () => {
    const failed = { status: 500, severity: 'error', owasp: ['A09:2025', 'A10:2025'] };
    const events = [security(), security({ routeId: 'api.auth.refresh' }), security({ ...failed, eventCode: 'SERVER_FAILURE' }), security({ ...failed, eventCode: 'UNEXPECTED_EXCEPTION' })];
    expect(build(events).security.totalEvents).toBe(4);
    expect(() => build([security(), security({ status: 403 })])).toThrow(/conflicting duplicate/u);
  });

  it('excludes registered synthetic traffic from both analyzers and strips extra payload', () => {
    const secret = 'SECRET_CANARY_VALUE';
    const report = build([admission({ token: secret }), security({ password: secret })], {
      syntheticExclusions: { ...exclusions, requests: [{ requestId: 'request-a', reason: 'synthetic test', evidenceRef: 'fixture-1' }] },
    });
    expect(report.saju.authenticatedAttempts.total).toBe(0);
    expect(report.security.totalEvents).toBe(0);
    expect(report.security.inputQuality.syntheticExcludedEventCount).toBe(1);
    const serialized = JSON.stringify(report);
    for (const value of [secret, clientKey, 'request-a', 'logs.jsonl']) expect(serialized).not.toContain(value);
  });

  it('reports query gaps, cap hits and retention limits without asserting completeness', () => {
    const report = buildSecurityBaselineCapture({
      manifest: manifest([capture({ recordCount: 100 }), capture({ from: '2026-10-23T00:20:00Z', to: '2026-10-23T00:30:00Z', retentionLimited: true })]),
      captures: [encode([security()]), ''], syntheticExclusions: exclusions,
    });
    expect(report.collectionQuality).toMatchObject({
      capReached: true, retentionLimited: true, completePopulationProven: false,
      queryGaps: [{ from: to, to: '2026-10-23T00:20:00.000Z' }],
    });
  });

  it('treats an empty capture as an unknown population', () => {
    const report = build([], { manifest: manifest([capture({ recordCount: 0 })]) });
    expect(report.security.totalEvents).toBe(0);
    expect(report.collectionQuality.completePopulationProven).toBe(false);
    expect(report.decision.securityAlertThreshold).toBe('HOLD');
  });

  it.each([
    capture({ to: from }), capture({ recordCount: -1 }), capture({ recordLimit: 2 }),
    capture({ retentionLimited: undefined }), capture({ from: '2026-02-30T00:00:00Z' }),
  ])('rejects malformed query metadata', (invalid) => {
    expect(() => build([], { manifest: manifest([invalid]) })).toThrow();
  });

  it('rejects out-of-window events and zero-record captures with events', () => {
    expect(() => build([security({ occurredAt: to })])).toThrow();
    expect(() => build([security()], { manifest: manifest([capture({ recordCount: 0 })]) })).toThrow();
  });

  it('rejects malformed event JSON without echoing payload, status/code drift and temporal inversion', () => {
    for (const parse of [parseSecurityEventText, parseSajuAbuseObservationText]) {
      const prefix = parse === parseSecurityEventText ? 'MYEONGHA_SECURITY_EVENT ' : 'MYEONGHA_SAJU_ABUSE_OBSERVATION ';
      let error;
      try { parse(prefix + '{"token":"SECRET_CANARY_VALUE"'); } catch (caught) { error = caught; }
      expect(error.message).not.toContain('SECRET_CANARY_VALUE');
      expect(error.message).toContain('malformed');
    }
    expect(() => analyzeSecurityEventBaseline({ events: [security({ status: 429 })] })).toThrow();
    expect(() => analyzeSajuAbuseBaseline({ events: [admission(), { schemaVersion: 'myeongha-saju-abuse-outcome-v1', mode: 'observe_only', routeId: 'api.me.saju.calculation', requestId: 'request-a', httpStatus: 200, completedAt: '2026-10-22T23:59:00Z' }] })).toThrow(/precedes/u);
  });

  it('runs the CLI, resolves relative inputs, merges exclusions and preserves existing output', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'myeongha-security-'));
    try {
      const manifestPath = join(directory, 'manifest.json');
      const output = join(directory, 'report.json');
      await writeFile(join(directory, 'logs.jsonl'), encode([admission(), security()]));
      await writeFile(join(directory, 'synthetic.json'), JSON.stringify({ ...exclusions, requests: [{ requestId: 'request-a', reason: 'synthetic', evidenceRef: 'fixture' }] }));
      await writeFile(manifestPath, JSON.stringify({ ...manifest(), additionalSyntheticFile: 'synthetic.json' }));
      const args = [resolve('scripts/collect-security-baseline.mjs'), manifestPath, '--output', output];
      execFileSync(process.execPath, args);
      const first = await readFile(output, 'utf8');
      expect(JSON.parse(first).security.totalEvents).toBe(0);
      const second = spawnSync(process.execPath, args, { encoding: 'utf8' });
      expect(second.status).toBe(1);
      expect(second.stderr).toContain('SECURITY_BASELINE_INPUT_REJECTED');
      expect(second.stdout).toBe('');
      expect(await readFile(output, 'utf8')).toBe(first);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
