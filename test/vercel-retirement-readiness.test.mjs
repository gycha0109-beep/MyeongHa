import { describe, expect, it } from 'vitest';
import {
  CLOUDFLARE_ORIGIN, VERCEL_ORIGIN, RETIREMENT_EVIDENCE,
  evaluateVercelRetirementV1, runVercelRetirementAuditV1,
  parseVercelRetirementEvidenceV1,
} from '../scripts/verify-vercel-retirement-readiness.mjs';

const version = '123e4567-e89b-42d3-a456-426614174000';
const routes = ['/', '/index.html', '/auth.html', '/birth.html', '/chat.html',
  '/chat-hub.html', '/face-reading.html', '/hall.html', '/my.html',
  '/reading-detail.html', '/reading.html', '/records.html'];
const readiness = (http = 200, state = 'ready') =>
  ({ http, status: state, userData: state, sajuCalculation: state });
const happySnapshot = () => ({
  cloudflare: {
    health: 200, version, confirmationVersion: version,
    ready: readiness(), static: Object.fromEntries(routes.map(path => [path, 200])),
  },
  vercel: {
    health: 200, ready: readiness(),
    static: Object.fromEntries(routes.map(path => [path, 200])),
  },
});
const completeEvidence = () => Object.fromEntries(
  RETIREMENT_EVIDENCE.map(name => [name, true]),
);

function fixtureFetch(state = 'ready') {
  const requests = [];
  async function fetchImpl(uri, options) {
    requests.push({ uri, method: options.method, credentials: options.credentials,
      redirect: options.redirect });
    const { origin, pathname } = new URL(uri);
    expect([CLOUDFLARE_ORIGIN, VERCEL_ORIGIN]).toContain(origin);
    expect(['GET', 'HEAD']).toContain(options.method);
    const headers = new Headers();
    if (origin === CLOUDFLARE_ORIGIN && pathname.startsWith('/api/')) {
      headers.set('x-myeongha-worker-version', version);
    }
    if (options.method === 'HEAD') {
      headers.set('content-type', 'text/html');
      return new Response(null, { status: 200, headers });
    }
    headers.set('content-type', 'application/json');
    if (pathname === '/api/health') {
      return Response.json({ status: 'ok' }, { status: 200, headers });
    }
    if (pathname === '/api/readiness') {
      const isCf = origin === CLOUDFLARE_ORIGIN;
      const blocked = isCf && state !== 'ready';
      return Response.json({ status: blocked ? 'unready' : 'ready',
        capabilities: {
          userData: blocked ? 'unready' : 'ready',
          sajuCalculation: blocked ? 'degraded' : 'ready',
        },
      }, { status: blocked ? 503 : 200, headers });
    }
    throw Error('Unexpected test request');
  }
  return { fetchImpl, requests };
}

describe('read-only Vercel retirement gate', () => {
  it('requires pinned Git SHA and cited, separately attested gate evidence', () => {
    const gitSha = 'a'.repeat(40);
    const checks = Object.fromEntries(RETIREMENT_EVIDENCE.map(name => [
      name, { passed: true, evidenceRef: 'https://github.com/gycha0109-beep/MyeongHa/pull/2597' },
    ]));
    const parsed = parseVercelRetirementEvidenceV1({
      schemaVersion: 'myeongha-vercel-retirement-evidence-v1',
      workerVersion: version, gitSha, checks,
    });
    expect(parsed.approvedCustomDomain).toBe(true);
    expect(parsed.explicitFinalShutdownApproval).toBe(true);
    const snapshot = happySnapshot();
    snapshot.cloudflare.version = '223e4567-e89b-42d3-a456-426614174000';
    const mismatch = evaluateVercelRetirementV1(snapshot, parsed);
    expect(mismatch.blocked).toContain('EVIDENCE_VERSION_DRIFT');
    expect(parseVercelRetirementEvidenceV1({
      schemaVersion: 'myeongha-vercel-retirement-evidence-v1',
      workerVersion: version, gitSha,
      checks: { ...checks, explicitFinalShutdownApproval: {
        passed: true, evidenceRef: 'https://untrusted.example/approval',
      } },
    }).explicitFinalShutdownApproval).toBe(false);
    expect(() => parseVercelRetirementEvidenceV1({
      schemaVersion: 'myeongha-vercel-retirement-evidence-v1',
      workerVersion: version, gitSha: 'short', checks,
    })).toThrow(/identity/);
  });

  it('never interprets a healthy site as permission to shut down', () => {
    const report = evaluateVercelRetirementV1(happySnapshot());
    expect(report.result).toBe('HOLD');
    expect(report.blocked).toHaveLength(RETIREMENT_EVIDENCE.length);
    expect(report.shutdownExecuted).toBe(false);
  });

  it('requires strict DB, Saju and a stable exact deployed Worker version', () => {
    const snapshot = happySnapshot();
    snapshot.cloudflare.ready = readiness(503, 'unready');
    snapshot.cloudflare.confirmationVersion = '223e4567-e89b-42d3-a456-426614174000';
    const report = evaluateVercelRetirementV1(snapshot, completeEvidence());
    expect(report.blocked).toContain('CLOUDFLARE_USER_DATA_NOT_READY');
    expect(report.blocked).toContain('CLOUDFLARE_SAJU_NOT_READY');
    expect(report.blocked).toContain('WORKER_VERSION_UNPINNED');
  });

  it('requires Vercel fallback and every public static entry', () => {
    const snapshot = happySnapshot();
    snapshot.vercel.health = 503;
    snapshot.cloudflare.static['/chat.html'] = 404;
    const report = evaluateVercelRetirementV1(snapshot, completeEvidence());
    expect(report.blocked).toContain('VERCEL_STANDBY_NOT_HEALTHY');
    expect(report.blocked).toContain('STATIC_ROUTE_NOT_READY:/chat.html');
  });

  it('retirement eligibility still never performs shutdown', () => {
    const report = evaluateVercelRetirementV1(happySnapshot(), completeEvidence());
    expect(report.result).toBe('ELIGIBLE_FOR_MANUAL_RETIREMENT');
    expect(report.shutdownExecuted).toBe(false);
    expect(report.blocked).toEqual([]);
  });

  it('public smoke is read-only, pinned and redacted even while admission is 503', async () => {
    const { fetchImpl, requests } = fixtureFetch('unready');
    const report = await runVercelRetirementAuditV1({ fetchImpl, evidence: completeEvidence() });
    expect(report.result).toBe('HOLD');
    expect(report.blocked).toContain('CLOUDFLARE_USER_DATA_NOT_READY');
    expect(report.blocked).toContain('CLOUDFLARE_SAJU_NOT_READY');
    expect(report.cloudflareVersion).toBe(version);
    expect(requests).toHaveLength(29); // 24 HEAD + 5 GET
    expect(requests.every(r => r.credentials === 'omit' && r.redirect === 'error')).toBe(true);
    expect(requests.every(r => r.method === 'GET' || r.method === 'HEAD')).toBe(true);
  });

  it('unparseable or oversized readiness can never produce a release signal', async () => {
    const { fetchImpl } = fixtureFetch();
    const badFetch = async (url, init) => {
      if (new URL(url).origin === CLOUDFLARE_ORIGIN &&
          new URL(url).pathname === '/api/readiness') {
        return new Response('x'.repeat(9000), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      return fetchImpl(url, init);
    };
    const report = await runVercelRetirementAuditV1({
      fetchImpl: badFetch, evidence: completeEvidence(),
    });
    expect(report.result).toBe('HOLD');
    expect(report.blocked).toContain('CLOUDFLARE_USER_DATA_NOT_READY');
    expect(JSON.stringify(report)).not.toContain('xxxx');
  });
});
